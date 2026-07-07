'use strict';

// Facebook data-export (.zip) parser — defensive (O8 generalized): formats
// change often; parse what we recognize, error clearly on what we don't.
// Looks for friends lists + messages in the JSON export layout.

const { readZipEntries, deepFixEncoding } = require('../ziputil');
const { makeRecord, normalizeTimestamp } = require('../normalizer');

const FRIEND_FILES = /(^|\/)(friends|your_friends|friends_and_followers\/friends)[^/]*\.json$/i;
const MESSAGE_FILES = /(^|\/)messages\/inbox\/[^/]+\/message_\d+\.json$/i;
const PROFILE_FILES = /(^|\/)(profile_information\/profile_information|autofill_information)\.json$/i;

/** Extract the export owner's name(s) from profile/autofill JSON shapes. */
function extractSelfNames(json) {
  const names = new Set();
  const add = (v) => { if (typeof v === 'string' && v.trim()) names.add(v.trim()); };
  // profile_information.json: { profile_v2: { name: { full_name, first_name, last_name } } }
  const prof = json.profile_v2 || json.profile || null;
  if (prof?.name) {
    add(prof.name.full_name);
    const composed = [prof.name.first_name, prof.name.middle_name, prof.name.last_name]
      .filter(Boolean).join(' ').trim();
    add(composed);
  }
  // autofill_information.json: { autofill_information_v2: { FULL_NAME: ... } } or flat
  const auto = json.autofill_information_v2 || json.autofill_information || json;
  if (auto && typeof auto === 'object') {
    add(auto.FULL_NAME);
    add(auto.full_name);
    add(auto.name);
  }
  return names;
}

/** Fallback heuristic: the participant name present in ALL 1:1 threads is self. */
function inferSelfFromThreads(threads) {
  let common = null;
  for (const json of threads) {
    const participants = new Set((json.participants || []).map((p) => p.name).filter(Boolean));
    if (common === null) common = participants;
    else common = new Set([...common].filter((n) => participants.has(n)));
    if (common.size === 0) return new Set();
  }
  // only trustworthy when exactly one name is common to every thread (and
  // there was more than one thread to intersect)
  if (threads.length >= 2 && common && common.size === 1) return common;
  return new Set();
}

function parseFriendsJson(json) {
  const records = [];
  // known shapes: { friends_v2: [...] } | { friends: [...] } | [...]
  const list = json.friends_v2 || json.friends || (Array.isArray(json) ? json : null);
  if (!Array.isArray(list)) return records;
  for (const f of list) {
    const name = f.name || f.title || null;
    if (!name) continue;
    records.push(makeRecord({
      display_name: name,
      social_links: [{ platform: 'facebook', username: null, url: null }],
      source_id: `fb:${name}`,
    }));
  }
  return records;
}

function parseMessageThread(json, selfNames = new Set()) {
  // shape: { participants: [{name}], messages: [{sender_name, timestamp_ms, content}], title }
  const participants = (json.participants || []).map((p) => p.name).filter(Boolean);
  if (participants.length !== 2) return null; // only 1:1 threads → contact messages
  const other = participants.find((p) => !selfNames.has(p)) || participants[0];
  const messages = (json.messages || [])
    .filter((m) => m.content)
    .slice(0, 500)
    .map((m) => ({
      direction: selfNames.has(m.sender_name) ? 'out' : 'in',
      content: String(m.content).slice(0, 4000),
      sent_at: normalizeTimestamp(m.timestamp_ms),
    }));
  if (!other) return null;
  return makeRecord({
    display_name: other,
    social_links: [{ platform: 'facebook', username: null, url: null }],
    messages,
    source_id: `fb:${other}`,
  });
}

async function parseFacebook(zipPath) {
  const errors = [];
  let entries;
  try {
    entries = await readZipEntries(zipPath, (n) => FRIEND_FILES.test(n) || MESSAGE_FILES.test(n) || PROFILE_FILES.test(n));
  } catch (err) {
    return { records: [], errors: [`Could not read archive: ${err.message}`] };
  }
  const dataEntries = entries.filter(({ name }) => !PROFILE_FILES.test(name));
  if (!dataEntries.length) {
    return { records: [], errors: ['No recognizable Facebook data found (friends/messages JSON) — format not supported'] };
  }

  const byKey = new Map();
  const merge = (rec) => {
    const key = rec.source_id || rec.display_name;
    const existing = byKey.get(key);
    if (existing) existing.messages.push(...(rec.messages || []));
    else byKey.set(key, rec);
  };

  // pass 1: owner identity from profile/autofill JSON; buffer message threads
  let selfNames = new Set();
  const threadJsons = [];
  for (const { name, buffer } of entries) {
    try {
      const json = deepFixEncoding(JSON.parse(buffer.toString('utf8')));
      if (PROFILE_FILES.test(name)) {
        for (const n of extractSelfNames(json)) selfNames.add(n);
      } else if (FRIEND_FILES.test(name)) {
        parseFriendsJson(json).forEach(merge);
      } else if (MESSAGE_FILES.test(name)) {
        threadJsons.push(json);
      }
    } catch (err) {
      errors.push(`${name}: ${err.message}`);
    }
  }

  // fallback: infer self as the one participant common to all 1:1 threads
  if (!selfNames.size) {
    selfNames = inferSelfFromThreads(threadJsons.filter((j) => (j.participants || []).length === 2));
  }

  // pass 2: parse threads with owner identity (degrades to all-'in' when unknown)
  for (const json of threadJsons) {
    const rec = parseMessageThread(json, selfNames);
    if (rec) merge(rec);
  }

  return { records: [...byKey.values()], errors };
}

module.exports = { parse: parseFacebook, extensions: ['.zip'], isZip: true };
