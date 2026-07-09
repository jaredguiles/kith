// Family page — renders the connected family around a root person as a
// generational tree (ancestors above, descendants below, partners beside).
// Data: GET /api/contacts/:id/family-tree → { root, people, edges }.
// Layout is computed client-side (generation rows + barycenter ordering);
// connectors are drawn into an SVG overlay after the DOM settles.

import { api, qs } from './api.js';
import { esc, initials, avatarColorIndex, parseDate, debounce } from './utils.js';
import { icon } from './icons.js';
import { emptyState } from './components.js';
import { pageRenderers, pageTitles } from './pages.js';
import { state, navigate } from './app.js';

pageTitles.family = 'Family';

const NODE_W = 168;

// ------------------------------------------------------------- layout
/** Assign a generation (depth) to every reachable person. Root = 0; parents
 * are depth-1, children depth+1, partners/siblings equal depth. */
function assignDepths(rootId, people, edges) {
  const depth = new Map([[rootId, 0]]);
  const adj = new Map(); // id → [{ other, delta }]
  const add = (a, b, delta) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a).push({ other: b, delta });
  };
  for (const e of edges) {
    if (e.type === 'parent') { add(e.from, e.to, +1); add(e.to, e.from, -1); }
    else { add(e.from, e.to, 0); add(e.to, e.from, 0); }
  }
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift();
    for (const { other, delta } of adj.get(id) || []) {
      if (!depth.has(other)) {
        depth.set(other, depth.get(id) + delta);
        queue.push(other);
      }
    }
  }
  // anyone unreachable through visible edges sits on the root's row
  for (const p of people) if (!depth.has(p.id)) depth.set(p.id, 0);
  return depth;
}

/** Order each generation row so people sit near their relatives (a few
 * barycenter sweeps over parent/child/partner neighbors). */
function orderRows(rows, edges) {
  const neighbors = new Map();
  const add = (a, b) => {
    if (!neighbors.has(a)) neighbors.set(a, []);
    neighbors.get(a).push(b);
  };
  for (const e of edges) { add(e.from, e.to); add(e.to, e.from); }
  const pos = new Map();
  const sync = () => rows.forEach((row) => row.forEach((id, i) => pos.set(id, i)));
  sync();
  for (let sweep = 0; sweep < 4; sweep++) {
    for (const row of rows) {
      row.sort((a, b) => {
        const bary = (id) => {
          const ns = (neighbors.get(id) || []).filter((n) => pos.has(n));
          return ns.length ? ns.reduce((s, n) => s + pos.get(n), 0) / ns.length : pos.get(id);
        };
        return bary(a) - bary(b) || pos.get(a) - pos.get(b);
      });
      sync();
    }
  }
  // partners always adjacent: pull each partner next to the first one
  const partnerOf = new Map();
  for (const e of edges) if (e.type === 'partner') { partnerOf.set(e.from, e.to); partnerOf.set(e.to, e.from); }
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      const mate = partnerOf.get(row[i]);
      if (mate === undefined) continue;
      const j = row.indexOf(mate);
      if (j > i + 1) { row.splice(j, 1); row.splice(i + 1, 0, mate); }
    }
  }
  sync();
}

// ------------------------------------------------------------ rendering
function lifeDates(p) {
  const b = p.birthday ? parseDate(p.birthday)?.getFullYear() : null;
  const d = p.is_deceased ? (p.date_of_death ? parseDate(p.date_of_death)?.getFullYear() : '') : null;
  if (b == null && d == null) return '';
  if (d !== null) return `${b ?? '·'} – ${d || '✝'}`;
  return `b. ${b}`;
}

function nodeHtml(p, isRoot) {
  const img = p.photo_url ? `<img src="${esc(p.photo_url)}" alt="">` : '';
  const dates = lifeDates(p);
  return `
  <div class="ft-node ${isRoot ? 'ft-root' : ''} ${p.is_deceased ? 'ft-deceased' : ''}" data-ft-id="${Number(p.id)}" style="width:${NODE_W}px">
    <span class="av sm avc-${avatarColorIndex(p.display_name)}">${esc(initials(p.display_name))}${img}</span>
    <span class="ft-node-meta">
      <span class="ft-node-name">${esc(p.display_name)}${p.is_deceased ? ' <span class="ft-cross" title="Deceased">✝</span>' : ''}</span>
      ${dates ? `<span class="ft-node-dates">${esc(dates)}</span>` : ''}
    </span>
  </div>`;
}

/** Draw parent/partner connectors into the SVG overlay from DOM positions. */
function drawLines(wrap, edges) {
  const svg = wrap.querySelector('.ft-lines');
  if (!svg) return;
  const wrapRect = wrap.getBoundingClientRect();
  const rectOf = (id) => {
    const el = wrap.querySelector(`[data-ft-id="${id}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      cx: r.left - wrapRect.left + wrap.scrollLeft + r.width / 2,
      cy: r.top - wrapRect.top + wrap.scrollTop + r.height / 2,
      top: r.top - wrapRect.top + wrap.scrollTop,
      bottom: r.bottom - wrapRect.top + wrap.scrollTop,
      left: r.left - wrapRect.left + wrap.scrollLeft,
      right: r.right - wrapRect.left + wrap.scrollLeft,
    };
  };
  svg.setAttribute('width', wrap.scrollWidth);
  svg.setAttribute('height', wrap.scrollHeight);
  // inline style so the global aria-hidden icon size floor can't clamp it
  svg.style.width = `${wrap.scrollWidth}px`;
  svg.style.height = `${wrap.scrollHeight}px`;
  let html = '';
  for (const e of edges) {
    const a = rectOf(e.from), b = rectOf(e.to);
    if (!a || !b) continue;
    if (e.type === 'parent') {
      const midY = (a.bottom + b.top) / 2;
      html += `<path d="M ${a.cx} ${a.bottom} V ${midY} H ${b.cx} V ${b.top}" class="ft-line ${e.step ? 'ft-line-step' : ''}"/>`;
    } else if (e.type === 'partner') {
      const [l, r] = a.cx <= b.cx ? [a, b] : [b, a];
      html += `<path d="M ${l.right} ${l.cy} H ${r.left}" class="ft-line ft-line-partner"/>`;
    }
    // sibling edges are implied by shared parents; drawn only when neither
    // sibling has a parent in the tree (otherwise it doubles the ink)
  }
  const hasParent = new Set(edges.filter((e) => e.type === 'parent').map((e) => e.to));
  for (const e of edges) {
    if (e.type !== 'sibling' || hasParent.has(e.from) || hasParent.has(e.to)) continue;
    const a = rectOf(e.from), b = rectOf(e.to);
    if (!a || !b) continue;
    const y = Math.min(a.top, b.top) - 8;
    html += `<path d="M ${a.cx} ${a.top} V ${y} H ${b.cx} V ${b.top}" class="ft-line ft-line-step"/>`;
  }
  svg.innerHTML = html;
}

function renderTree(host, data) {
  const byId = new Map(data.people.map((p) => [p.id, p]));
  const depth = assignDepths(data.root, data.people, data.edges);
  const rowsByDepth = new Map();
  for (const [id, d] of depth) {
    if (!byId.has(id)) continue;
    if (!rowsByDepth.has(d)) rowsByDepth.set(d, []);
    rowsByDepth.get(d).push(id);
  }
  const depths = [...rowsByDepth.keys()].sort((x, y) => x - y);
  const rows = depths.map((d) => rowsByDepth.get(d));
  orderRows(rows, data.edges);

  const genLabel = (d) =>
    d === 0 ? 'This generation' :
    d === -1 ? 'Parents' : d === -2 ? 'Grandparents' : d < -2 ? `${'Great-'.repeat(-d - 2)}grandparents` :
    d === 1 ? 'Children' : d === 2 ? 'Grandchildren' : `${'Great-'.repeat(d - 2)}grandchildren`;

  host.innerHTML = `
  <div class="ft-wrap" id="ft-wrap">
    <svg class="ft-lines" aria-hidden="true"></svg>
    ${depths.map((d, i) => `
      <div class="ft-row" data-ft-depth="${d}">
        <span class="ft-row-label">${esc(genLabel(d))}</span>
        <div class="ft-row-nodes">${rows[i].map((id) => nodeHtml(byId.get(id), id === data.root)).join('')}</div>
      </div>`).join('')}
  </div>
  ${data.truncated ? '<div class="text-xs text-muted mt-2">Tree truncated — showing the closest 400 people.</div>' : ''}`;

  const wrap = host.querySelector('#ft-wrap');
  // node click: navigate to the person; alt/ctrl-click recenters the tree
  wrap.addEventListener('click', (e) => {
    const node = e.target.closest('[data-ft-id]');
    if (!node) return;
    const id = node.dataset.ftId;
    if (e.altKey || e.ctrlKey || e.metaKey) navigate(`/family?id=${encodeURIComponent(id)}`);
    else navigate(`/contacts/${encodeURIComponent(id)}`);
  });

  const redraw = () => drawLines(wrap, data.edges);
  requestAnimationFrame(redraw);
  [150, 400].forEach((t) => setTimeout(redraw, t));
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => drawLines(wrap, data.edges));
    ro.observe(wrap);
    setTimeout(() => ro.disconnect(), 8000);
  }
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

// --------------------------------------------------------------- the page
async function renderFamilyPage(el, params) {
  const rootId = Number(params.id) || Number(state.user?.self_contact_id) || null;

  el.innerHTML = `
  <div class="page-inner">
    <div class="rec-toolbar">
      <span class="rec-crumb"><span>Family</span></span>
      <span class="rec-actions">
        <span class="search-input-wrap" style="width:240px;position:relative">
          ${icon('search')}
          <input class="form-input" id="ft-search" placeholder="View someone's tree…" autocomplete="off" aria-label="Pick a person">
          <div id="ft-search-results" class="ft-search-results"></div>
        </span>
      </span>
    </div>
    <div class="rec-rule-strong"></div>
    <div id="ft-host" class="mt-4"><div class="text-sm text-muted">Loading family…</div></div>
    <div class="text-xs text-muted mt-3">Click a person to open their record · Ctrl/⌘-click to recenter the tree on them. Family links are managed in each person's Relationships section (parent, child, sibling, spouse/partner).</div>
  </div>`;

  bindRootSearch(el);
  const host = el.querySelector('#ft-host');

  if (!rootId) {
    host.innerHTML = emptyState('users', 'Pick a person', 'Search above for anyone in your records, or link your own profile (account menu → My profile) to start from yourself.');
    return;
  }

  let data;
  try {
    data = await api.get(`/api/contacts/${rootId}/family-tree`);
  } catch (err) {
    host.innerHTML = emptyState('alert-circle', "Couldn't load the family tree", err?.message || 'Try again shortly.');
    return;
  }
  if (!el.isConnected) return;

  if (!data.people?.length || data.people.length === 1 && !data.edges?.length) {
    const rootName = data.people?.[0]?.display_name || 'this person';
    host.innerHTML = emptyState('users', 'No family linked yet',
      `Add family relationships (parent, child, sibling, spouse) on ${rootName}'s record and the tree grows from there.`);
    return;
  }

  renderTree(host, data);
}

pageRenderers.family = renderFamilyPage;
