# Kith (ContactForge)

> **Status: blank scaffold — rebuild in progress.**
> The previous ContactForge implementation was cleared out on 2026-07-06 to start
> fresh. Container was stopped/removed and the on-disk data dir on the application server
> (`/opt/kith/`, including `uploads/`) was wiped. No backup was kept
> (data was disposable).

Personal relationship and contact circle visualization tool.

## What's here now

- `docker-compose.yml` — Traefik/Authentik-wired compose template (`build: .`)
- `Dockerfile` — minimal Node scaffold that serves `/api/health` so deploys stay green
- `.env` — container metadata (no secrets)
- `files.json` — Ansible deploy manifest (files pushed to the VM)

## Deploy

- VM: **the application server** (service-host)
- URL: https://kith.example.com  (ext 8084 → int 3000)
- Secrets go in a secrets manager → rendered to `.secrets` on the VM (never committed).

Push to `main` → GitLab CI triggers `homelab/infra/ansible` to converge the VM.
