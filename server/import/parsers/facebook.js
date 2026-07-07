'use strict';

// Facebook data-export (.zip) parser — defensive (O8 generalized): formats
// change often; parse what we recognize, error clearly on what we don't.
// Looks for friends lists + messages in the JSON export layout.

const { readZipEntries, deepFixEncoding } = require('../ziputil');
const { makeRecord, normalizeTimestamp } = require('../normalizer');

const FRIEND_FILES = /(^|\/)(friends|your_friends|friends_and_followers\/friends)[^/]*\.json$/i;
const MESSAGE_FILES = /(^|\/)messages\/inbox\/[^/]+\/message_\d+\.json$/i;

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
    entries = await readZipEntries(zipPath, (n) => FRIEND_FILES.test(n) || MESSAGE_FILES.test(n));
  } catch (err) {
    return { records: [], errors: [`Could not read archive: ${err.message}`] };
  }
  if (!entries.length) {
    return { records: [], errors: ['No recognizable Facebook data found (friends/messages JSON) — format not supported'] };
  }

  const byKey = new Map();
  const merge = (rec) => {
    const key = rec.source_id || rec.display_name;
    const existing = byKey.get(key);
    if (existing) existing.messages.push(...(rec.messages || []));
    else byKey.set(key, rec);
  };

  for (const { name, buffer } of entries) {
    try {
      const json = deepFixEncoding(JSON.parse(buffer.toString('utf8')));
      if (FRIEND_FILES.test(name)) parseFriendsJson(json).forEach(merge);
      else if (MESSAGE_FILES.test(name)) {
        const rec = parseMessageThread(json);
        if (rec) merge(rec);
      }
    } catch (err) {
      errors.push(`${name}: ${err.message}`);
    }
  }

  return { records: [...byKey.values()], errors };
}

module.exports = { parse: parseFacebook, extensions: ['.zip'], isZip: true };
