'use strict';

// Rule-based match detection (SPEC weight table). Deterministic, no ML (D2).
// Matches ONLY on cleartext fields (email/phone/name/social/location) — §7.E.
//
//   Exact email          0.95
//   Exact phone          0.95
//   Exact name           0.80
//   Fuzzy name           0.55
//   Shared social link   0.85
//   Location + name sim  0.50
//   Threshold            0.50 — suggest, never auto-commit.

const { normalizeEmail, normalizePhone, cleanStr } = require('./normalizer');

function normName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

/** Levenshtein-based similarity 0..1. */
function nameSimilarity(a, b) {
  a = normName(a); b = normName(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > Math.max(la, lb) * 0.5) return 0;
  const dp = Array.from({ length: la + 1 }, (_, i) => [i, ...Array(lb).fill(0)]);
  for (let j = 0; j <= lb; j++) dp[0][j] = j;
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return 1 - dp[la][lb] / Math.max(la, lb);
}

/**
 * Score a normalized import record against a candidate contact.
 * candidate: { contact, emails[], phones[], socials[] } — all cleartext.
 * Returns the highest applicable signal weight (signals don't stack; the
 * strongest single signal wins, matching the SPEC's table semantics).
 */
function scoreCandidate(record, candidate) {
  const { contact, emails = [], phones = [], socials = [] } = candidate;
  let best = 0;

  // exact email
  const recEmails = new Set((record.emails || []).map((e) => normalizeEmail(e.email)).filter(Boolean));
  const candEmails = new Set([contact.email, ...emails.map((e) => e.email)].map(normalizeEmail).filter(Boolean));
  for (const e of recEmails) if (candEmails.has(e)) { best = Math.max(best, 0.95); break; }

  // exact phone
  const recPhones = new Set((record.phones || []).map((p) => normalizePhone(p.phone)).filter(Boolean));
  const candPhones = new Set([contact.phone, ...phones.map((p) => p.phone)].map(normalizePhone).filter(Boolean));
  for (const p of recPhones) if (candPhones.has(p)) { best = Math.max(best, 0.95); break; }

  // social link (platform + username)
  const recSocials = new Set((record.social_links || [])
    .filter((s) => s.platform && s.username)
    .map((s) => `${String(s.platform).toLowerCase()}|${String(s.username).toLowerCase()}`));
  for (const s of socials) {
    if (s.platform && s.username && recSocials.has(`${String(s.platform).toLowerCase()}|${String(s.username).toLowerCase()}`)) {
      best = Math.max(best, 0.85);
      break;
    }
  }

  // name signals
  const sim = nameSimilarity(record.display_name, contact.display_name);
  if (sim >= 0.999) best = Math.max(best, 0.80);
  else if (sim >= 0.75) best = Math.max(best, 0.55);

  // location + name similarity
  const recLoc = normName(record.location);
  const candLoc = normName(contact.location);
  if (recLoc && candLoc && (recLoc === candLoc || recLoc.includes(candLoc) || candLoc.includes(recLoc)) && sim >= 0.6) {
    best = Math.max(best, 0.50);
  }

  return Math.round(best * 100) / 100;
}

/**
 * Find the best match for a record among candidates.
 * Returns { contactId, confidence } or null when below threshold.
 */
function findBestMatch(record, candidates, threshold = 0.5) {
  let best = null;
  for (const cand of candidates) {
    const score = scoreCandidate(record, cand);
    if (score >= threshold && (!best || score > best.confidence)) {
      best = { contactId: cand.contact.id, confidence: score };
    }
  }
  return best;
}

module.exports = { scoreCandidate, findBestMatch, nameSimilarity };
