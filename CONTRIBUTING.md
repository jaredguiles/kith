# Contributing to Kith

## Dev setup

```bash
git clone https://github.com/jaredguiles/kith && cd kith
npm ci
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
# → http://localhost:8084  (admin / changeme, forced password change)
```

The dev override compose file provides a throwaway MariaDB — never point dev
at a real database.

## Checks

Both must pass before a PR:

```bash
npm run lint   # ESLint (flat config, eslint.config.js)
npm test       # native Node test runner, server/test/*.test.js
```

Conventions worth knowing:

- **No build step, anywhere.** The frontend is vanilla-JS ES modules served
  statically; the server is CommonJS. Keep it that way.
- **Raw SQL** via `mysql2` — no ORM.
- Vendored frontend libraries live in `server/public/vendor/` and are excluded
  from linting; don't edit them.
- Security semantics (share scopes, confidential-layer gating, auth boundaries)
  are documented in `API.md` and `SPEC.md` — changes touching them need a very
  good reason and updated docs.

## Releases (maintainer)

Development happens on branches with CI (lint + test) running on a private
mirror; `main` on GitHub is the canonical, released state. Release flow:
update `CHANGELOG.md`, bump `package.json`, tag `vX.Y.Z`, push `main` + tags
to GitHub.

## Note

The `.gitlab-ci.yml` in this repo runs the lint/test pipeline on the
maintainer's CI mirror; GitHub ignores it. A GitHub Actions equivalent for
public PRs is on the roadmap.
