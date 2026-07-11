'use strict';

// Contact satellites: emails, phones, addresses, social links.
// List/add live under /api/contacts/:id/<kind>; update/remove under
// /api/<kind>/:id (per SPEC's endpoint list).

const express = require('express');
const { query } = require('../database/connection');
const { requireAuth, requireContactAccess, contactAccess } = require('../middleware/auth');
const { auditWrite } = require('../lib/audit');
const { rebuildSearchIndexAsync } = require('../lib/contacts');
const { geocode, geocodeRemote } = require('../lib/geo');

// Configuration per satellite kind
const KINDS = {
  emails: {
    table: 'contact_emails',
    fields: ['label', 'email', 'is_primary'],
    required: ['email'],
    entity: 'email',
  },
  phones: {
    table: 'contact_phones',
    fields: ['label', 'phone', 'is_primary'],
    required: ['phone'],
    entity: 'phone',
  },
  addresses: {
    table: 'contact_addresses',
    // start_date/end_date = residency window ("moved in / moved out");
    // NULL end_date marks the current home. Enables move-history tracking.
    // latitude/longitude: only honored via extractUserPin() — a confirmed
    // pick from the address-autocomplete UI (geocode_source 'user'), never
    // as raw pass-through fields.
    fields: ['label', 'street', 'city', 'state', 'zip', 'country', 'is_primary', 'start_date', 'end_date'],
    required: [],
    entity: 'address',
  },
  socials: {
    table: 'social_links',
    fields: ['platform', 'url', 'username'],
    required: [],
    entity: 'social_link',
  },
};

function pickFields(body, kind) {
  const data = {};
  for (const f of kind.fields) {
    if (f in (body || {})) data[f] = f === 'is_primary' ? (body[f] ? 1 : 0) : body[f];
  }
  return data;
}

/**
 * Confirmed-pick coordinates from the address-autocomplete UI: the client
 * sends { verified_lat, verified_lng } ONLY when the user explicitly picked
 * a suggest candidate. Those beat re-geocoding free text (which is exactly
 * how "Gowen, MI" once landed in Mississippi). Returns {lat,lng} or null.
 */
function extractUserPin(body) {
  const lat = Number(body?.verified_lat);
  const lng = Number(body?.verified_lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

// ---------------------------------------------------------------------------
// Address geocoding: Photon (self-hosted, street precision) with the full
// address, falling back to the local geonames index with "city, state, country".
// ---------------------------------------------------------------------------
async function geocodeAddressRow(addr) {
  const full = [addr.street, addr.city, addr.state, addr.zip, addr.country].filter(Boolean).join(', ');
  const cityLevel = [addr.city, addr.state, addr.country].filter(Boolean).join(', ');
  if (!full && !cityLevel) return null;
  let result = full ? await geocodeRemote(full) : null;
  if (!result && cityLevel) result = await geocode(cityLevel); // cached local (or remote) city-level
  return result;
}

/** Geocode an address row and persist lat/lng. Awaitable; never throws. */
async function geocodeAddress(addressId) {
  try {
    const rows = await query('SELECT * FROM contact_addresses WHERE id = ?', [addressId]);
    if (!rows.length) return null;
    const result = await geocodeAddressRow(rows[0]);
    if (!result) return null;
    await query(
      'UPDATE contact_addresses SET latitude = ?, longitude = ?, geocoded_at = NOW(), geocode_source = ? WHERE id = ?',
      [result.lat, result.lng, result.source, addressId]
    );
    return result;
  } catch (err) {
    console.error('[geocode-address] failed:', err.message);
    return null;
  }
}

function geocodeAddressAsync(addressId) {
  geocodeAddress(addressId).catch(() => { /* geocodeAddress never throws */ });
}

// Router mounted at /api/contacts/:id/(emails|phones|addresses|socials)
const contactSatellites = express.Router({ mergeParams: true });
contactSatellites.use(requireAuth);

for (const [name, kind] of Object.entries(KINDS)) {
  // list
  contactSatellites.get(`/${name}`, requireContactAccess('id'), async (req, res, next) => {
    try {
      // basic scope only exposes emails/phones per SPEC (name/email/phone/photo)
      if (req.contactAccess === 'shared' && req.contactShare.share_scope === 'basic' &&
          (name === 'addresses' || name === 'socials')) {
        return res.json({ [name]: [] });
      }
      const rows = await query(`SELECT * FROM ${kind.table} WHERE contact_id = ? ORDER BY ${kind.fields.includes('is_primary') ? 'is_primary DESC,' : ''} id`, [req.contact.id]);
      res.json({ [name]: rows });
    } catch (err) { next(err); }
  });

  // add
  contactSatellites.post(`/${name}`, requireContactAccess('id', { edit: true }), async (req, res, next) => {
    try {
      const data = pickFields(req.body, kind);
      for (const r of kind.required) {
        if (!data[r]) return res.status(400).json({ error: `${r} is required` });
      }
      if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Nothing to add' });
      if (data.is_primary) {
        await query(`UPDATE ${kind.table} SET is_primary = 0 WHERE contact_id = ?`, [req.contact.id]);
      }
      const cols = Object.keys(data);
      const result = await query(
        `INSERT INTO ${kind.table} (contact_id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`,
        [req.contact.id, ...cols.map((k) => data[k] ?? null)]
      );
      rebuildSearchIndexAsync(req.contact.id);
      if (name === 'addresses') {
        const pin = extractUserPin(req.body);
        if (pin) {
          // user confirmed a suggest candidate — trust its coordinates
          await query(
            `UPDATE contact_addresses SET latitude = ?, longitude = ?, geocoded_at = NOW(), geocode_source = 'user' WHERE id = ?`,
            [pin.lat, pin.lng, result.insertId]
          );
        } else {
          geocodeAddressAsync(result.insertId); // fire-and-forget best-effort
        }
      }
      auditWrite(req.user.id, req.contact.id, 'create', kind.entity, result.insertId, null, data, `Added ${kind.entity}`);
      res.status(201).json({ id: result.insertId });
    } catch (err) { next(err); }
  });
}

// Router mounted at /api/(emails|phones|addresses|socials)/:itemId
const satelliteItems = express.Router();
satelliteItems.use(requireAuth);

for (const [name, kind] of Object.entries(KINDS)) {
  const loadItem = async (req, res, next) => {
    try {
      const id = Number(req.params.itemId);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
      const rows = await query(`SELECT * FROM ${kind.table} WHERE id = ?`, [id]);
      if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
      const found = await contactAccess(req.user, rows[0].contact_id);
      if (!found) return res.status(404).json({ error: 'Not found' });
      if (found.access === 'shared' && found.share.permissions !== 'edit') {
        return res.status(403).json({ error: 'Read-only access' });
      }
      req.item = rows[0];
      next();
    } catch (err) { next(err); }
  };

  satelliteItems.put(`/${name}/:itemId`, loadItem, async (req, res, next) => {
    try {
      const data = pickFields(req.body, kind);
      if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Nothing to update' });
      if (data.is_primary) {
        await query(`UPDATE ${kind.table} SET is_primary = 0 WHERE contact_id = ?`, [req.item.contact_id]);
      }
      const cols = Object.keys(data);
      await query(
        `UPDATE ${kind.table} SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
        [...cols.map((k) => data[k] ?? null), req.item.id]
      );
      rebuildSearchIndexAsync(req.item.contact_id);
      if (name === 'addresses') {
        const pin = extractUserPin(req.body);
        if (pin) {
          await query(
            `UPDATE contact_addresses SET latitude = ?, longitude = ?, geocoded_at = NOW(), geocode_source = 'user' WHERE id = ?`,
            [pin.lat, pin.lng, req.item.id]
          );
        } else if (cols.some((c) => ['street', 'city', 'state', 'zip', 'country'].includes(c))) {
          geocodeAddressAsync(req.item.id); // address text changed → re-geocode
        }
      }
      auditWrite(req.user.id, req.item.contact_id, 'update', kind.entity, req.item.id, req.item, data, `Updated ${kind.entity}`);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  satelliteItems.delete(`/${name}/:itemId`, loadItem, async (req, res, next) => {
    try {
      await query(`DELETE FROM ${kind.table} WHERE id = ?`, [req.item.id]);
      rebuildSearchIndexAsync(req.item.contact_id);
      auditWrite(req.user.id, req.item.contact_id, 'delete', kind.entity, req.item.id, req.item, null, `Removed ${kind.entity}`);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });
}

// POST /api/addresses/:itemId/geocode — manual (awaited) re-geocode.
satelliteItems.post('/addresses/:itemId/geocode', async (req, res, next) => {
  try {
    const id = Number(req.params.itemId);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const rows = await query('SELECT * FROM contact_addresses WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const found = await contactAccess(req.user, rows[0].contact_id);
    if (!found) return res.status(404).json({ error: 'Not found' });
    if (found.access === 'shared' && found.share.permissions !== 'edit') {
      return res.status(403).json({ error: 'Read-only access' });
    }
    const result = await geocodeAddress(id);
    if (!result) return res.status(404).json({ error: 'Could not geocode this address' });
    res.json({ ok: true, latitude: result.lat, longitude: result.lng, label: result.label, source: result.source });
  } catch (err) { next(err); }
});

module.exports = { contactSatellites, satelliteItems, geocodeAddress };
