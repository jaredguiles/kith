'use strict';

// Relationship-type validation tests — pure data checks on INVERSE_MAP /
// RELATION_TYPES (routes/relationships.js). No DB required.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { INVERSE_MAP, RELATION_TYPES, DISPLAY_LABELS } = require('../routes/relationships');

test('INVERSE_MAP is closed: every inverse is itself a valid relation type', () => {
  for (const [type, inverse] of Object.entries(INVERSE_MAP)) {
    assert.ok(RELATION_TYPES.includes(inverse), `inverse of ${type} (${inverse}) must be a valid type`);
  }
});

test('normalized inverse pairs round-trip (inverse of inverse is stable)', () => {
  // The map normalizes gendered/specific types (mother → child → parent), so
  // the round trip must land on a type whose inverse leads back to the same
  // normalized family, i.e. applying the inverse twice more changes nothing.
  for (const type of RELATION_TYPES) {
    const inv = INVERSE_MAP[type];
    const back = INVERSE_MAP[inv];
    assert.equal(INVERSE_MAP[INVERSE_MAP[back]], back, `${type} → ${inv} → ${back} must stabilize`);
  }
});

test('symmetric types are their own inverse', () => {
  for (const t of ['sibling', 'spouse', 'partner', 'ex', 'cousin', 'friend', 'best_friend',
                   'colleague', 'neighbor', 'roommate', 'acquaintance', 'family', 'other']) {
    assert.equal(INVERSE_MAP[t], t, `${t} must be symmetric`);
  }
});

test('RELATION_TYPES matches the INVERSE_MAP keys exactly', () => {
  assert.deepEqual(RELATION_TYPES, Object.keys(INVERSE_MAP));
});

test('every relation type has a display label', () => {
  for (const t of RELATION_TYPES) {
    assert.ok(Object.prototype.hasOwnProperty.call(DISPLAY_LABELS, t), `missing display label for ${t}`);
  }
});
