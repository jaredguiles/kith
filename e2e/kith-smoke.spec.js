'use strict';

// SPA smoke suite (LAB-113 hardening item 6): login -> create contact ->
// add note -> search, run against docker-compose.dev.yml. Selectors are
// grounded in the real markup (server/public/js/app.js, contacts.js,
// events.js, components.js) — the SPA has no data-testid attributes, so
// this uses the stable ids/classes/name attrs those files already render.
//
// Login: the ONLY account the server seeds is `admin` / `changeme`
// (server/database/init.js `seed()`), with must_change_password=true
// (forced change on first login, SPEC §7.15). There is no separate
// test-user seed or open registration endpoint (server/routes/auth.js has
// no /register; server/routes/users.js user-creation requires an
// authenticated admin). So this suite logs in as that seeded admin and
// completes the forced password-change step as part of "login".
//
// This means a first run against a FRESH dev stack (fresh kith-dev-db
// volume) is required for the seed password to still be `changeme`:
//   docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v
//   docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d
//   npm run test:e2e
// Re-running against the SAME (non-reset) dev DB will find the admin
// password already changed by the prior run — loginAsAdmin() falls back to
// E2E_ADMIN_PASSWORD (default below) in that case so the suite isn't
// single-use, but a truly fresh volume is the documented/expected setup.

const { test, expect } = require('@playwright/test');

const SEED_PASSWORD = 'changeme';
const CHANGED_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'Playwright-Smoke-1!';

async function submitLogin(page, username, password) {
  await page.locator('#login-username').fill(username);
  await page.locator('#login-password').fill(password);
  await page.locator('#login-form button[type="submit"]').click();
}

async function completeForcedPasswordChange(page, currentPassword, newPassword) {
  await page.locator('#pw-current').fill(currentPassword);
  await page.locator('#pw-new').fill(newPassword);
  await page.locator('#pw-form button[type="submit"]').click();
}

// Logs in as the seeded admin, handling whichever of three states the
// server puts us in: forced password-change (fresh seed), a login error
// (seed password already changed by an earlier run of this suite), or
// straight into the app shell (already-changed password supplied first).
async function loginAsAdmin(page) {
  await page.goto('/');
  await submitLogin(page, 'admin', SEED_PASSWORD);

  const pwForm = page.locator('#pw-form');
  const loginError = page.locator('#login-error:not(.hidden)');
  const sidebarSearch = page.locator('#sidebar-search');

  const outcome = await Promise.race([
    pwForm.waitFor({ state: 'visible', timeout: 10_000 }).then(() => 'forced-change'),
    loginError.waitFor({ state: 'visible', timeout: 10_000 }).then(() => 'error'),
    sidebarSearch.waitFor({ state: 'visible', timeout: 10_000 }).then(() => 'app'),
  ]).catch(() => 'timeout');

  if (outcome === 'forced-change') {
    await completeForcedPasswordChange(page, SEED_PASSWORD, CHANGED_PASSWORD);
    await sidebarSearch.waitFor({ state: 'visible', timeout: 10_000 });
    return;
  }
  if (outcome === 'error') {
    await page.goto('/');
    await submitLogin(page, 'admin', CHANGED_PASSWORD);
    await sidebarSearch.waitFor({ state: 'visible', timeout: 10_000 });
    return;
  }
  if (outcome === 'app') return;
  throw new Error(
    'Login did not reach the forced password-change screen, an error, or the app shell within 10s.'
  );
}

test('login -> create contact -> add note -> search finds it', async ({ page }) => {
  await loginAsAdmin(page);

  // Unique-per-run so the smoke test is safe to re-run against a dev DB
  // that already has data in it from a previous run.
  const stamp = Date.now();
  const contactName = `E2E Smoke ${stamp}`;
  const noteText = `smoke-note-${stamp} playwright verification`;

  // ---- create contact (sidebar "New record" -> contact-form modal) ----
  await page.locator('[data-action="new-contact"]').first().click();
  const modal = page.locator('[data-modal="contact-form"]');
  await expect(modal).toBeVisible();
  await modal.locator('input[name="display_name"]').fill(contactName);
  await modal.locator('[data-action="save"]').click();

  // Save navigates to /contacts/:id and closes the modal (contacts.js
  // openContactForm() save handler).
  await expect(modal).toBeHidden();
  await expect(page.locator('h1.rec-name')).toHaveText(contactName);

  // ---- add a note (contact detail page's inline timeline widget) ----
  await page.locator('#quick-note').fill(noteText);
  await page.locator('#add-note').click();
  await expect(page.locator('#tl-items')).toContainText(noteText);

  // ---- search finds both the contact and the note ----
  await page.locator('#sidebar-search').focus(); // opens the command palette
  const cmdkInput = page.locator('.cmdk-input');
  await expect(cmdkInput).toBeVisible();

  await cmdkInput.fill(contactName);
  await expect(page.locator('.cmdk-item', { hasText: contactName })).toBeVisible();

  // `stamp` alone appears in both the contact's display name and the note
  // content, so this single query should surface both People and Notes hits.
  await cmdkInput.fill(String(stamp));
  await expect(page.locator('.cmdk-item', { hasText: contactName })).toBeVisible();
  await expect(page.locator('.cmdk-item', { hasText: noteText })).toBeVisible();
});
