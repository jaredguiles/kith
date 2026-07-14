# Contributing to Kith

Thanks for your interest in Kith! Contributions of all kinds are welcome —
bug reports, feature ideas, documentation fixes, and code.

## Getting started

1. Fork and clone the repo.
2. Spin up the dev stack (throwaway MariaDB included):

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
   # → http://localhost:8084  (admin / changeme)
   ```

3. Or run natively with Node ≥ 24 against your own MariaDB:

   ```bash
   npm ci
   cp .env.example .env   # fill in DB + secrets
   npm start
   ```

## Running tests

```bash
npm test
```

Tests use the built-in Node test runner (`node --test`) and don't require a
database. Please make sure they pass before opening a PR, and add tests for
new logic where it makes sense.

## Project conventions

- **No build step.** The frontend is vanilla JS served statically from
  `server/public/` — no bundler, no framework. Keep it that way.
- **Dependency-light.** New runtime dependencies need a strong justification.
- **Single source of truth.** The database schema is created/migrated by the
  server at boot (`server/database/`).
- The visual system is documented in [`DESIGN.md`](DESIGN.md) ("The Record") —
  UI changes should follow it.
- The REST API is documented in [`API.md`](API.md) — keep it in sync with
  route changes.

## Pull requests

- Keep PRs focused — one feature or fix per PR.
- Use clear commit messages (`fix:`, `feat:`, `docs:`, `chore:` prefixes
  appreciated but not required).
- Describe *what* and *why* in the PR body; screenshots for UI changes help a
  lot.

## Reporting bugs & requesting features

Use the [issue templates](https://github.com/jaredguiles/kith/issues/new/choose).
For security issues, **do not open a public issue** — see
[SECURITY.md](SECURITY.md).
