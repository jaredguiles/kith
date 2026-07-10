'use strict';

// Local-first geocoding (§privacy: never call public internet geocoders).
//   geocodeLocal(text)  — in-memory geonames lookup (server/data/*.tsv)
//   geocodeRemote(text) — optional self-hosted Photon instance (PHOTON_URL)
//   geocode(text)       — remote → local, results cached in geo_cache
//
// Data files (committed, trimmed from geonames.org cities5000 + admin1CodesASCII,
// CC-BY 4.0 — https://www.geonames.org/):
//   server/data/cities.tsv — name|asciiname|admin1code|countrycode|lat|lng|population
//   server/data/admin1.tsv — CC.ADM1|name|asciiname

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { query } = require('../database/connection');

const DATA_DIR = path.join(__dirname, '..', 'data');

// ---------------------------------------------------------------------------
// Country name → ISO 3166-1 alpha-2 (common English names; lookup is
// normalized so case/punctuation don't matter). Not exhaustive — ISO codes
// always work directly.
// ---------------------------------------------------------------------------
const COUNTRY_NAMES = {
  'united states': 'US', 'united states of america': 'US', usa: 'US', america: 'US',
  'united kingdom': 'GB', uk: 'GB', 'great britain': 'GB', england: 'GB', scotland: 'GB', wales: 'GB',
  canada: 'CA', mexico: 'MX', brazil: 'BR', argentina: 'AR', chile: 'CL', colombia: 'CO', peru: 'PE',
  venezuela: 'VE', ecuador: 'EC', bolivia: 'BO', uruguay: 'UY', paraguay: 'PY', cuba: 'CU',
  germany: 'DE', france: 'FR', spain: 'ES', italy: 'IT', portugal: 'PT', netherlands: 'NL',
  'the netherlands': 'NL', holland: 'NL', belgium: 'BE', switzerland: 'CH', austria: 'AT',
  poland: 'PL', 'czech republic': 'CZ', czechia: 'CZ', slovakia: 'SK', hungary: 'HU',
  romania: 'RO', bulgaria: 'BG', greece: 'GR', turkey: 'TR', 'türkiye': 'TR', ukraine: 'UA',
  russia: 'RU', 'russian federation': 'RU', belarus: 'BY', sweden: 'SE', norway: 'NO',
  denmark: 'DK', finland: 'FI', iceland: 'IS', ireland: 'IE', croatia: 'HR', serbia: 'RS',
  slovenia: 'SI', bosnia: 'BA', 'bosnia and herzegovina': 'BA', albania: 'AL',
  'north macedonia': 'MK', macedonia: 'MK', montenegro: 'ME', kosovo: 'XK', moldova: 'MD',
  lithuania: 'LT', latvia: 'LV', estonia: 'EE', luxembourg: 'LU', malta: 'MT', cyprus: 'CY',
  china: 'CN', japan: 'JP', 'south korea': 'KR', korea: 'KR', 'north korea': 'KP', india: 'IN',
  pakistan: 'PK', bangladesh: 'BD', 'sri lanka': 'LK', nepal: 'NP', thailand: 'TH',
  vietnam: 'VN', 'viet nam': 'VN', cambodia: 'KH', laos: 'LA', myanmar: 'MM', burma: 'MM',
  malaysia: 'MY', singapore: 'SG', indonesia: 'ID', philippines: 'PH', taiwan: 'TW',
  'hong kong': 'HK', macau: 'MO', mongolia: 'MN', kazakhstan: 'KZ', uzbekistan: 'UZ',
  afghanistan: 'AF', iran: 'IR', iraq: 'IQ', israel: 'IL', palestine: 'PS', jordan: 'JO',
  lebanon: 'LB', syria: 'SY', 'saudi arabia': 'SA', yemen: 'YE', oman: 'OM', qatar: 'QA',
  kuwait: 'KW', bahrain: 'BH', 'united arab emirates': 'AE', uae: 'AE', georgia: 'GE',
  armenia: 'AM', azerbaijan: 'AZ', egypt: 'EG', libya: 'LY', tunisia: 'TN', algeria: 'DZ',
  morocco: 'MA', sudan: 'SD', ethiopia: 'ET', eritrea: 'ER', somalia: 'SO', kenya: 'KE',
  uganda: 'UG', tanzania: 'TZ', rwanda: 'RW', burundi: 'BI', congo: 'CG',
  'democratic republic of the congo': 'CD', drc: 'CD', nigeria: 'NG', ghana: 'GH',
  'ivory coast': 'CI', "cote d'ivoire": 'CI', senegal: 'SN', mali: 'ML', niger: 'NE',
  chad: 'TD', cameroon: 'CM', gabon: 'GA', angola: 'AO', zambia: 'ZM', zimbabwe: 'ZW',
  mozambique: 'MZ', malawi: 'MW', botswana: 'BW', namibia: 'NA', 'south africa': 'ZA',
  madagascar: 'MG', mauritius: 'MU', australia: 'AU', 'new zealand': 'NZ', fiji: 'FJ',
  'papua new guinea': 'PG', 'costa rica': 'CR', panama: 'PA', nicaragua: 'NI', honduras: 'HN',
  'el salvador': 'SV', guatemala: 'GT', belize: 'BZ', jamaica: 'JM', haiti: 'HT',
  'dominican republic': 'DO', 'puerto rico': 'PR', bahamas: 'BS', barbados: 'BB',
  'trinidad and tobago': 'TT', guyana: 'GY', suriname: 'SR',
};

const ISO_CODES = new Set(Object.values(COUNTRY_NAMES));
// Any 2-letter uppercase-able token that exists as a country code in the data
// is also accepted (built during load).

// ---------------------------------------------------------------------------
// Lazy-loaded in-memory index
// ---------------------------------------------------------------------------
let loaded = false;
let cityIndex = null;    // Map<normName, Array<city>>
let admin1ByCode = null; // Map<'CC.CODE', {name, ascii}>
let admin1ByName = null; // Map<'cc|normName', code>
let countryCodes = null; // Set<'US',...> present in the data

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function load() {
  if (loaded) return;
  loaded = true;
  cityIndex = new Map();
  admin1ByCode = new Map();
  admin1ByName = new Map();
  countryCodes = new Set();

  try {
    const adminRaw = fs.readFileSync(path.join(DATA_DIR, 'admin1.tsv'), 'utf8');
    for (const line of adminRaw.split('\n')) {
      if (!line) continue;
      const [code, name, ascii] = line.split('\t');
      if (!code) continue;
      admin1ByCode.set(code, { name, ascii });
      const cc = code.slice(0, 2).toLowerCase();
      const adm = code.slice(3);
      if (ascii) admin1ByName.set(`${cc}|${norm(ascii)}`, adm);
      if (name) admin1ByName.set(`${cc}|${norm(name)}`, adm);
    }
  } catch (err) {
    console.error('[geo] failed to load admin1.tsv:', err.message);
  }

  try {
    const citiesRaw = fs.readFileSync(path.join(DATA_DIR, 'cities.tsv'), 'utf8');
    for (const line of citiesRaw.split('\n')) {
      if (!line) continue;
      const parts = line.split('\t');
      if (parts.length < 7) continue;
      const city = {
        name: parts[0],
        ascii: parts[1],
        admin1: parts[2],
        cc: parts[3],
        lat: Number(parts[4]),
        lng: Number(parts[5]),
        pop: Number(parts[6]) || 0,
      };
      if (!Number.isFinite(city.lat) || !Number.isFinite(city.lng)) continue;
      countryCodes.add(city.cc);
      const keys = new Set([norm(city.ascii), norm(city.name)]);
      for (const k of keys) {
        if (!k) continue;
        const arr = cityIndex.get(k);
        if (arr) arr.push(city); else cityIndex.set(k, [city]);
      }
    }
    console.log(`[geo] loaded ${cityIndex.size} city name keys`);
  } catch (err) {
    console.error('[geo] failed to load cities.tsv:', err.message);
  }
}

function cityLabel(city) {
  const admin = admin1ByCode.get(`${city.cc}.${city.admin1}`);
  const parts = [city.name];
  if (admin && admin.name) parts.push(admin.name);
  parts.push(city.cc);
  return parts.join(', ');
}

/**
 * Resolve a qualifier token ("OR", "Oregon", "Germany", "DE") against a city
 * candidate. Returns true when the qualifier matches the city's admin1 or country.
 */
function qualifierMatches(city, qualifier) {
  const q = norm(qualifier);
  if (!q) return true;
  const upper = qualifier.trim().toUpperCase();
  // country ISO code
  if (upper.length === 2 && (countryCodes.has(upper) || ISO_CODES.has(upper)) && city.cc === upper) return true;
  // country name
  const ccFromName = COUNTRY_NAMES[q];
  if (ccFromName && city.cc === ccFromName) return true;
  // admin1 code (e.g. "OR", "TX", "08")
  if (city.admin1 && city.admin1.toUpperCase() === upper) return true;
  // admin1 name (e.g. "Oregon") within the city's country
  const admCode = admin1ByName.get(`${city.cc.toLowerCase()}|${q}`);
  if (admCode && city.admin1 === admCode) return true;
  return false;
}

/**
 * Local geocode. Accepts "City", "City, Region", "City, Region, Country",
 * "City, Country". Prefers higher population on ambiguity.
 * Returns {lat, lng, label, source:'geonames'} or null.
 */
function geocodeLocal(text) {
  if (!text || typeof text !== 'string') return null;
  load();
  const segments = text.split(',').map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return null;

  // Try progressively: first segment is the city; remaining are qualifiers.
  const cityKey = norm(segments[0]);
  if (!cityKey) return null;
  let candidates = cityIndex.get(cityKey) || [];
  if (candidates.length === 0) return null;

  const qualifiers = segments.slice(1, 3); // at most 2 qualifiers considered
  let filtered = candidates;
  for (const qual of qualifiers) {
    const next = filtered.filter((c) => qualifierMatches(c, qual));
    if (next.length > 0) filtered = next;
    // Unmatchable qualifier: keep previous set (be forgiving with messy input)
  }

  let best = null;
  for (const c of filtered) if (!best || c.pop > best.pop) best = c;
  if (!best) return null;
  return { lat: best.lat, lng: best.lng, label: cityLabel(best), source: 'geonames' };
}

/**
 * Remote geocode via a self-hosted Photon instance (env PHOTON_URL).
 * Returns {lat, lng, label, source:'photon'} or null. 3s timeout; never throws.
 */
async function geocodeRemote(text) {
  const base = process.env.PHOTON_URL;
  if (!base || !text) return null;
  try {
    const url = `${base.replace(/\/+$/, '')}/api?q=${encodeURIComponent(text)}&limit=1`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    let resp;
    try {
      resp = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!resp.ok) return null;
    const geo = await resp.json();
    const feat = geo && Array.isArray(geo.features) ? geo.features[0] : null;
    if (!feat || !feat.geometry || !Array.isArray(feat.geometry.coordinates)) return null;
    const [lng, lat] = feat.geometry.coordinates.map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const p = feat.properties || {};
    const label = [p.name, p.city, p.state, p.country]
      .filter((v, i, a) => v && a.indexOf(v) === i)
      .join(', ') || text;
    return { lat, lng, label: label.slice(0, 255), source: 'photon' };
  } catch {
    return null; // timeout / network / bad JSON — remote is best-effort
  }
}

function queryHash(text) {
  return crypto.createHash('sha256').update(norm(text)).digest('hex');
}

/**
 * City-level query? No digits (street numbers/ZIPs) and ≤3 comma segments —
 * e.g. "Portland, OR" / "Berlin, Germany". These resolve via the local
 * geonames index FIRST: its qualifier matching (state code/name, country)
 * is exact, whereas remote free-text ranking has mis-placed "City, ST".
 */
function looksCityLevel(text) {
  const s = String(text);
  return !/\d/.test(s) && s.split(',').length <= 3;
}

/**
 * Full geocode with geo_cache: city-level → local first (exact qualifier
 * match), street-level → remote first (Photon precision). Caches hits AND
 * misses (source 'none') so repeated lookups stay cheap.
 * Returns {lat, lng, label, source} or null.
 */
async function geocode(text) {
  if (!text || !String(text).trim()) return null;
  const normalized = norm(text);
  if (!normalized) return null;
  const hash = queryHash(text);

  try {
    const rows = await query('SELECT latitude, longitude, label, source FROM geo_cache WHERE query_hash = ?', [hash]);
    if (rows.length) {
      const r = rows[0];
      if (r.latitude == null || r.longitude == null) return null; // cached miss
      return { lat: Number(r.latitude), lng: Number(r.longitude), label: r.label, source: r.source };
    }
  } catch (err) {
    console.error('[geo] cache read failed:', err.message);
  }

  const result = looksCityLevel(text)
    ? (geocodeLocal(text) || await geocodeRemote(text))
    : ((await geocodeRemote(text)) || geocodeLocal(text));

  try {
    await query(
      `INSERT INTO geo_cache (query_hash, query, latitude, longitude, label, source)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE latitude = VALUES(latitude), longitude = VALUES(longitude),
         label = VALUES(label), source = VALUES(source)`,
      [hash, String(text).slice(0, 500), result ? result.lat : null, result ? result.lng : null,
       result ? result.label : null, result ? result.source : 'none']
    );
  } catch (err) {
    console.error('[geo] cache write failed:', err.message);
  }

  return result;
}

module.exports = { geocode, geocodeLocal, geocodeRemote, queryHash, looksCityLevel };
