'use strict';

// Playwright config for the Kith SPA smoke suite (LAB-113 hardening item 6).
//
// Targets docker-compose.dev.yml, which layers dev DB/env on top of
// docker-compose.yml AND republishes the app on a dev/test-only host port
// (DEV_EXTERNAL_PORT, default 8094) — see docker-compose.dev.yml. This is
// deliberately a different port than production's EXTERNAL_PORT (default
// 8084 in docker-compose.yml), so this suite can never silently hit a
// live production container even if someone forgets to bring up the dev
// stack first. DO NOT change the default below to 8084 or any value that
// matches production's EXTERNAL_PORT. Override E2E_BASE_URL only if your
// .env (not .env.dev — see docker-compose.dev.yml) sets a non-default
// DEV_EXTERNAL_PORT.
//
// Bring up the DEV stack first (never run against a stack that doesn't
// include docker-compose.dev.yml), then run the suite:
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
    // Dev/test-only port (see header comment) — must never equal production's EXTERNAL_PORT (8084).
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:8094',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
