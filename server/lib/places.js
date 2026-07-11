'use strict';

// Visited-places helpers: static US state list, country name → ISO 3166-1
// alpha-2 resolution, and parseGeoLabel() which extracts city/state/country
// metadata from the labels produced by lib/geo (geonames labels end in the
// ISO country code — "Portland, Oregon, US" — while Photon labels end in a
// full country name — "Berlin, Germany"). Used by routes/events.js (storing
// event_locations geo metadata) and routes/timeline.js (deriving visited
// states/countries for the Places tab).
//
// The frontend keeps its own display lists (public/js/geodata.js) — codes
// must agree (ISO 3166-1 alpha-2 / USPS state codes) but the display list
// over there is presentation-only.

const US_STATES = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'],
  ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'],
  ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'], ['ID', 'Idaho'],
  ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'],
  ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'],
  ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'],
  ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'],
  ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'],
  ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'],
  ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'],
  ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'],
  ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'],
  ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
].map(([code, name]) => ({ code, name }));

const US_STATE_CODES = new Set(US_STATES.map((s) => s.code));

// Common country names → ISO alpha-2 (mirrors the resolution table in
// lib/geo.js — kept local because geo.js doesn't export it). Not exhaustive;
// two-letter ISO codes always resolve directly.
const COUNTRY_CODE_BY_NAME = {
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

function normName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Case-insensitive US state name index ("oregon" → "OR")
const STATE_CODE_BY_NAME = new Map(US_STATES.map((s) => [normName(s.name), s.code]));

/** Resolve a US state token — "OR" or "Oregon" — to its USPS code, or null. */
function usStateCode(token) {
  const t = String(token || '').trim();
  if (!t) return null;
  const upper = t.toUpperCase();
  if (upper.length === 2 && US_STATE_CODES.has(upper)) return upper;
  return STATE_CODE_BY_NAME.get(normName(t)) || null;
}

/** Resolve a country token — "US", "United States", "Germany" — to ISO
 * alpha-2, or null. Bare 2-letter tokens are trusted as ISO codes. */
function countryCode(token) {
  const t = String(token || '').trim();
  if (!t) return null;
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  return COUNTRY_CODE_BY_NAME[normName(t)] || null;
}

/**
 * Extract { city, state, state_code, country_code } from a geocoder label.
 * Handles both label shapes produced by lib/geo:
 *   geonames — "Portland, Oregon, US" / "Berlin, DE"
 *   photon   — "Alexanderplatz, Berlin, Germany" / "Paris, France"
 * Best-effort: unrecognized segments simply yield nulls.
 */
function parseGeoLabel(label) {
  const segs = String(label || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!segs.length) return { city: null, state: null, state_code: null, country_code: null };

  const country = segs.length >= 2 ? countryCode(segs[segs.length - 1]) : countryCode(segs[0]);
  let stateCode = null;
  let stateName = null;
  if (country === 'US' && segs.length >= 2) {
    // segment before the country is the admin1 (state) when present
    const cand = segs.length >= 3 ? segs[segs.length - 2] : segs[0];
    stateCode = usStateCode(cand);
    if (stateCode) stateName = US_STATES.find((s) => s.code === stateCode)?.name || cand;
  }
  const city = segs.length >= 2 ? segs[0] : (country ? null : segs[0]);
  return { city: city || null, state: stateName, state_code: stateCode, country_code: country };
}

module.exports = { US_STATES, US_STATE_CODES, usStateCode, countryCode, parseGeoLabel };
