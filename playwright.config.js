'use strict';

// Playwright config for the Kith SPA smoke suite (LAB-113 hardening item 6).
//
// Targets docker-compose.dev.yml, which layers dev DB/env on top of
// docker-compose.yml but does NOT override the port mapping — the app is
// still published on "${EXTERNAL_PORT:-8084}:${INTERNAL_PORT:-3000}"
// (docker-compose.yml). Override E2E_BASE_URL if your .env sets a
// non-default EXTERNAL_PORT.
//
// Bring up the stack first, then run the suite:
//   docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d
//   npm run test:e2e
//
// Not wired into .gitlab-ci.yml: the shell runner has no Docker access
// (see .gitlab-ci.yml header comment), so this suite is local/manual only.

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:8084',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
