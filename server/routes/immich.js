'use strict';

// Immich integration — per-user connections to self-hosted Immich photo
// servers. API keys are stored field-encrypted and NEVER leave the server:
// every asset/thumbnail/search request proxies through this router (Immich
// sends no CORS headers in production, and the key must not reach a browser).

const express = require('express');
const { Readable } = require('node:stream');
const dns = require('node:dns');
const net = require('node:net');
const { query } = require('../database/connection');
const { requireAuth } = require('../middleware/auth');
const { encryptField, decryptField } = require('../lib/crypto');
const { spicyVisible } = require('./contacts');
const { auditWrite } = require('../lib/audit');

const router = express.Router();
router.use(requireAuth);

const UUID_RE = /^[0-9a-f-]{36}$/;

// ---------------------------------------------------------------------------
// Upstream fetch helpers
// ---------------------------------------------------------------------------

// SSRF guard (audit S1): user-supplied base_urls are fetched server-side, so
// an arbitrary URL would let any authenticated user port-scan the server's
// network. Loopback (127/8, ::1), link-local (169.254/16, fe80::/10),
// 0.0.0.0/unspecified and non-http(s) schemes are ALWAYS rejected.
// RFC1918 private ranges (10/8, 172.16/12, 192.168/16 + fc00::/7) are allowed
// by default because this is a homelab where Immich legitimately lives on the
// LAN — set IMMICH_ALLOW_PRIVATE=false to block those too (e.g. when Kith is
// exposed beyond the LAN and Immich is not).
const IMMICH_ALLOW_PRIVATE = String(process.env.IMMICH_ALLOW_PRIVATE ?? 'true') !== 'false';

/** Classify an IP string: 'loopback' | 'linklocal' | 'unspecified' | 'private' | 'public'. */
function classifyIp(ip) {
  let addr = String(ip);
  // IPv4-mapped IPv6 (::ffff:10.0.0.1) → classify the embedded IPv4
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) addr = mapped[1];
  if (net.isIP(addr) === 4) {
    const [a, b] = addr.split('.').map(Number);
    if (a === 127) return 'loopback';
    if (a === 0) return 'unspecified';
    if (a === 169 && b === 254) return 'linklocal';
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'private';
    return 'public';
  }
  const lower = addr.toLowerCase();
  if (lower === '::1') return 'loopback';
  if (lower === '::') return 'unspecified';
  if (/^fe[89ab]/.test(lower)) return 'linklocal'; // fe80::/10
  if (/^f[cd]/.test(lower)) return 'private'; // fc00::/7 (ULA)
  return 'public';
}

/**
 * Validate an Immich upstream URL: http(s) scheme, and the hostname must not
 * resolve to a blocked address. Returns null when OK, or an error string.
 */
async function checkUpstreamUrl(rawUrl) {
  let u;
  try {
    u = new URL(String(rawUrl));
  } catch {
    return 'Invalid URL';
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'Only http(s) URLs are allowed';
  let addresses;
  try {
    addresses = await dns.promises.lookup(u.hostname, { all: true, verbatim: true });
  } catch {
    return 'Immich server unreachable';
  }
  for (const { address } of addresses) {
    const kind = classifyIp(address);
    if (kind === 'loopback' || kind === 'linklocal' || kind === 'unspecified') {
      return 'That URL points at a blocked address';
    }
    if (kind === 'private' && !IMMICH_ALLOW_PRIVATE) {
      return 'Private-network URLs are not allowed (IMMICH_ALLOW_PRIVATE=false)';
    }
  }
  return null;
}

/** fetch() with an AbortController timeout (ms). Throws on timeout/network.
 *  Every upstream Immich request goes through here, so the SSRF check runs
 *  before each proxied fetch (base_urls can predate the save-time check). */
async function immichFetch(url, options = {}, timeoutMs = 10000) {
  const blocked = await checkUpstreamUrl(url);
  if (blocked) throw new Error(`Blocked upstream URL: ${blocked}`);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Normalize + validate a base URL. Returns the cleaned URL or null. */
function cleanBaseUrl(raw) {
  const trimmed = String(raw || '').trim().replace(/\/+$/, '');
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return trimmed;
  } catch {
    return null;
  }
}

/**
 * Verify an Immich connection: ping (no auth) then a key check.
 * Returns null on success, or an error string for a 400 response.
 */
async function verifyConnection(baseUrl, apiKey) {
  // 1) server reachable?
  let ping;
  try {
    ping = await immichFetch(`${baseUrl}/api/server/ping`, {}, 5000);
  } catch {
    return 'Immich server unreachable';
  }
  if (!ping.ok) return 'Immich server unreachable';
  const body = await ping.json().catch(() => null);
  if (!body || body.res !== 'pong') return 'That URL does not look like an Immich server';

  // 2) key accepted?
  let check;
  try {
    check = await immichFetch(`${baseUrl}/api/search/metadata`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ size: 1, page: 1 }),
    }, 5000);
  } catch {
    return 'Immich server unreachable';
  }
  if (check.status === 401 || check.status === 403) return 'API key rejected';
  if (!check.ok) return `Immich returned an unexpected error (${check.status})`;
  return null;
}

// ---------------------------------------------------------------------------
// Shared instance access (also used by routes/media.js)
// ---------------------------------------------------------------------------

/**
 * Load an instance for a user (owner-only; spicy instances require spicyOk).
 * Returns the row with a DECRYPTED api_key, or null.
 */
async function getInstanceForUser(userId, id, spicyOk) {
  const iid = Number(id);
  if (!Number.isInteger(iid) || iid <= 0) return null;
  const rows = await query('SELECT * FROM immich_instances WHERE id = ? AND owner_user_id = ?', [iid, userId]);
  if (!rows.length) return null;
  const inst = rows[0];
  if (inst.is_spicy && !spicyOk) return null;
  return { ...inst, api_key: decryptField(inst.api_key) };
}

/** Load an instance row by id only (no owner check — for media proxying,
 *  where the media row's own ACL already passed). Decrypted key. */
async function getInstanceById(id) {
  const rows = await query('SELECT * FROM immich_instances WHERE id = ?', [Number(id)]);
  if (!rows.length) return null;
  return { ...rows[0], api_key: decryptField(rows[0].api_key) };
}

/**
 * Stream a binary Immich endpoint (thumbnails/originals) to an Express
 * response. `instance` must carry a decrypted api_key. Forwards Content-Type
 * (and Content-Length when present); 404s map to `notFoundMsg`.
 */
async function proxyBinaryResponse(instance, url, res, notFoundMsg) {
  let upstream;
  try {
    upstream = await immichFetch(url, { headers: { 'x-api-key': instance.api_key } });
  } catch {
    return res.status(502).json({ error: 'Immich unreachable' });
  }
  if (!upstream.ok || !upstream.body) {
    return res.status(upstream.status === 404 ? 404 : 502).json({ error: upstream.status === 404 ? notFoundMsg : 'Immich unreachable' });
  }
  const ct = upstream.headers.get('content-type');
  if (ct) res.setHeader('Content-Type', ct);
  const cl = upstream.headers.get('content-length');
  if (cl) res.setHeader('Content-Length', cl);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  const stream = Readable.fromWeb(upstream.body);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

/**
 * Proxy an Immich asset endpoint (thumbnail/original) to an Express response.
 * (Also used by routes/media.js — keep the signature stable.)
 */
async function proxyAssetResponse(instance, assetId, variant, res) {
  const url = variant === 'original'
    ? `${instance.base_url}/api/assets/${assetId}/original`
    : `${instance.base_url}/api/assets/${assetId}/thumbnail?size=${variant}`;
  return proxyBinaryResponse(instance, url, res, 'Asset not found');
}

/** Middleware: :id → req.immich (decrypted), owner + spicy gated. */
async function loadInstance(req, res, next) {
  try {
    const spicyOk = await spicyVisible(req.user);
    const inst = await getInstanceForUser(req.user.id, req.params.id, spicyOk);
    if (!inst) return res.status(404).json({ error: 'Immich library not found' });
    req.immich = inst;
    next();
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// Instance CRUD
// ---------------------------------------------------------------------------

// GET /api/immich/instances — never returns api_key
router.get('/instances', async (req, res, next) => {
  try {
    const spicyOk = await spicyVisible(req.user);
    const rows = await query(
      `SELECT id, name, base_url, is_spicy FROM immich_instances
       WHERE owner_user_id = ? ${spicyOk ? '' : 'AND is_spicy = 0'} ORDER BY name`,
      [req.user.id]
    );
    res.json({ instances: rows });
  } catch (err) { next(err); }
});

// POST /api/immich/instances — verify ping + key before saving
router.post('/instances', async (req, res, next) => {
  try {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    const apiKey = String(b.api_key || '').trim();
    const baseUrl = cleanBaseUrl(b.base_url);
    if (!name || !b.base_url || !apiKey) return res.status(400).json({ error: 'Name, base URL, and API key are required' });
    if (!baseUrl) return res.status(400).json({ error: 'Base URL must be a valid http(s) URL' });
    const ssrfErr = await checkUpstreamUrl(baseUrl);
    if (ssrfErr) return res.status(400).json({ error: ssrfErr });

    const spicyOk = await spicyVisible(req.user);
    const isSpicy = b.is_spicy && spicyOk ? 1 : 0;

    const verifyErr = await verifyConnection(baseUrl, apiKey);
    if (verifyErr) return res.status(400).json({ error: verifyErr });

    const result = await query(
      'INSERT INTO immich_instances (owner_user_id, name, base_url, api_key, is_spicy) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, name.slice(0, 100), baseUrl, encryptField(apiKey), isSpicy]
    );
    auditWrite(req.user.id, null, 'create', 'immich_instance', result.insertId, null,
      { name, base_url: baseUrl, is_spicy: isSpicy }, 'Connected Immich library');
    res.status(201).json({ id: result.insertId });
  } catch (err) { next(err); }
});

// PUT /api/immich/instances/:id — re-verify when base_url or api_key change
router.put('/instances/:id', loadInstance, async (req, res, next) => {
  try {
    const b = req.body || {};
    const inst = req.immich;
    const updates = [];
    const params = [];

    let baseUrl = inst.base_url;
    if ('base_url' in b) {
      baseUrl = cleanBaseUrl(b.base_url);
      if (!baseUrl) return res.status(400).json({ error: 'Base URL must be a valid http(s) URL' });
      const ssrfErr = await checkUpstreamUrl(baseUrl);
      if (ssrfErr) return res.status(400).json({ error: ssrfErr });
    }
    let apiKey = inst.api_key; // already decrypted by loadInstance
    if ('api_key' in b && b.api_key) apiKey = String(b.api_key).trim();

    if (baseUrl !== inst.base_url || apiKey !== inst.api_key) {
      const verifyErr = await verifyConnection(baseUrl, apiKey);
      if (verifyErr) return res.status(400).json({ error: verifyErr });
      updates.push('base_url = ?', 'api_key = ?');
      params.push(baseUrl, encryptField(apiKey));
    }
    if ('name' in b) {
      const name = String(b.name || '').trim();
      if (!name) return res.status(400).json({ error: 'Name is required' });
      updates.push('name = ?');
      params.push(name.slice(0, 100));
    }
    if ('is_spicy' in b) {
      const spicyOk = await spicyVisible(req.user);
      updates.push('is_spicy = ?');
      params.push(b.is_spicy && spicyOk ? 1 : 0);
    }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(inst.id);
    await query(`UPDATE immich_instances SET ${updates.join(', ')} WHERE id = ?`, params);
    auditWrite(req.user.id, null, 'update', 'immich_instance', inst.id, null, null, 'Updated Immich library');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/immich/instances/:id — attached media dies with the instance
router.delete('/instances/:id', loadInstance, async (req, res, next) => {
  try {
    await query('UPDATE media_assets SET deleted_at = NOW() WHERE immich_instance_id = ? AND deleted_at IS NULL', [req.immich.id]);
    await query('DELETE FROM immich_instances WHERE id = ?', [req.immich.id]);
    auditWrite(req.user.id, null, 'delete', 'immich_instance', req.immich.id, null, null, 'Removed Immich library');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Search / browse (proxied)
// ---------------------------------------------------------------------------

/** Map an Immich AssetResponseDto to the minimal shape the picker needs. */
function mapAsset(a) {
  return { id: a.id, type: a.type, originalFileName: a.originalFileName, fileCreatedAt: a.fileCreatedAt };
}

async function searchMetadata(inst, body) {
  return immichFetch(`${inst.base_url}/api/search/metadata`, {
    method: 'POST',
    headers: { 'x-api-key': inst.api_key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// POST /api/immich/:id/search — { query?, album_id?, person_id?, tag_id?, page=1, size=40 }
// album/person/tag filters all go through the same /api/search/metadata
// family the rest of this proxy uses (personIds/tagIds/albumIds are plain
// metadata-search filters in Immich v1.1xx).
router.post('/:id/search', loadInstance, async (req, res, next) => {
  try {
    const b = req.body || {};
    const inst = req.immich;
    const page = Math.max(1, Number(b.page) || 1);
    const size = Math.min(100, Math.max(1, Number(b.size) || 40));
    const q = String(b.query || '').trim();
    const albumId = String(b.album_id || '').trim();
    const personId = String(b.person_id || '').trim();
    const tagId = String(b.tag_id || '').trim();
    if (albumId && !UUID_RE.test(albumId)) return res.status(400).json({ error: 'Invalid album id' });
    if (personId && !UUID_RE.test(personId)) return res.status(400).json({ error: 'Invalid person id' });
    if (tagId && !UUID_RE.test(tagId)) return res.status(400).json({ error: 'Invalid tag id' });

    const filters = {};
    if (albumId) filters.albumIds = [albumId];
    if (personId) filters.personIds = [personId];
    if (tagId) filters.tagIds = [tagId];
    const hasFilters = Object.keys(filters).length > 0;

    let upstream;
    let fallback = false;
    try {
      if (q && !hasFilters) {
        // semantic search first; needs Immich's ML container
        upstream = await immichFetch(`${inst.base_url}/api/search/smart`, {
          method: 'POST',
          headers: { 'x-api-key': inst.api_key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q, page, size, withExif: true }),
        });
        if (!upstream.ok) {
          // no ML (or other upstream failure) → recent listing + hint flag
          fallback = true;
          upstream = await searchMetadata(inst, { order: 'desc', page, size, withExif: true });
        }
      } else {
        upstream = await searchMetadata(inst, { ...filters, order: 'desc', page, size, withExif: true });
      }
    } catch {
      return res.status(502).json({ error: 'Immich unreachable' });
    }
    if (!upstream.ok) return res.status(502).json({ error: 'Immich search failed' });

    const data = await upstream.json().catch(() => null);
    const assets = data && data.assets ? data.assets : { items: [], nextPage: null };
    res.json({
      items: (assets.items || []).map(mapAsset),
      nextPage: assets.nextPage !== null && assets.nextPage !== undefined ? assets.nextPage : null,
      ...(fallback ? { fallback: true } : {}),
    });
  } catch (err) { next(err); }
});

// GET /api/immich/:id/albums
router.get('/:id/albums', loadInstance, async (req, res, next) => {
  try {
    let upstream;
    try {
      upstream = await immichFetch(`${req.immich.base_url}/api/albums`, {
        headers: { 'x-api-key': req.immich.api_key },
      });
    } catch {
      return res.status(502).json({ error: 'Immich unreachable' });
    }
    if (!upstream.ok) return res.status(502).json({ error: 'Immich unreachable' });
    const albums = await upstream.json().catch(() => []);
    res.json({
      albums: (Array.isArray(albums) ? albums : []).map((a) => ({
        id: a.id, name: a.albumName, count: a.assetCount,
      })),
    });
  } catch (err) { next(err); }
});

// GET /api/immich/:id/people?page=1 — named people only (unnamed faces are
// noise in a picker). Immich paginates: { people: [], total, hasNextPage }.
router.get('/:id/people', loadInstance, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    let upstream;
    try {
      upstream = await immichFetch(
        `${req.immich.base_url}/api/people?page=${page}&size=100&withHidden=false`,
        { headers: { 'x-api-key': req.immich.api_key } }
      );
    } catch {
      return res.status(502).json({ error: 'Immich unreachable' });
    }
    if (upstream.status === 404) return res.status(404).json({ error: 'People view not supported by this Immich server' });
    if (!upstream.ok) return res.status(502).json({ error: 'Immich unreachable' });
    const data = await upstream.json().catch(() => null);
    const people = data && Array.isArray(data.people) ? data.people : [];
    res.json({
      people: people
        .filter((p) => p && p.name && String(p.name).trim())
        .map((p) => ({ id: p.id, name: p.name })),
      hasNextPage: Boolean(data && data.hasNextPage),
    });
  } catch (err) { next(err); }
});

// GET /api/immich/:id/people/:personId/thumbnail — face crop for the person list
router.get('/:id/people/:personId/thumbnail', loadInstance, async (req, res, next) => {
  try {
    const personId = String(req.params.personId);
    if (!UUID_RE.test(personId)) return res.status(404).json({ error: 'Person not found' });
    await proxyBinaryResponse(
      req.immich,
      `${req.immich.base_url}/api/people/${personId}/thumbnail`,
      res,
      'Person not found'
    );
  } catch (err) { next(err); }
});

// GET /api/immich/:id/tags — flat list; `value` is the full hierarchical path
router.get('/:id/tags', loadInstance, async (req, res, next) => {
  try {
    let upstream;
    try {
      upstream = await immichFetch(`${req.immich.base_url}/api/tags`, {
        headers: { 'x-api-key': req.immich.api_key },
      });
    } catch {
      return res.status(502).json({ error: 'Immich unreachable' });
    }
    if (upstream.status === 404) return res.status(404).json({ error: 'Tags not supported by this Immich server' });
    if (!upstream.ok) return res.status(502).json({ error: 'Immich unreachable' });
    const tags = await upstream.json().catch(() => []);
    res.json({
      tags: (Array.isArray(tags) ? tags : []).map((t) => ({
        id: t.id, name: t.name, path: t.value || t.name,
      })),
    });
  } catch (err) { next(err); }
});

// GET /api/immich/:id/folders — unique folder paths (Immich folder view).
// 404s cleanly when the deployed Immich predates /api/view/folder so the
// picker can hide the Folders tab.
router.get('/:id/folders', loadInstance, async (req, res, next) => {
  try {
    let upstream;
    try {
      upstream = await immichFetch(`${req.immich.base_url}/api/view/folder/unique-paths`, {
        headers: { 'x-api-key': req.immich.api_key },
      });
    } catch {
      return res.status(502).json({ error: 'Immich unreachable' });
    }
    if (upstream.status === 404) return res.status(404).json({ error: 'Folder view not supported by this Immich server' });
    if (!upstream.ok) return res.status(502).json({ error: 'Immich unreachable' });
    const paths = await upstream.json().catch(() => []);
    res.json({
      folders: (Array.isArray(paths) ? paths : [])
        .filter((p) => typeof p === 'string')
        .slice(0, 5000),
    });
  } catch (err) { next(err); }
});

// GET /api/immich/:id/folder?path=... — assets in one folder (not paginated
// upstream; folder views are bounded by what fits in one directory)
router.get('/:id/folder', loadInstance, async (req, res, next) => {
  try {
    const p = String(req.query.path || '');
    if (!p || p.length > 1024 || p.includes('\0')) return res.status(400).json({ error: 'Invalid folder path' });
    let upstream;
    try {
      upstream = await immichFetch(
        `${req.immich.base_url}/api/view/folder?path=${encodeURIComponent(p)}`,
        { headers: { 'x-api-key': req.immich.api_key } }
      );
    } catch {
      return res.status(502).json({ error: 'Immich unreachable' });
    }
    if (upstream.status === 404) return res.status(404).json({ error: 'Folder not found' });
    if (!upstream.ok) return res.status(502).json({ error: 'Immich unreachable' });
    const assets = await upstream.json().catch(() => []);
    res.json({ items: (Array.isArray(assets) ? assets : []).map(mapAsset), nextPage: null });
  } catch (err) { next(err); }
});

// GET /api/immich/:id/assets/:assetId/thumbnail?size=thumbnail|preview
router.get('/:id/assets/:assetId/thumbnail', loadInstance, async (req, res, next) => {
  try {
    const assetId = String(req.params.assetId);
    if (!UUID_RE.test(assetId)) return res.status(404).json({ error: 'Asset not found' });
    const size = req.query.size === 'preview' ? 'preview' : 'thumbnail';
    await proxyAssetResponse(req.immich, assetId, size, res);
  } catch (err) { next(err); }
});

// GET /api/immich/:id/assets/:assetId/original
router.get('/:id/assets/:assetId/original', loadInstance, async (req, res, next) => {
  try {
    const assetId = String(req.params.assetId);
    if (!UUID_RE.test(assetId)) return res.status(404).json({ error: 'Asset not found' });
    await proxyAssetResponse(req.immich, assetId, 'original', res);
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.getInstanceForUser = getInstanceForUser;
module.exports.getInstanceById = getInstanceById;
module.exports.proxyAssetResponse = proxyAssetResponse;
module.exports.immichFetch = immichFetch;
