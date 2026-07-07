'use strict';

// Geo features: geocode search, contact map pins, and an authenticated
// OSM-tile proxy with an on-disk forever-cache (browser gets 7-day caching).

const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const { pipeline } = require('node:stream/promises');
const { query } = require('../database/connection');
const { requireAuth, isAdmin } = require('../middleware/auth');
const { geocode, queryHash } = require('../lib/geo');

const router = express.Router();
router.use(requireAuth);

// ------------------------------------------------------------------ search
// GET /api/geo/search?q=  →  { lat, lng, label, source } | 404
router.get('/search', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'q is required' });
    if (q.length > 500) return res.status(400).json({ error: 'q too long' });
    const result = await geocode(q);
    if (!result) return res.status(404).json({ error: 'No match' });
    res.json(result);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------- contacts
// GET /api/geo/contacts → map pins for the requesting user's accessible
// contacts: geocoded addresses + free-text `location` fields resolved via
// geo_cache / local geonames (lazily computed, capped per call).
router.get('/contacts', async (req, res, next) => {
  try {
    // Same visibility scope as the contacts list: own + shared-in (admin: all).
    // Address pins only for scopes that expose addresses (full / full_spicy).
    const scopeWhere = isAdmin(req.user)
      ? ''
      : `AND (c.owner_user_id = ${Number(req.user.id)} OR EXISTS (
           SELECT 1 FROM shared_contacts sc WHERE sc.contact_id = c.id
             AND sc.shared_with_user_id = ${Number(req.user.id)}
             AND sc.share_scope IN ('full','full_spicy')))`;

    const addrRows = await query(
      `SELECT c.id AS contact_id, c.display_name, c.photo_url,
              ca.latitude, ca.longitude, ca.city, ca.state, ca.geocode_source
       FROM contact_addresses ca
       JOIN contacts c ON c.id = ca.contact_id
       WHERE c.deleted_at IS NULL AND ca.latitude IS NOT NULL AND ca.longitude IS NOT NULL
       ${scopeWhere}
       LIMIT 2000`
    );

    const pins = [];
    const pinned = new Set();
    for (const r of addrRows) {
      pins.push({
        contact_id: r.contact_id,
        display_name: r.display_name,
        photo_url: r.photo_url,
        lat: Number(r.latitude),
        lng: Number(r.longitude),
        label: [r.city, r.state].filter(Boolean).join(', ') || null,
        source: r.geocode_source || 'address',
      });
      pinned.add(r.contact_id);
    }

    // Free-text `location` pins for contacts without an address pin. Basic-scope
    // shares don't expose `location`, so restrict to own contacts + full shares.
    const locScope = isAdmin(req.user)
      ? ''
      : `AND (c.owner_user_id = ${Number(req.user.id)} OR EXISTS (
           SELECT 1 FROM shared_contacts sc WHERE sc.contact_id = c.id
             AND sc.shared_with_user_id = ${Number(req.user.id)}
             AND sc.share_scope IN ('full','full_spicy')))`;
    const locRows = await query(
      `SELECT c.id AS contact_id, c.display_name, c.photo_url, c.location
       FROM contacts c
       WHERE c.deleted_at IS NULL AND c.location IS NOT NULL AND c.location != ''
       ${locScope}
       LIMIT 2000`
    );

    let lookups = 0;
    const MAX_LOOKUPS = 200;
    const pending = locRows.filter((r) => !pinned.has(r.contact_id));

    // Batch-read the cache for all pending locations in one query
    const cacheByHash = new Map();
    if (pending.length) {
      const hashes = [...new Set(pending.map((r) => queryHash(r.location)))];
      const ph = hashes.map(() => '?').join(',');
      const cachedRows = await query(
        `SELECT query_hash, latitude, longitude, label, source FROM geo_cache WHERE query_hash IN (${ph})`,
        hashes
      );
      for (const c of cachedRows) cacheByHash.set(c.query_hash, c);
    }

    for (const r of pending) {
      let result = null;
      const cached = cacheByHash.get(queryHash(r.location));
      if (cached) {
        if (cached.latitude == null) continue; // cached miss
        result = { lat: Number(cached.latitude), lng: Number(cached.longitude), label: cached.label, source: cached.source };
      } else {
        if (lookups >= MAX_LOOKUPS) continue;
        lookups++;
        result = await geocode(r.location); // computes + caches (hit or miss)
      }
      if (!result) continue;
      pins.push({
        contact_id: r.contact_id,
        display_name: r.display_name,
        photo_url: r.photo_url,
        lat: result.lat,
        lng: result.lng,
        label: result.label,
        source: result.source,
      });
      pinned.add(r.contact_id);
    }

    res.json({ pins });
  } catch (err) { next(err); }
});

// ------------------------------------------------------------------- tiles
// GET /api/geo/tiles/:z/:x/:y.png — authenticated OSM tile proxy with an
// on-disk forever-cache. Browser cache: 7 days.
const TILE_CACHE_PATH = process.env.TILE_CACHE_PATH || '/app/uploads/tilecache';
const TILE_UPSTREAM = (process.env.TILE_UPSTREAM || 'https://tile.openstreetmap.org').replace(/\/+$/, '');
const TILE_UA = 'Kith-selfhosted/1.1 (personal CRM; contact admin@example.com)';

router.get('/tiles/:z/:x/:y.png', async (req, res, next) => {
  try {
    const z = Number(req.params.z), x = Number(req.params.x), y = Number(req.params.y);
    if (!Number.isInteger(z) || z < 0 || z > 19) return res.status(400).json({ error: 'Invalid zoom' });
    const max = 2 ** z;
    if (!Number.isInteger(x) || x < 0 || x >= max || !Number.isInteger(y) || y < 0 || y >= max) {
      return res.status(400).json({ error: 'Invalid tile coordinates' });
    }

    const dir = path.join(TILE_CACHE_PATH, String(z), String(x));
    const file = path.join(dir, `${y}.png`);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=604800'); // 7 days

    // disk cache hit
    let cacheHit = false;
    try {
      await fs.promises.access(file, fs.constants.R_OK);
      cacheHit = true;
    } catch { /* miss — fetch upstream */ }
    if (cacheHit) {
      try {
        await pipeline(fs.createReadStream(file), res);
      } catch (err) {
        // stream failed mid-flight (client abort / file vanished) — response
        // is unusable at this point, just log.
        console.error('[tiles] cache stream failed:', err.message);
        if (!res.writableEnded) res.end();
      }
      return;
    }

    // fetch upstream
    let resp;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        resp = await fetch(`${TILE_UPSTREAM}/${z}/${x}/${y}.png`, {
          headers: { 'User-Agent': TILE_UA },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return res.status(502).json({ error: 'Tile upstream unavailable' });
    }
    if (!resp.ok || !resp.body) {
      return res.status(502).json({ error: 'Tile upstream unavailable' });
    }

    const buf = Buffer.from(await resp.arrayBuffer());
    // write-through cache (atomic-ish: tmp then rename); failures non-fatal
    try {
      await fs.promises.mkdir(dir, { recursive: true });
      const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
      await fs.promises.writeFile(tmp, buf);
      await fs.promises.rename(tmp, file);
    } catch (err) {
      console.error('[tiles] cache write failed:', err.message);
    }
    res.end(buf);
  } catch (err) { next(err); }
});

module.exports = router;
