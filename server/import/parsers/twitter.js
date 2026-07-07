'use strict';

// Twitter/X data-export (.zip) parser — defensive per O8: X's format changes
// repeatedly and contact data is limited. Reads following/follower JS files
// (window.YTD.* format). Degrades to a clear "format not supported" error.

const { readZipEntries } = require('../ziputil');
const { makeRecord } = require('../normalizer');

const DATA_FILES = /(^|\/)data\/(following|follower)(-part\d+)?\.js$/i;

/** X ships data as `window.YTD.following.part0 = [ ... ]` — strip the prefix. */
function parseYtdJs(text) {
  const idx = text.indexOf('=');
  if (idx === -1) throw new Error('unrecognized data file shape');
  return JSON.parse(text.slice(idx + 1).trim());
}

async function parseTwitter(zipPath) {
  const errors = [];
  let entries;
  try {
    entries = await readZipEntries(zipPath, (n) => DATA_FILES.test(n));
  } catch (err) {
    return { records: [], errors: [`Could not read archive: ${err.message}`] };
  }
  if (!entries.length) {
    return {
      records: [],
      errors: ['No recognizable Twitter/X data found (data/following.js, data/follower.js) — format not yet supported'],
    };
  }

  const byId = new Map();
  for (const { name, buffer } of entries) {
    try {
      const list = parseYtdJs(buffer.toString('utf8'));
      for (const item of list) {
        // shapes: { following: { accountId, userLink } } | { follower: {...} }
        const acc = item.following || item.follower || item;
        const accountId = acc.accountId || acc.account_id || null;
        if (!accountId) continue;
        const username = acc.userLink ? acc.userLink.split('/').pop() : null;
        if (byId.has(accountId)) continue;
        byId.set(accountId, makeRecord({
          display_name: username || `X user ${accountId}`,
          social_links: [{
            platform: 'twitter',
            username: username || null,
            url: acc.userLink || `https://x.com/i/user/${accountId}`,
          }],
          source_id: `tw:${accountId}`,
        }));
      }
    } catch (err) {
      errors.push(`${name}: ${err.message}`);
    }
  }
  return { records: [...byId.values()], errors };
}

module.exports = { parse: parseTwitter, extensions: ['.zip'], isZip: true };
