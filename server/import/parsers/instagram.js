'use strict';

// Instagram data-export (.zip) parser — defensive. Reads followers/following
// JSON + 1:1 DM threads.

const { readZipEntries, deepFixEncoding } = require('../ziputil');
const { makeRecord, normalizeTimestamp } = require('../normalizer');

const CONNECTION_FILES = /(^|\/)(followers_and_following\/)?(followers(_\d+)?|following)\.json$/i;
const MESSAGE_FILES = /(^|\/)messages\/inbox\/[^/]+\/message_\d+\.json$/i;

function igRecord(username, fullName = null) {
  return makeRecord({
    display_name: fullName || username,
    nickname: fullName ? username : null,
    social_links: [{ platform: 'instagram', username, url: `https://instagram.com/${username}` }],
    source_id: `ig:${username}`,
  });
}

function parseConnections(json) {
  const records = [];
  // shapes: { relationships_followers: [...] } | { relationships_following: [...] } | [...]
  let list = null;
  if (Array.isArray(json)) list = json;
  else {
    for (const key of Object.keys(json)) {
      if (key.startsWith('relationships_') && Array.isArray(json[key])) { list = json[key]; break; }
    }
  }
  if (!list) return records;
  for (const item of list) {
    // shape: { string_list_data: [{ value: username, href }] , title? }
    const sld = item.string_list_data?.[0];
    const username = sld?.value || item.title || null;
    if (!username) continue;
    records.push(igRecord(username));
  }
  return records;
}

function parseThread(json) {
  const participants = (json.participants || []).map((p) => p.name).filter(Boolean);
  if (participants.length !== 2) return null;
  const other = participants[0]; // IG puts the other participant first; heuristic
  const messages = (json.messages || [])
    .filter((m) => m.content)
    .slice(0, 500)
    .map((m) => ({
      direction: m.sender_name === other ? 'in' : 'out',
      content: String(m.content).slice(0, 4000),
      sent_at: normalizeTimestamp(m.timestamp_ms),
    }));
  return makeRecord({
    display_name: other,
    social_links: [{ platform: 'instagram', username: null, url: null }],
    messages,
    source_id: `ig:${other}`,
  });
}

async function parseInstagram(zipPath) {
  const errors = [];
  let entries;
  try {
    entries = await readZipEntries(zipPath, (n) => CONNECTION_FILES.test(n) || MESSAGE_FILES.test(n));
  } catch (err) {
    return { records: [], errors: [`Could not read archive: ${err.message}`] };
  }
  if (!entries.length) {
    return { records: [], errors: ['No recognizable Instagram data found (followers/following/messages) — format not supported'] };
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
      if (CONNECTION_FILES.test(name)) parseConnections(json).forEach(merge);
      else if (MESSAGE_FILES.test(name)) {
        const rec = parseThread(json);
        if (rec) merge(rec);
      }
    } catch (err) {
      errors.push(`${name}: ${err.message}`);
    }
  }
  return { records: [...byKey.values()], errors };
}

module.exports = { parse: parseInstagram, extensions: ['.zip'], isZip: true };
