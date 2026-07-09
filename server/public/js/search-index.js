// Client-side full-text people search powered by MiniSearch (vendored, MIT).
// Hybrid model: MiniSearch indexes the full contact list (instant, fuzzy,
// typo-tolerant, prefix) for PEOPLE results; the server /api/search still
// supplies notes/events/groups. The index is cached in module scope with a
// staleness flag and rebuilt lazily on demand (debounced by the caller).

import MiniSearch from '/vendor/minisearch/minisearch.js';
import { api, qs } from './api.js';

let mini = null;
let building = null;   // in-flight build promise (dedupe concurrent callers)
let stale = true;      // set true on contact create/edit/delete

const FIELDS = ['display_name', 'nickname', 'first_name', 'last_name',
  'email', 'phone', 'location', 'occupation', 'company', 'bio', 'notes_text', 'tags_text'];
const STORE = ['id', 'display_name', 'photo_url', 'subtitle'];

/** Mark the index stale so the next ensureIndex() rebuilds it. */
export function invalidateSearchIndex() { stale = true; }

function toDoc(c) {
  return {
    id: c.id,
    display_name: c.display_name || '',
    nickname: c.nickname || '',
    first_name: c.first_name || '',
    last_name: c.last_name || '',
    email: c.email || '',
    phone: c.phone || '',
    location: c.location || '',
    occupation: c.occupation || '',
    company: c.company || '',
    bio: c.bio || '',
    notes_text: c.notes_text || '',
    tags_text: Array.isArray(c.tags) ? c.tags.map((t) => t.name || t).join(' ') : '',
    photo_url: c.photo_url || '',
    subtitle: [c.occupation, c.company, c.location].filter(Boolean).join(' · '),
  };
}

async function build() {
  const ms = new MiniSearch({
    fields: FIELDS,
    storeFields: STORE,
    searchOptions: { prefix: true, fuzzy: 0.3, maxFuzzy: 4, boost: { display_name: 3, nickname: 2 } },
  });
  // /api/contacts caps limit at 200 server-side; fetch the full first page.
  const data = await api.get('/api/contacts' + qs({ limit: 200, sort: 'name' }));
  const contacts = data.contacts || data.data || [];
  ms.addAll(contacts.map(toDoc));
  mini = ms;
  stale = false;
  return ms;
}

/** Ensure a fresh index exists; rebuilds when stale. Safe under concurrency. */
export async function ensureIndex() {
  if (mini && !stale) return mini;
  if (building) return building;
  building = build().catch((err) => { building = null; throw err; });
  const res = await building;
  building = null;
  return res;
}

/** Ranked, fuzzy, typo-tolerant people search. Returns stored contact docs. */
export async function searchPeople(q, limit = 8) {
  if (!q) return [];
  let ms;
  try { ms = await ensureIndex(); } catch { return []; }
  return ms.search(q).slice(0, limit).map((r) => ({
    id: r.id, display_name: r.display_name, photo_url: r.photo_url, subtitle: r.subtitle,
  }));
}
