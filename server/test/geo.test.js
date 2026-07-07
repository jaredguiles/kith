'use strict';

// Geo library tests — pure local geocoding only (no DB required).
// NOT wired into `npm test` (package.json is shared with another workstream);
// run manually with:  node --test server/test/geo.test.js

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { geocodeLocal, queryHash } = require('../lib/geo');

test('geocodeLocal resolves "Portland, OR" to Oregon', () => {
  const r = geocodeLocal('Portland, OR');
  assert.ok(r, 'expected a result');
  assert.equal(r.source, 'geonames');
  assert.ok(Math.abs(r.lat - 45.52) < 0.5, `lat ${r.lat} ≈ 45.52`);
  assert.ok(Math.abs(r.lng - -122.68) < 0.5, `lng ${r.lng} ≈ -122.68`);
  assert.match(r.label, /Oregon/);
});

test('geocodeLocal resolves "Portland, Oregon" (admin1 full name)', () => {
  const r = geocodeLocal('Portland, Oregon');
  assert.ok(r);
  assert.match(r.label, /Oregon/);
});

test('geocodeLocal resolves "Portland, Maine" distinctly', () => {
  const r = geocodeLocal('Portland, Maine');
  assert.ok(r);
  assert.match(r.label, /Maine/);
  assert.ok(Math.abs(r.lat - 43.66) < 0.5);
});

test('geocodeLocal bare city prefers higher population (Portland → Oregon)', () => {
  const r = geocodeLocal('Portland');
  assert.ok(r);
  assert.match(r.label, /Oregon/);
});

test('geocodeLocal resolves "Berlin" and "Berlin, Germany"', () => {
  const bare = geocodeLocal('Berlin');
  const qualified = geocodeLocal('Berlin, Germany');
  assert.ok(bare);
  assert.ok(qualified);
  assert.equal(bare.lat, qualified.lat);
  assert.ok(Math.abs(bare.lat - 52.52) < 0.5);
  assert.match(bare.label, /DE$/);
});

test('geocodeLocal resolves "Tokyo"', () => {
  const r = geocodeLocal('Tokyo');
  assert.ok(r);
  assert.ok(Math.abs(r.lat - 35.69) < 0.5);
  assert.ok(Math.abs(r.lng - 139.69) < 0.5);
});

test('geocodeLocal handles diacritics ("São Paulo" == "Sao Paulo")', () => {
  const a = geocodeLocal('São Paulo');
  const b = geocodeLocal('Sao Paulo');
  assert.ok(a && b);
  assert.equal(a.lat, b.lat);
});

test('geocodeLocal country ISO code qualifier ("Berlin, DE")', () => {
  const r = geocodeLocal('Berlin, DE');
  assert.ok(r);
  assert.ok(Math.abs(r.lat - 52.52) < 0.5);
});

test('geocodeLocal returns null for garbage / empty input', () => {
  assert.equal(geocodeLocal('xyzzy not a real place'), null);
  assert.equal(geocodeLocal(''), null);
  assert.equal(geocodeLocal(null), null);
  assert.equal(geocodeLocal(undefined), null);
  assert.equal(geocodeLocal(12345), null);
});

test('queryHash is normalization-stable', () => {
  assert.equal(queryHash('Portland, OR'), queryHash('  portland,   or '));
  assert.equal(queryHash('São Paulo'), queryHash('sao paulo'));
  assert.notEqual(queryHash('Portland'), queryHash('Berlin'));
});
