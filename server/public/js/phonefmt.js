// Phone + address display formatting. No external libs — best-effort
// international grouping for the most common country codes, generic fallback
// for the rest. Phones are STORED as the formatted display string (the phone
// column is display text); normalizePhone() gives an E.164-ish form when a
// machine-readable value is needed.

// Digit grouping per country code (applied to the national significant number).
// '1' is special-cased to the +1 (AAA) BBB-CCCC NANP style below.
const GROUPS = {
  '7': [3, 3, 2, 2],   // Russia/Kazakhstan
  '31': [1, 4, 4],     // Netherlands
  '33': [1, 2, 2, 2, 2], // France
  '34': [3, 3, 3],     // Spain
  '39': [3, 3, 4],     // Italy
  '44': [4, 6],        // UK
  '49': [3, 4, 4],     // Germany
  '52': [2, 4, 4],     // Mexico
  '55': [2, 5, 4],     // Brazil
  '61': [1, 4, 4],     // Australia
  '81': [2, 4, 4],     // Japan
  '82': [2, 4, 4],     // South Korea
  '86': [3, 4, 4],     // China
  '91': [5, 5],        // India
};

/** Apply a grouping pattern; leftover digits are appended as a final group. */
function groupDigits(digits, groups) {
  const parts = [];
  let i = 0;
  for (const g of groups) {
    if (i >= digits.length) break;
    parts.push(digits.slice(i, i + g));
    i += g;
  }
  if (i < digits.length) parts.push(digits.slice(i));
  return parts.join(' ');
}

/** Generic fallback: rest grouped in 3s. */
function genericGroups(digits) {
  const parts = [];
  for (let i = 0; i < digits.length; i += 3) parts.push(digits.slice(i, i + 3));
  return parts.join(' ');
}

/** NANP pretty form for a 10-digit national number. */
function nanp(d) {
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`;
}

/**
 * formatPhone(raw) → best-effort international display format.
 * - keeps a leading '+', strips all other non-digits
 * - '+CC…' → per-country grouping (top ~15 codes), generic 3s otherwise
 * - no '+': 10 digits → assume US (+1 (AAA) BBB-CCCC); 11 digits starting
 *   with 1 → same; anything else is left exactly as typed.
 */
export function formatPhone(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return s;
  const hasPlus = s.startsWith('+');
  const digits = s.replace(/\D/g, '');
  if (!hasPlus) {
    if (digits.length === 10) return `+1 ${nanp(digits)}`;
    if (digits.length === 11 && digits[0] === '1') return `+1 ${nanp(digits.slice(1))}`;
    return s; // leave as typed
  }
  if (!digits) return s;
  // country code: NANP + Russia are 1-digit; try 3/2/1-digit table matches,
  // otherwise guess a 2-digit code (best-effort — display only).
  let cc = null;
  if (digits[0] === '1') cc = '1';
  else {
    for (const len of [3, 2, 1]) {
      const p = digits.slice(0, len);
      if (GROUPS[p]) { cc = p; break; }
    }
    if (!cc) cc = digits.slice(0, 2);
  }
  const rest = digits.slice(cc.length);
  if (!rest) return `+${cc}`;
  // NANP: national number is exactly 10 digits. Ten → format directly. More
  // than ten means the input was previously mangled (e.g. a stray group split
  // like "+1 123 456 789 01" → 11 rest digits) — take the first 10 so a bad
  // stored value reformats cleanly. Fewer than ten stays loosely grouped.
  if (cc === '1') {
    if (rest.length >= 10) return `+1 ${nanp(rest.slice(0, 10))}`;
    return `+1 ${genericGroups(rest)}`;
  }
  const groups = GROUPS[cc];
  return `+${cc} ${groups ? groupDigits(rest, groups) : genericGroups(rest)}`;
}

/** Render-time safety wrapper: never throws, falls back to the raw value. */
export function formatPhoneSafe(raw) {
  try { return formatPhone(raw) || String(raw ?? ''); } catch { return String(raw ?? ''); }
}

/** normalizePhone(raw) → E.164-ish '+1234…' for storage/comparison. */
export function normalizePhone(raw) {
  const s = String(raw ?? '').trim();
  const digits = s.replace(/\D/g, '');
  if (!digits) return '';
  if (s.startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`;
  return digits;
}

/**
 * As-you-type formatting on a phone <input>. Reformats on input and places
 * the caret at the end (acceptable per UX decision — keeps the code simple).
 */
export function attachPhoneInput(input) {
  if (!input || input.dataset.phoneBound) return;
  input.dataset.phoneBound = '1';
  input.addEventListener('input', () => {
    const v = input.value;
    let f;
    try { f = formatPhone(v); } catch { return; }
    if (f !== v) {
      input.value = f;
      try { input.setSelectionRange(f.length, f.length); } catch { /* type=number etc. */ }
    }
  });
}

const US_RE = /^(us|usa|u\.s\.?a?\.?|united states( of america)?)$/i;

/** True when the country field is empty or a US spelling. */
export function isUSCountry(country) {
  const c = String(country ?? '').trim();
  return !c || US_RE.test(c);
}

/**
 * formatAddress({street,city,state,zip,country}) →
 * 'Street, City, ST ZIP, Country' — omits empties, no dangling commas.
 * Country is appended only when present and not US/USA/United States.
 */
export function formatAddress(a = {}) {
  const street = String(a.street ?? '').trim();
  const city = String(a.city ?? '').trim();
  const state = String(a.state ?? '').trim();
  const zip = String(a.zip ?? '').trim();
  const country = String(a.country ?? '').trim();
  const cityLine = [city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const parts = [street, cityLine].filter(Boolean);
  if (country && !isUSCountry(country)) parts.push(country);
  return parts.join(', ');
}
