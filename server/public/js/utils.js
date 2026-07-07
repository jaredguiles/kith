// Formatters, helpers, pride flags, zodiac, esc() HTML-escaping.

/**
 * esc() — mandatory HTML escaping for EVERY interpolated value (§7.11).
 * No unsanitized innerHTML of user or imported data, ever.
 */
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Escape for use inside an HTML attribute that is a URL. Blocks javascript: etc. */
export function escUrl(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  if (/^(https?:|mailto:|tel:)/i.test(s)) return esc(s);
  if (/^[/#]/.test(s)) return esc(s);
  return esc('https://' + s);
}

// ---------------------------------------------------------------- dates
export function fmtDate(d) {
  if (!d) return '';
  const date = parseDate(d);
  if (!date) return '';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function fmtDateTime(d) {
  if (!d) return '';
  const date = parseDate(d);
  if (!date) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' · ' + date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function parseDate(d) {
  if (!d) return null;
  if (d instanceof Date) return d;
  const s = String(d);
  // MariaDB dateStrings: "YYYY-MM-DD" or "YYYY-MM-DD HH:MM:SS".
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  // Date-only (birthdays, met_date…): construct as LOCAL midnight so the
  // calendar day never shifts.
  if (m[4] === undefined) return new Date(+m[1], +m[2] - 1, +m[3]);
  // Datetime with an explicit timezone marker: let Date parse it as-is.
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const parsed = new Date(s.replace(' ', 'T'));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  // Bare "YYYY-MM-DD HH:MM:SS" from the DB is UTC — parse it as UTC so
  // timeAgo()/fmtDateTime() don't drift by the local offset.
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +(m[5] || 0), +(m[6] || 0)));
}

export function timeAgo(d) {
  const date = parseDate(d);
  if (!date) return '';
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(date);
}

/** For datetime-local inputs. */
export function toLocalInput(d) {
  const date = parseDate(d);
  if (!date) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
}

/** datetime-local value → "YYYY-MM-DD HH:MM:SS" (UTC) for the API. */
export function fromLocalInput(v) {
  if (!v) return null;
  const local = new Date(v); // datetime-local values parse as local time
  if (Number.isNaN(local.getTime())) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${local.getUTCFullYear()}-${p(local.getUTCMonth() + 1)}-${p(local.getUTCDate())} ` +
    `${p(local.getUTCHours())}:${p(local.getUTCMinutes())}:${p(local.getUTCSeconds())}`;
}

export function ageFromBirthday(birthday) {
  const b = parseDate(birthday);
  if (!b) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) age--;
  return age;
}

export function daysUntilBirthday(birthday) {
  const b = parseDate(birthday);
  if (!b) return null;
  const now = new Date();
  const next = new Date(now.getFullYear(), b.getMonth(), b.getDate());
  if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) next.setFullYear(next.getFullYear() + 1);
  return Math.round((next - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
}

// ---------------------------------------------------------------- zodiac
const ZODIAC = [
  ['Capricorn', 1, 19], ['Aquarius', 2, 18], ['Pisces', 3, 20], ['Aries', 4, 19],
  ['Taurus', 5, 20], ['Gemini', 6, 20], ['Cancer', 7, 22], ['Leo', 8, 22],
  ['Virgo', 9, 22], ['Libra', 10, 22], ['Scorpio', 11, 21], ['Sagittarius', 12, 21],
  ['Capricorn', 12, 31],
];
export function zodiacFromBirthday(birthday) {
  const b = parseDate(birthday);
  if (!b) return null;
  const month = b.getMonth() + 1, day = b.getDate();
  for (const [sign, m, d] of ZODIAC) {
    if (month < m || (month === m && day <= d)) return sign;
  }
  return 'Capricorn';
}

// ------------------------------------------------------------ pride flags
// CSS gradients per BRANDING §8. Straight → no indicator.
const FLAGS = {
  gay: 'linear-gradient(180deg,#e40303 0%,#e40303 16%,#ff8c00 16%,#ff8c00 33%,#ffed00 33%,#ffed00 50%,#008026 50%,#008026 66%,#24408e 66%,#24408e 83%,#732982 83%)',
  queer: 'linear-gradient(180deg,#e40303 0%,#e40303 16%,#ff8c00 16%,#ff8c00 33%,#ffed00 33%,#ffed00 50%,#008026 50%,#008026 66%,#24408e 66%,#24408e 83%,#732982 83%)',
  lesbian: 'linear-gradient(180deg,#d52d00 0%,#d52d00 20%,#ff9a56 20%,#ff9a56 40%,#ffffff 40%,#ffffff 60%,#d362a4 60%,#d362a4 80%,#a30262 80%)',
  bisexual: 'linear-gradient(180deg,#d60270 0%,#d60270 40%,#9b4f96 40%,#9b4f96 60%,#0038a8 60%)',
  pansexual: 'linear-gradient(180deg,#ff218c 0%,#ff218c 33%,#ffd800 33%,#ffd800 66%,#21b1ff 66%)',
  transgender: 'linear-gradient(180deg,#5bcefa 0%,#5bcefa 20%,#f5a9b8 20%,#f5a9b8 40%,#ffffff 40%,#ffffff 60%,#f5a9b8 60%,#f5a9b8 80%,#5bcefa 80%)',
  trans: 'linear-gradient(180deg,#5bcefa 0%,#5bcefa 20%,#f5a9b8 20%,#f5a9b8 40%,#ffffff 40%,#ffffff 60%,#f5a9b8 60%,#f5a9b8 80%,#5bcefa 80%)',
  'non-binary': 'linear-gradient(180deg,#fcf434 0%,#fcf434 25%,#ffffff 25%,#ffffff 50%,#9c59d1 50%,#9c59d1 75%,#2c2c2c 75%)',
  nonbinary: 'linear-gradient(180deg,#fcf434 0%,#fcf434 25%,#ffffff 25%,#ffffff 50%,#9c59d1 50%,#9c59d1 75%,#2c2c2c 75%)',
  asexual: 'linear-gradient(180deg,#000000 0%,#000000 25%,#a3a3a3 25%,#a3a3a3 50%,#ffffff 50%,#ffffff 75%,#800080 75%)',
};

/** Returns a CSS gradient for the orientation's pride flag, or null. */
export function prideFlagGradient(orientation) {
  if (!orientation) return null;
  const key = String(orientation).toLowerCase().trim();
  if (key === 'straight' || key === 'heterosexual') return null;
  return FLAGS[key] || null;
}

// ---------------------------------------------------------------- misc
export function initials(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

export function fmtBytes(n) {
  if (!n && n !== 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0, v = Number(n);
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function pluralize(n, singular, plural) {
  return `${n} ${n === 1 ? singular : (plural || singular + 's')}`;
}
