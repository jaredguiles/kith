'use strict';

// Non-blocking audit + changelog writers (§4.5). Failures are logged, never
// swallowed silently (§7.9), and never block the caller.

const { query } = require('../database/connection');

/** Fire-and-forget audit_log write. */
function auditWrite(userId, contactId, action, entityType, entityId, oldValues, newValues, description) {
  query(
    `INSERT INTO audit_log (user_id, contact_id, action, entity_type, entity_id, old_values, new_values, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId ?? null,
      contactId ?? null,
      action,
      entityType ?? null,
      entityId ?? null,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      description ?? null,
    ]
  ).catch((err) => {
    console.error('[audit] write failed:', err.message, { action, entityType, entityId });
  });
}

/** Fire-and-forget contact_field_changelog write for a set of field diffs. */
function changelogWrite(contactId, userId, source, diffs, importJobId = null) {
  for (const { field, oldValue, newValue } of diffs) {
    query(
      `INSERT INTO contact_field_changelog (contact_id, user_id, import_job_id, source, field_name, old_value, new_value)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [contactId, userId ?? null, importJobId, source, field, oldValue ?? null, newValue ?? null]
    ).catch((err) => {
      console.error('[changelog] write failed:', err.message, { contactId, field });
    });
  }
}

/** Compute field-level diffs between two flat objects for a given field list. */
function diffFields(before, after, fields) {
  const diffs = [];
  for (const field of fields) {
    if (!(field in after)) continue;
    const oldV = before?.[field] ?? null;
    const newV = after[field] ?? null;
    if (String(oldV ?? '') !== String(newV ?? '')) {
      diffs.push({ field, oldValue: oldV === null ? null : String(oldV), newValue: newV === null ? null : String(newV) });
    }
  }
  return diffs;
}

module.exports = { auditWrite, changelogWrite, diffFields };
