'use strict';

// vCard (.vcf) parser — accepts vCard 2.1 / 3.0 / 4.0 (Google/Apple export 3.0).
// Uses the `vcard4` library for RFC 6350 input, with a defensive hand-rolled
// fallback for 2.1/3.0 files the strict parser rejects.

const { makeRecord, cleanStr, normalizeDate } = require('../normalizer');

/** Split a multi-vCard file into individual BEGIN:VCARD…END:VCARD blocks. */
function splitCards(text) {
  const cards = [];
  const re = /BEGIN:VCARD[\s\S]*?END:VCARD/gi;
  let m;
  while ((m = re.exec(text)) !== null) cards.push(m[0]);
  return cards;
}

/** Unfold folded lines (RFC: continuation lines start with space/tab). */
function unfold(text) {
  return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').replace(/=\r?\n/g, ''); // also QP soft breaks
}

/** Decode quoted-printable when ENCODING=QUOTED-PRINTABLE (vCard 2.1). */
function decodeQP(value) {
  return value.replace(/=([0-9A-F]{2})/gi, (_, hex) => {
    try { return Buffer.from(hex, 'hex').toString('latin1'); } catch { return _; }
  });
}

/** Parse a single card with a tolerant line-based parser (2.1/3.0/4.0). */
function parseCardManual(cardText) {
  const lines = unfold(cardText).split(/\r?\n/);
  const props = [];
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const left = line.slice(0, idx);
    let value = line.slice(idx + 1);
    const [nameRaw, ...paramParts] = left.split(';');
    const name = nameRaw.toUpperCase().replace(/^ITEM\d+\./i, '');
    const params = {};
    for (const p of paramParts) {
      const eq = p.indexOf('=');
      if (eq === -1) params[p.toUpperCase()] = true;
      else params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
    }
    if (String(params.ENCODING || '').toUpperCase().includes('QUOTED-PRINTABLE')) {
      value = decodeQP(value);
    }
    props.push({ name, params, value });
  }
  return props;
}

function labelFromParams(params, fallback = 'other') {
  const type = String(params.TYPE || '').toLowerCase();
  if (type.includes('work')) return 'work';
  if (type.includes('home')) return type.includes('cell') ? 'mobile' : 'home';
  if (type.includes('cell') || type.includes('mobile')) return 'mobile';
  return fallback;
}

function recordFromProps(props) {
  const rec = { emails: [], phones: [], social_links: [] };
  let addrParts = null;

  for (const { name, params, value } of props) {
    const v = cleanStr(value?.replace(/\\([,;nN])/g, (_, c) => (c.toLowerCase() === 'n' ? ' ' : c)));
    if (!v && name !== 'ADR') continue;
    switch (name) {
      case 'FN': rec.display_name = v; break;
      case 'N': {
        const parts = value.split(';');
        rec.last_name = cleanStr(parts[0]);
        rec.first_name = cleanStr(parts[1]);
        break;
      }
      case 'NICKNAME': rec.nickname = v; break;
      case 'EMAIL': rec.emails.push({ label: labelFromParams(params, 'personal'), email: v }); break;
      case 'TEL': rec.phones.push({ label: labelFromParams(params, 'mobile'), phone: v }); break;
      case 'BDAY': rec.birthday = normalizeDate(v); break;
      case 'ADR': {
        const parts = value.split(';');
        addrParts = cleanStr([parts[3], parts[4]].filter(Boolean).join(', ')); // city, region
        break;
      }
      case 'ORG': rec.occupation = rec.occupation || null; rec.company = cleanStr(value.split(';')[0]); break;
      case 'TITLE': rec.occupation = v; break;
      case 'URL': rec.website = v; break;
      case 'NOTE': rec.bio = v; break;
      case 'X-SOCIALPROFILE': {
        const platform = cleanStr(params.TYPE) || 'other';
        rec.social_links.push({ platform: platform.toLowerCase(), username: null, url: v });
        break;
      }
      default: break;
    }
  }
  if (addrParts && !rec.location) rec.location = addrParts;
  return rec;
}

/**
 * Parse a .vcf buffer/string → array of normalized records.
 * Never throws on individual bad cards; returns { records, errors }.
 */
function parseVcf(input) {
  const text = Buffer.isBuffer(input) ? input.toString('utf8') : String(input);
  const cards = splitCards(text);
  const records = [];
  const errors = [];

  for (let i = 0; i < cards.length; i++) {
    try {
      const props = parseCardManual(cards[i]);
      const rec = recordFromProps(props);
      records.push(makeRecord(rec));
    } catch (err) {
      errors.push(`Card ${i + 1}: ${err.message}`);
    }
  }
  if (!cards.length) errors.push('No vCards found in file — format not supported');
  return { records, errors };
}

module.exports = { parse: parseVcf, extensions: ['.vcf', '.vcard'] };
