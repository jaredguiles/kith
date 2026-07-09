// Family page — interactive family tree rendered with family-chart (f3),
// vendored UMD + d3 v7 (loaded on demand, same pattern as Leaflet).
// Data: GET /api/contacts/:id/family-tree → { root, people, edges } with
// normalized edges (parent → child, partner, sibling). Transformed here into
// f3's datum format: { id, data: {...display}, rels: { parents, spouses,
// children } } — all ids strings, all links bidirectional.

import { api, qs } from './api.js';
import { esc, initials, avatarColorIndex, parseDate, debounce } from './utils.js';
import { icon } from './icons.js';
import { emptyState, filterPills } from './components.js';
import { pageRenderers, pageTitles } from './pages.js';
import { state, navigate } from './app.js';
import { openImportModal } from './import.js';

pageTitles.family = 'Family';

// ------------------------------------------------------------ vendor loader
// d3 must be a global BEFORE family-chart's UMD factory runs.
let f3Promise = null;
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => { s.remove(); reject(new Error(`Couldn't load ${src}`)); };
    document.head.appendChild(s);
  });
}
export function loadFamilyChart() {
  if (window.f3) return Promise.resolve(window.f3);
  if (f3Promise) return f3Promise;
  f3Promise = (window.d3 ? Promise.resolve() : loadScript('/vendor/d3/d3.min.js'))
    .then(() => loadScript('/vendor/family-chart/family-chart.min.js'))
    .then(() => {
      if (!window.f3) throw new Error('family-chart failed to initialize');
      return window.f3;
    })
    .catch((err) => { f3Promise = null; throw err; });
  return f3Promise;
}

// --------------------------------------------------------- data transform
function lifeDates(p) {
  const b = p.birthday ? parseDate(p.birthday)?.getFullYear() : null;
  const d = p.is_deceased ? (p.date_of_death ? parseDate(p.date_of_death)?.getFullYear() : '') : null;
  if (b == null && d == null) return '';
  if (d !== null) return `${b ?? '·'} – ${d || '✝'}`;
  return `b. ${b}`;
}

/** contact sex → f3 gender ('M'/'F'; anything else renders genderless). */
function f3Gender(p) {
  const s = String(p.sex || '').toLowerCase();
  if (s === 'male') return 'M';
  if (s === 'female') return 'F';
  return '';
}

/**
 * { people, edges } → f3 datum array. Sibling edges render via shared
 * parents: when one sibling has known parents, the other attaches to them
 * (view-only); when neither does, a shared "Unknown" placeholder parent is
 * synthesized so the pair still renders side by side.
 */
export function toF3Data(data) {
  const persons = new Map();
  for (const p of data.people) {
    persons.set(String(p.id), {
      id: String(p.id),
      data: {
        name: `${p.display_name || 'Unnamed'}${p.is_deceased ? ' ✝' : ''}`,
        dates: lifeDates(p),
        gender: f3Gender(p),
      },
      rels: { parents: [], spouses: [], children: [] },
    });
  }
  const pushOnce = (arr, v) => { if (!arr.includes(v)) arr.push(v); };
  const addParent = (parentId, childId) => {
    const par = persons.get(parentId), ch = persons.get(childId);
    if (!par || !ch || parentId === childId) return;
    pushOnce(ch.rels.parents, parentId);
    pushOnce(par.rels.children, childId);
  };

  for (const e of data.edges) {
    const a = String(e.from), b = String(e.to);
    if (e.type === 'parent') addParent(a, b);
    else if (e.type === 'partner') {
      const pa = persons.get(a), pb = persons.get(b);
      if (pa && pb) { pushOnce(pa.rels.spouses, b); pushOnce(pb.rels.spouses, a); }
    }
  }

  // sibling post-pass (after all real parent edges exist)
  let phNo = 0;
  for (const e of data.edges) {
    if (e.type !== 'sibling') continue;
    const a = persons.get(String(e.from)), b = persons.get(String(e.to));
    if (!a || !b) continue;
    if (a.rels.parents.some((p) => b.rels.parents.includes(p))) continue; // already siblings
    if (a.rels.parents.length) {
      for (const p of [...a.rels.parents]) addParent(p, b.id);
    } else if (b.rels.parents.length) {
      for (const p of [...b.rels.parents]) addParent(p, a.id);
    } else {
      const ph = {
        id: `ph:${phNo++}`,
        data: { name: 'Unknown parent', dates: '', gender: '', placeholder: true },
        rels: { parents: [], spouses: [], children: [] },
      };
      persons.set(ph.id, ph);
      addParent(ph.id, a.id);
      addParent(ph.id, b.id);
    }
  }
  return [...persons.values()];
}

// --------------------------------------------------------------- rendering
/**
 * Two lenses over the same family graph:
 *   'family'   — the close family around a person: parents, siblings,
 *                partner(s), children (one generation up + down).
 *   'ancestry' — the full multi-generation tree, unlimited depth.
 * Both render with family-chart; only the depth limits differ.
 */
function renderChart(host, data, rootId, view) {
  const f3 = window.f3;
  host.innerHTML = `<div class="f3 ft-chart ${view === 'family' ? 'ft-chart-close' : ''}" id="ft-f3"></div>`;
  const el = host.querySelector('#ft-f3');

  const f3Data = toF3Data(data);
  const mainId = String(rootId);
  if (!f3Data.some((d) => d.id === mainId)) return;

  const chart = f3.createChart('#ft-f3', f3Data)
    .setTransitionTime(600)
    .setCardXSpacing(215)
    .setCardYSpacing(130)
    .setShowSiblingsOfMain(true)
    .setSingleParentEmptyCard(false);

  if (view === 'family') {
    // close family: one generation in each direction (siblings ride along
    // via setShowSiblingsOfMain; partners always render beside the person)
    chart.setAncestryDepth(1).setProgenyDepth(1);
  }

  chart.setCardHtml()
    .setCardDisplay([['name'], ['dates']])
    .setOnCardClick((e, d) => {
      const id = d?.data?.id;
      if (!id || String(id).startsWith('ph:')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) {
        navigate(`/family?id=${encodeURIComponent(id)}&view=${view}`);
      } else {
        navigate(`/contacts/${encodeURIComponent(id)}`);
      }
    });

  chart.updateMainId(mainId);
  chart.updateTree({ initial: true });
  // container was just injected — sizes settle a tick later
  requestAnimationFrame(() => { if (el.isConnected) chart.updateTree({ initial: true }); });
  return chart;
}

// ------------------------------------------------------------ root picker
function bindRootSearch(el) {
  const input = el.querySelector('#ft-search');
  const results = el.querySelector('#ft-search-results');
  if (!input) return;
  input.addEventListener('input', debounce(async () => {
    const q = input.value.trim();
    if (!q) { results.innerHTML = ''; return; }
    let found;
    try { found = await api.get('/api/contacts' + qs({ search: q, limit: 6 })); } catch { return; }
    results.innerHTML = (found.contacts || [])
      .map((c) => `<button class="popover-item w-full" data-ft-pick="${Number(c.id)}">
        <span class="av sm avc-${avatarColorIndex(c.display_name)}" style="width:22px;height:22px;font-size:9px">${esc(initials(c.display_name))}</span>${esc(c.display_name)}</button>`)
      .join('') || '<div class="text-sm text-muted p-2">No matches.</div>';
    results.querySelectorAll('[data-ft-pick]').forEach((b) =>
      b.addEventListener('click', () => navigate(`/family?id=${encodeURIComponent(b.dataset.ftPick)}`)));
  }, 250));
}

/** Cookie-auth download via temp anchor (same pattern as contacts.js). */
function triggerDownload(url) {
  const a = document.createElement('a');
  a.href = url;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// --------------------------------------------------------------- the page
// Two distinct uses of the same graph, picked via ?view=:
//   family   — "who is around this person": parents, siblings, partner(s),
//              children. The lens for looking at a friend's family.
//   ancestry — the deep multi-generation genealogy tree.
const VIEWS = [
  { value: 'family', label: 'Close family' },
  { value: 'ancestry', label: 'Full ancestry' },
];

async function renderFamilyPage(el, params) {
  const rootId = Number(params.id) || Number(state.user?.self_contact_id) || null;
  const view = params.view === 'ancestry' ? 'ancestry' : 'family';

  el.innerHTML = `
  <div class="page-inner">
    <div class="rec-toolbar">
      <span class="rec-crumb"><span>Family</span><span id="ft-crumb-name"></span></span>
      <span class="rec-actions">
        <span class="search-input-wrap" style="width:220px;position:relative">
          ${icon('search')}
          <input class="form-input" id="ft-search" placeholder="View someone's family…" autocomplete="off" aria-label="Pick a person">
          <div id="ft-search-results" class="ft-search-results"></div>
        </span>
        <button class="rec-act" data-action="ged-import">Import GEDCOM</button>
        <button class="rec-act" data-action="ged-export">Export .ged</button>
      </span>
    </div>
    <div class="rec-rule-strong"></div>
    <div class="toolbar mt-2" id="ft-view-pills">${filterPills(VIEWS, view, 'view')}</div>
    <div id="ft-host" class="mt-2"><div class="text-sm text-muted">Loading family…</div></div>
    <div class="text-xs text-muted mt-2" id="ft-hint"></div>
  </div>`;

  bindRootSearch(el);
  el.querySelector('[data-action="ged-import"]')?.addEventListener('click', () => openImportModal('gedcom'));
  el.querySelector('[data-action="ged-export"]')?.addEventListener('click', () => triggerDownload('/api/export/gedcom?all=1'));
  el.querySelectorAll('#ft-view-pills .filter-pill').forEach((p) =>
    p.addEventListener('click', () => {
      if (p.dataset.view === view) return;
      navigate(`/family?${rootId ? `id=${encodeURIComponent(rootId)}&` : ''}view=${encodeURIComponent(p.dataset.view)}`);
    }));

  const hint = el.querySelector('#ft-hint');
  hint.textContent = view === 'family'
    ? 'Parents, siblings, partners and children of this person. Click a card to open their record · Ctrl/⌘-click to move the view to them. Family links are managed in each person\u2019s Relationships section.'
    : 'Every generation linked in the records — ancestors above, descendants below. Click a card to open their record · Ctrl/⌘-click to recenter. Grow the tree via Relationships or a GEDCOM import.';

  const host = el.querySelector('#ft-host');

  if (!rootId) {
    host.innerHTML = emptyState('users', 'Pick a person', 'Search above for anyone in your records, or link your own profile (account menu → My profile) to start from yourself.');
    return;
  }

  let data;
  try {
    const [, treeData] = await Promise.all([
      loadFamilyChart(),
      api.get(`/api/contacts/${rootId}/family-tree`),
    ]);
    data = treeData;
  } catch (err) {
    host.innerHTML = emptyState('alert-circle', "Couldn't load the family tree", err?.message || 'Try again shortly.');
    return;
  }
  if (!el.isConnected) return;

  const rootPerson = (data.people || []).find((p) => p.id === data.root);
  if (rootPerson) {
    el.querySelector('#ft-crumb-name').innerHTML = ` <span>/</span> <span>${esc(rootPerson.display_name)}</span>`;
  }

  if (!data.people?.length || (data.people.length === 1 && !data.edges?.length)) {
    const rootName = rootPerson?.display_name || 'this person';
    host.innerHTML = emptyState('users', 'No family linked yet',
      `Add family relationships (parent, child, sibling, spouse) on ${rootName}'s record and the tree grows from there. Or import a GEDCOM file from Ancestry, MyHeritage, Gramps…`);
    return;
  }

  try {
    renderChart(host, data, data.root, view);
  } catch (err) {
    console.error('[family-chart]', err);
    host.innerHTML = emptyState('alert-circle', "Couldn't render the tree", err?.message || '');
    return;
  }
  if (view === 'ancestry' && data.truncated) {
    host.insertAdjacentHTML('beforeend', '<div class="text-xs text-muted mt-2">Tree truncated — showing the closest 400 people.</div>');
  }
}

pageRenderers.family = renderFamilyPage;
