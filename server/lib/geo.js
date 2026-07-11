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
 * Does a Photon feature satisfy a free-typed qualifier ("MI", "Michigan",
 * "Germany", "US")? Photon returns FULL state names ("Michigan") while users
 * type USPS-style abbreviations ("MI") — resolve via the admin1 index.
 *
 * BUGFIX (Gowen, MI → Mississippi): geocodeRemote used to take Photon's
 * features[0] blindly. Photon's free-text ranking treats "MI" as a fuzzy
 * token, so a "City, ST" query could rank a same-named place in another
 * state first (and the wrong hit then stuck forever in geo_cache). Every
 * remote candidate is now validated against the typed qualifiers.
 */
function remoteQualifierMatches(props, qualifier) {
  // "MI 49326" — free-typed state+ZIP in one comma segment: match on the
  // non-numeric part ("MI"); a pure-ZIP segment is treated as always-true
  // (Photon itself matched the postcode).
  const zipless = String(qualifier).replace(/\b\d{3,10}(-\d+)?\b/g, ' ').trim();
  if (zipless !== String(qualifier).trim()) {
    return zipless ? remoteQualifierMatches(props, zipless) : true;
  }
  const q = norm(qualifier);
  if (!q) return true;
  load(); // admin1 index resolves state abbreviations
  const upper = String(qualifier).trim().toUpperCase();
  const cc = String(props.countrycode || '').toUpperCase();
  // country: ISO code or common English name
  if (upper.length === 2 && cc === upper) return true;
  if (COUNTRY_NAMES[q] && COUNTRY_NAMES[q] === cc) return true;
  if (props.country && norm(props.country) === q) return true;
  // state / admin1: full name, or abbreviation resolved through admin1.tsv
  // (Photon is inconsistent — `state` may be "Michigan" OR "MI")
  if (props.state && norm(props.state) === q) return true;
  if (upper.length === 2 && props.state) {
    const code = admin1ByName.get(`${cc.toLowerCase()}|${norm(props.state)}`);
    if (code && code.toUpperCase() === upper) return true;
  }
  if (props.state && props.state.length === 2) {
    const qCode = admin1ByName.get(`${cc.toLowerCase()}|${q}`);
    if (qCode && qCode.toUpperCase() === props.state.toUpperCase()) return true;
  }
  // looser containers (qualifier was a county, the enclosing city, or —
  // for street-level hits inside a hamlet — Photon's `district`)
  if (props.county && norm(props.county) === q) return true;
  if (props.city && norm(props.city) === q) return true;
  if (props.district && norm(props.district) === q) return true;
  return false;
}

/** Photon feature → normalized candidate {label, name, city, state, country,
 * countrycode, lat, lng, type, source} or null when malformed. */
function photonCandidate(feat) {
  if (!feat || !feat.geometry || !Array.isArray(feat.geometry.coordinates)) return null;
  const [lng, lat] = feat.geometry.coordinates.map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const p = feat.properties || {};
  const label = [p.name, p.city, p.state, p.country]
    .filter((v, i, a) => v && a.indexOf(v) === i)
    .join(', ');
  if (!label) return null;
  return {
    label: label.slice(0, 255),
    name: p.name || null,
    city: p.city || (p.osm_key === 'place' ? p.name : null) || null,
    state: p.state || null,
    country: p.country || null,
    countrycode: p.countrycode || null,
    lat, lng,
    type: p.osm_value || p.type || null,
    source: 'photon',
  };
}

// place-ish OSM values a human means when typing "City, ST"
const PLACE_VALUES = new Set(['city', 'town', 'village', 'hamlet', 'borough',
  'suburb', 'district', 'municipality', 'locality', 'county', 'state', 'country']);

/**
 * Multi-candidate remote suggest via self-hosted Photon (env PHOTON_URL).
 * Candidates are scored: qualifier match (state/country the user typed)
 * dominates, then place-type over street/POI, then exact name match.
 * Each candidate carries `matchesQuery` = satisfied EVERY typed qualifier.
 * Returns [] on timeout/network/bad JSON — remote is best-effort.
 */
async function remoteSuggest(text, limit = 8) {
  const base = process.env.PHOTON_URL;
  if (!base || !text) return [];
  const segments = String(text).split(',').map((s) => s.trim()).filter(Boolean);
  const qualifiers = segments.slice(1, 3);
  let feats;
  try {
    const url = `${base.replace(/\/+$/, '')}/api?q=${encodeURIComponent(text)}&limit=${Math.max(Number(limit) || 8, 10)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    let resp;
    try {
      resp = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!resp.ok) return [];
    const geo = await resp.json();
    feats = geo && Array.isArray(geo.features) ? geo.features : [];
  } catch {
    return [];
  }
  const scored = [];
  for (let i = 0; i < feats.length; i++) {
    const p = feats[i].properties || {};
    const cand = photonCandidate(feats[i]);
    if (!cand) continue;
    const matched = qualifiers.filter((q) => remoteQualifierMatches(p, q)).length;
    cand.matchesQuery = matched === qualifiers.length;
    let score = matched * 100;
    if (p.osm_key === 'place' || p.osm_key === 'boundary') score += 20;
    if (PLACE_VALUES.has(String(p.osm_value))) score += 10;
    if (segments[0] && norm(p.name) === norm(segments[0])) score += 5;
    scored.push({ score, i, cand });
  }
  scored.sort((a, b) => b.score - a.score || a.i - b.i); // stable: Photon order on ties
  return scored.slice(0, limit).map((s) => s.cand);
}

/**
 * Remote geocode via a self-hosted Photon instance (env PHOTON_URL).
 * Returns {lat, lng, label, source:'photon'} or null. 3s timeout; never throws.
 * When the query carries qualifiers ("City, ST" / "City, Country") only a
 * candidate matching ALL of them is accepted — no match → null (callers fall
 * back to the local index or leave the text un-pinned) rather than guessing.
 */
async function geocodeRemote(text) {
  const list = await remoteSuggest(text, 10);
  if (!list.length) return null;
  const hasQualifiers = String(text).split(',').map((s) => s.trim()).filter(Boolean).length > 1;
  const best = hasQualifiers ? list.find((c) => c.matchesQuery) : list[0];
  if (!best) return null;
  return { lat: best.lat, lng: best.lng, label: best.label, source: 'photon' };
}

/**
 * Local multi-candidate suggest: prefix search over the geonames city index.
 * "gow" → cities starting with "gow"; qualifiers filter like geocodeLocal.
 * Returns candidates shaped like remoteSuggest's, source 'geonames'.
 */
function localSuggest(text, limit = 8) {
  if (!text || typeof text !== 'string') return [];
  load();
  const segments = text.split(',').map((s) => s.trim()).filter(Boolean);
  const prefix = norm(segments[0] || '');
  if (!prefix) return [];
  const qualifiers = segments.slice(1, 3);
  const seen = new Set(); // same city object is indexed under name + asciiname
  let matches = [];
  for (const [key, arr] of cityIndex) {
    if (!key.startsWith(prefix)) continue;
    for (const c of arr) {
      if (seen.has(c)) continue;
      seen.add(c);
      matches.push(c);
    }
  }
  for (const qual of qualifiers) {
    const next = matches.filter((c) => qualifierMatches(c, qual));
    if (next.length > 0) matches = next;
  }
  matches.sort((a, b) => b.pop - a.pop);
  return matches.slice(0, limit).map((c) => {
    const admin = admin1ByCode.get(`${c.cc}.${c.admin1}`);
    return {
      label: cityLabel(c),
      name: c.name,
      city: c.name,
      state: (admin && admin.name) || null,
      country: c.cc,
      countrycode: c.cc,
      lat: c.lat,
      lng: c.lng,
      type: 'city',
      source: 'geonames',
      matchesQuery: true,
    };
  });
}

/**
 * Combined suggest for typeahead UIs (GET /api/geo/suggest): local geonames
 * prefix matches first (exact qualifier semantics, offline), then remote
 * Photon candidates (covers small places like hamlets that the trimmed
 * cities5000 extract lacks). Deduped by normalized label, capped at `limit`.
 */
async function suggest(text, limit = 8) {
  const cap = Math.max(1, Math.min(Number(limit) || 8, 15));
  const local = localSuggest(text, cap);
  const remote = await remoteSuggest(text, cap);
  const out = [];
  const seen = new Set();
  for (const cand of [...local, ...remote]) {
    // dedupe on name|state|country-code — label text differs between sources
    // ('Portland, Oregon, US' vs 'Portland, Oregon, United States')
    const key = cand.city || cand.name
      ? `${norm(cand.city || cand.name)}|${norm(cand.state)}|${String(cand.countrycode || '').toUpperCase()}`
      : norm(cand.label);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cand);
    if (out.length >= cap) break;
  }
  return out;
}

// Cache-key version: bumped to v2 when remote ranking learned qualifier
// validation — pre-v2 geo_cache rows may hold mis-ranked hits (e.g. the
// "Gowen, MI" → Mississippi pin) and must never be served again. Old rows
// are simply orphaned; the next lookup re-geocodes and re-caches under v2.
const CACHE_VERSION = 'v2|';

function queryHash(text) {
  return crypto.createHash('sha256').update(CACHE_VERSION + norm(text)).digest('hex');
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

module.exports = { geocode, geocodeLocal, geocodeRemote, queryHash, looksCityLevel, suggest, localSuggest, remoteSuggest };
