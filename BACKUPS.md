# Backing Up Kith

Kith ships its own database — the `bundled-db` Compose profile (see
`docker-compose.yml`) runs a MariaDB container alongside the app, with data
persisted in the `kith_db_data` named volume. There is no external managed
database to point a hosting provider's backup tool at, so backing up Kith
means backing up that container yourself. This doc covers what's already
built in (the JSON export endpoint) and what you need to add for a real,
restorable backup.

If you configured Kith against an **external** MariaDB/MySQL server instead
(`COMPOSE_PROFILES=` empty, `DB_HOST` pointed elsewhere — see the header
comment in `docker-compose.yml`), back that server up with whatever process
you already use for it; only the bundled-db path is covered here.

---

## What `GET /api/export/backup` gives you (and what it doesn't)

`server/routes/export.js` exposes an admin-only JSON export:

```
GET /api/export/backup
```

It dumps every application table (`users`, `contacts`, `contact_emails`,
`contact_phones`, `contact_addresses`, `social_links`, `tags`, `contact_tags`,
`groups`, `group_members`, `shared_contacts`, `events`, `event_contacts`,
`event_media`, `timeline_events`, `notes`, `reminders`, `messages`,
`media_assets`, `audit_log`, `contact_field_changelog`, `import_jobs`,
`app_settings`, `preferences`, `spicy_profiles`) as one JSON file, with
`password_hash`, `totp_secret`, and any other `*_hash` column stripped before
it leaves the server. `import_staging` is intentionally excluded — it holds
raw third-party import dumps, not durable data.

Useful for a portable, human-readable snapshot of your data, or as an input
to the importer on a fresh instance. **It is not a full backup**:

- **No media on disk.** `media_assets` rows describe photos/videos, but the
  actual files live in the `./data/media` and `./data/uploads` bind mounts
  (see `docker-compose.yml`), not in the database, and this endpoint doesn't
  touch them. Losing those directories loses the media even with a fresh
  JSON export in hand.
- **Spicy/encrypted content exports as ciphertext.** `spicy_profiles` and any
  spicy-gated note/message content are encrypted at rest with
  `FIELD_ENCRYPTION_KEY`. The export includes the ciphertext as-is — it's
  only useful for restore if you also have the same `FIELD_ENCRYPTION_KEY`
  the data was encrypted under. Back that key up (in a secrets manager, not
  in the repo) alongside any export that includes spicy content.
- **Not transactionally consistent with itself.** Tables are queried one at a
  time (see the `for (const t of tables)` loop in `export.js`), so under
  concurrent writes the dump isn't a single atomic snapshot. Fine for a
  personal instance with light traffic; not a substitute for a real DB dump
  if you need point-in-time consistency.

Treat the JSON export as a convenient supplementary/portability snapshot, and
the `mariadb-dump` below as the actual backup.

---

## Full database backup (`mariadb-dump`)

The `mariadb:11.4` image (see the `db` service in `docker-compose.yml`) ships
`mariadb-dump`. The container already has `MARIADB_USER`, `MARIADB_PASSWORD`,
and `MARIADB_DATABASE` set from your `.env` (`DB_USER`, `DB_PASSWORD`,
`DB_NAME` — defaults `kith`/`kith`/`kith` unless overridden), so you can dump
without echoing the password onto the host command line:

```bash
# from the directory containing docker-compose.yml
docker compose exec db sh -c \
  'mariadb-dump -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DATABASE"' \
  > kith-$(date +%F).sql
```

Or by container name, if you're not driving it through `docker compose`:

```bash
docker exec kith-db sh -c \
  'mariadb-dump -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DATABASE"' \
  > kith-$(date +%F).sql
```

This is a logical (SQL) dump — schema plus data as `INSERT` statements. It
does **not** include `./data/media` or `./data/uploads`; back those up
separately (e.g. `tar`/`rsync` of the two bind-mount directories, or a
snapshot of whatever volume backend they sit on).

---

## Scheduled backups (host cron)

Simplest approach: a cron job on the Docker host that dumps, compresses,
timestamps, and prunes old copies. No extra containers needed.

```cron
# /etc/cron.d/kith-backup
# Nightly DB dump at 03:00, gzip'd, 14-day rotation.
0 3 * * * root cd /opt/kith && \
  docker compose exec -T db sh -c 'mariadb-dump -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DATABASE"' \
  | gzip > /opt/kith/backups/kith-$(date +\%F).sql.gz 2>> /var/log/kith-backup.log && \
  find /opt/kith/backups -name 'kith-*.sql.gz' -mtime +14 -delete
```

Notes:

- `-T` disables `docker compose exec`'s pseudo-TTY allocation, which is
  required when piping its output (cron runs non-interactively anyway, but
  worth calling out if you adapt this into a manual script).
- Adjust `/opt/kith` to wherever your `docker-compose.yml` actually lives.
- If you also want media backed up on the same schedule, add a
  `tar -czf /opt/kith/backups/kith-media-$(date +%F).tar.gz -C /opt/kith/data media uploads`
  line and rotate it the same way — media directories can get large, so size
  your rotation window accordingly.
- For off-host durability, ship the resulting `.sql.gz` (and media archive,
  if included) to remote storage as a follow-on step (`rsync`, `rclone`,
  whatever you already use for other services) — this recipe only covers the
  local dump + rotation, not offsite copy.

---

## Restoring

1. **Stop the app** so nothing writes to the database mid-restore:
   ```bash
   docker compose stop kith
   ```
2. **Load the dump** into the running `db` container (works whether you're
   restoring into the existing database or a freshly recreated one — the
   dump includes `CREATE TABLE`/schema, so an empty `kith` database is fine,
   but a restore into a database with existing tables will conflict on
   `CREATE TABLE` unless you drop first):
   ```bash
   gunzip -c kith-2026-08-20.sql.gz | \
     docker compose exec -T db sh -c 'mariadb -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DATABASE"'
   ```
   (Drop `gunzip -c ... |` and read directly from the `.sql` file if it
   isn't compressed.)
3. **Restore media**, if you backed it up separately, into `./data/media` and
   `./data/uploads` before starting the app back up.
4. **Start the app**:
   ```bash
   docker compose start kith
   ```
5. If the dump includes spicy/encrypted content, confirm `FIELD_ENCRYPTION_KEY`
   in `.env` matches the key the backup was taken under — a mismatched key
   won't error loudly, it'll just leave spicy content undecryptable.

For a from-scratch restore onto a brand-new host (no existing `kith_db_data`
volume), bring the stack up once with `docker compose up -d db` first so the
container initializes an empty `kith` database, then follow steps 2–5 above.

---

## See also

- `server/routes/export.js` — the JSON export endpoint itself (`/api/export/backup`,
  plus the vCard/CSV/GEDCOM contact exports, which are unrelated to database
  backup and not covered here).
- [`API.md`](API.md) — full REST API reference, including auth requirements
  for the export endpoints.
- [`SPEC.md`](SPEC.md) — data model / table reference.
