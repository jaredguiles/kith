'use strict';

// Magic-byte sniffing tests (server/lib/filetype.js) — pure, no DB required.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sniffBuffer, matchesDeclared } = require('../lib/filetype');

const buf = (...bytes) => Buffer.from(bytes.flat());
const pad = (b, len = 64) => Buffer.concat([b, Buffer.alloc(Math.max(0, len - b.length))]);

// ---------------------------------------------------------------- images

test('sniffs JPEG', () => {
  const b = pad(buf(0xff, 0xd8, 0xff, 0xe0));
  assert.deepEqual(sniffBuffer(b), { mime: 'image/jpeg', kind: 'image' });
});

test('sniffs PNG', () => {
  const b = pad(buf(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a));
  assert.deepEqual(sniffBuffer(b), { mime: 'image/png', kind: 'image' });
});

test('sniffs GIF (87a and 89a)', () => {
  assert.deepEqual(sniffBuffer(pad(Buffer.from('GIF87a'))), { mime: 'image/gif', kind: 'image' });
  assert.deepEqual(sniffBuffer(pad(Buffer.from('GIF89a'))), { mime: 'image/gif', kind: 'image' });
});

test('sniffs WEBP (RIFF….WEBP)', () => {
  const b = pad(Buffer.concat([Buffer.from('RIFF'), buf(0, 0, 0, 0), Buffer.from('WEBP')]));
  assert.deepEqual(sniffBuffer(b), { mime: 'image/webp', kind: 'image' });
});

test('sniffs HEIC (ftyp heic brand)', () => {
  const b = pad(Buffer.concat([buf(0, 0, 0, 0x18), Buffer.from('ftypheic')]));
  assert.deepEqual(sniffBuffer(b), { mime: 'image/heic', kind: 'image' });
});

// ---------------------------------------------------------------- video

test('sniffs MP4 (ftyp isom brand)', () => {
  const b = pad(Buffer.concat([buf(0, 0, 0, 0x18), Buffer.from('ftypisom')]));
  assert.deepEqual(sniffBuffer(b), { mime: 'video/mp4', kind: 'video' });
});

test('sniffs MOV (ftyp qt brand)', () => {
  const b = pad(Buffer.concat([buf(0, 0, 0, 0x14), Buffer.from('ftypqt  ')]));
  assert.deepEqual(sniffBuffer(b), { mime: 'video/quicktime', kind: 'video' });
});

test('sniffs WEBM (EBML + webm DocType)', () => {
  const b = pad(Buffer.concat([buf(0x1a, 0x45, 0xdf, 0xa3), buf(0x42, 0x82), Buffer.from('webm')]));
  assert.deepEqual(sniffBuffer(b), { mime: 'video/webm', kind: 'video' });
});

test('sniffs MKV (EBML + matroska DocType)', () => {
  const b = pad(Buffer.concat([buf(0x1a, 0x45, 0xdf, 0xa3), buf(0x42, 0x82), Buffer.from('matroska')]));
  assert.deepEqual(sniffBuffer(b), { mime: 'video/x-matroska', kind: 'video' });
});

// ---------------------------------------------------------------- other

test('sniffs ZIP', () => {
  assert.deepEqual(sniffBuffer(pad(buf(0x50, 0x4b, 0x03, 0x04))), { mime: 'application/zip', kind: 'archive' });
  assert.deepEqual(sniffBuffer(pad(buf(0x50, 0x4b, 0x05, 0x06))), { mime: 'application/zip', kind: 'archive' });
});

test('unknown/plain-text content returns null', () => {
  assert.equal(sniffBuffer(Buffer.from('BEGIN:VCARD\r\nVERSION:3.0\r\n')), null);
  assert.equal(sniffBuffer(Buffer.from('name,email\nAda,ada@x.io\n')), null);
  assert.equal(sniffBuffer(Buffer.alloc(0)), null);
  assert.equal(sniffBuffer(buf(0x00, 0x01)), null); // too short
});

// ---------------------------------------------------------------- matching

test('matchesDeclared: exact image match', () => {
  const png = sniffBuffer(pad(buf(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)));
  assert.equal(matchesDeclared('image/png', png), true);
  assert.equal(matchesDeclared('image/jpeg', png), false);
});

test('matchesDeclared: video container families are interchangeable', () => {
  const mp4 = sniffBuffer(pad(Buffer.concat([buf(0, 0, 0, 0x18), Buffer.from('ftypisom')])));
  assert.equal(matchesDeclared('video/mp4', mp4), true);
  assert.equal(matchesDeclared('video/quicktime', mp4), true); // same ISO-BMFF family
  assert.equal(matchesDeclared('video/webm', mp4), false);

  const mkv = sniffBuffer(pad(Buffer.concat([buf(0x1a, 0x45, 0xdf, 0xa3), buf(0x42, 0x82), Buffer.from('matroska')])));
  assert.equal(matchesDeclared('video/webm', mkv), true);
  assert.equal(matchesDeclared('video/x-matroska', mkv), true);
});

test('matchesDeclared: spoofed uploads rejected', () => {
  // an "image/png" that is actually a zip
  const zip = sniffBuffer(pad(buf(0x50, 0x4b, 0x03, 0x04)));
  assert.equal(matchesDeclared('image/png', zip), false);
  // an "image/jpeg" that is unknown content
  assert.equal(matchesDeclared('image/jpeg', null), false);
});
