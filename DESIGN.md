# Kith — Design System: "The Record"

> **Authoritative visual-design document.** Adopted in v1.3 (commit 0f3874a,
> 2026-07-07), replacing the original dark frosted-glass/Inter/purple system
> that lived in `BRANDING.md` (now a stub kept for logo/name provenance).
> The implementation of everything below lives in
> `server/public/css/style.css` (single stylesheet, token-driven).
> Promoted to the repo root from the v1.3 design handoff
> (`new_design_temp/README.md`, since removed); throwaway `.dc.html`
> reference mocks were deleted after the redesign shipped.

## Overview

"The Record" is the visual direction for **Kith**, a *personal* CRM for
tracking the real people in someone's life (interactions, notes, media,
personal detail). It is explicitly **not** a business/sales tool.

The aesthetic is a warm, editorial *dossier*: paper/ink surfaces, an
editorial serif (Newsreader) paired with monospace (IBM Plex Mono), hairline
rules and dotted leaders, indexed sections — Kith as a bound ledger of the
people in your life. This is a deliberate move away from dark-glass / neon /
gradient UI. There is **zero `backdrop-filter`**, no glass, no glow, and
corners are crisp (4px radius everywhere — print-like, not rounded).

The defining product feature is **Spicy Mode** (referred to in the UI as the
**confidential layer**): a hidden layer of intimate data (relationship type,
preferences, health info, private notes/media). It is **SFW by default** —
hidden entirely — and revealed only when the user activates it. Activation is
an unobtrusive lock toggle low in the sidebar; on activation the intimate
content **appears** (it is genuinely absent from the DOM/response until
then) and the accent color shifts from deep petrol teal → crimson.

Both light and dark themes are first-class; theme preference is per-user
with a system-preference option.

---

## Design Tokens

Implemented as CSS custom properties on `:root` (light), `[data-theme="dark"]`
(dark), and `body.spicy-mode` (confidential state). Theme + confidential state
only change a handful of tokens. Legacy token aliases (`--bg-*`, `--text-*`,
`--accent-subtle`, …) map onto these so pages composed against the pre-v1.3
names keep working.

### Typography
- **Display / serif:** `Newsreader` (self-hosted, `font-display: swap`),
  weights 400/500/600/700, incl. italic. Used for names, headings, values,
  and log entries.
- **Sans (body/UI):** `IBM Plex Sans`, weights 400/500/600.
- **Mono (labels/meta/data):** `IBM Plex Mono`, weights 400/500/600. Used for
  section labels, field keys, dates, counts, record numbers — always
  uppercase with letter-spacing for labels.
- Fonts load from `/fonts/record-fonts.css` (linked in `index.html`).

Type scale actually used (px):
- Page/name headings (serif): 42–45
- Section/masthead "Kith": 33 — as of v1.9 the masthead/login/mobile-header
  "Kith" is the wordmark image (`assets/wordmark.png`, white-on-transparent)
  rendered via CSS `mask` so it fills with `--ink` and follows theme +
  confidential transitions (`.wordmark-img`). Text wordmark remains the
  fallback for a custom `app_name`.
- Record values & list names (serif): 15–20
- Body sans: 14
- Mono labels: 9–11 (letter-spacing 0.1–0.26em, uppercase)

### Color — LIGHT theme
| Token | SFW value | When confidential active |
|---|---|---|
| `--paper` (page bg) | `#f2eee4` | `#efe5d8` |
| `--panel` (sidebar / inset bg) | `#faf7f0` | `#f6ede1` |
| `--ink` (text, rules-strong, buttons) | `#1c1813` | (unchanged) |
| `--muted` (secondary text) | `#6f685b` | (unchanged) |
| `--rule` (hairlines) | `rgba(28,24,19,0.16)` | (unchanged) |
| `--rule-strong` (frame border) | `rgba(28,24,19,0.32)` | (unchanged) |
| `--accent` | `#253e45` (petrol teal) | `#af1b3f` (crimson) |
| `--accent-weak` | `rgba(37,62,69,0.09)` | `rgba(175,27,63,0.10)` |
| `--gold` (decorative secondary) | `#d6b35c` | (unchanged) |
| `--gold-weak` | `rgba(214,179,92,0.18)` | (unchanged) |

### Color — DARK theme
| Token | SFW value | When confidential active |
|---|---|---|
| `--paper` | `#15130d` | `#191410` |
| `--panel` | `#1e1a12` | `#221b12` |
| `--ink` (text) | `#ece4d2` | (unchanged) |
| `--muted` | `#8b8271` | (unchanged) |
| `--rule` | `rgba(236,228,210,0.13)` | (unchanged) |
| `--rule-strong` | `rgba(236,228,210,0.26)` | (unchanged) |
| `--accent` | `#8ab6c0` (petrol teal, light) | `#e0637f` (crimson, light) |
| `--accent-weak` | `rgba(138,182,192,0.12)` | `rgba(224,99,127,0.14)` |
| `--gold` (decorative secondary) | `#d6b35c` | (unchanged) |

Semantic colors (success/warning/error/info) are editorial-muted variants
per theme (e.g. light `--green: #47694d`, dark `--green: #8fb996`) — never
neon. `--spicy` is a 0|1 custom property that drives the sidebar strip and
toggle-dot opacity.

### Spacing / shape
- Corner radius: `4px` everywhere (crisp, print-like — not rounded).
- Sidebar width: `252px` fixed; main content padding `38px 46px 40px`.
- Section vertical rhythm: `30–32px` between blocks; list rows `7–11px`
  vertical padding.
- Two-column content grid: `1fr 1fr` with a `1px` `--rule` divider
  (`border-right` on the left column, `padding: 0 40px` each side).
- Shadows are minimal/none (editorial-flat). Frame drop shadow only:
  light `0 30px 70px -42px rgba(40,30,15,0.55)`,
  dark `0 30px 70px -40px rgba(0,0,0,0.8)`.
- Motion: `--accent`, `--accent-weak`, `--paper`, and background transition
  over **0.6s ease** on the confidential toggle. Honor
  `prefers-reduced-motion` (disable transitions).

### Recurring patterns
- **Indexed section header:** mono index number in `--accent` + mono
  uppercase label in `--ink` (letter-spacing 0.2em) + a hairline `--rule`
  that fills remaining width. e.g. `01  UPCOMING BIRTHDAYS ————————`.
- **Dotted leader row:** left item + a `flex:1` span with
  `border-bottom: 1px dotted var(--rule)` + right value. Used for birthdays,
  particulars, social, confidential fields.
- **Serif name + mono meta:** list entries use serif for the human-readable
  name/title and mono for dates/counts/status.
- **Letter avatars:** deterministic palette color per person (name hash →
  8-slot editorial palette, light+dark variants, `.avc-0…7`); photos cover
  when present. Pride-flag rings/overlays from the pre-v1.3 direction are
  **not** used — identity is conveyed via the mono meta line instead
  (`.av .flag` is display:none).

---

## Screens / Views

### Sidebar (shared)
- **Layout:** 252px fixed column, `--panel` bg, `1px solid var(--rule)` right
  border, full height. A 3px `--accent` strip along the top edge fades in
  (opacity = confidential state).
- **Masthead:** "Kith" in Newsreader 33px; below it mono `PERSONAL RECORD`
  (9px, 0.26em tracking, `--muted`).
- **Search:** hairline-underlined row — magnifier icon + "Search records"
  (mono, muted) + `⌘K` hint.
- **New record button:** full-width, `--ink` background, `--paper` text,
  mono `NEW RECORD` + a `+`.
- **Nav (numbered index list), current order:** `01 Home · 02 People ·
  03 Family · 04 Calendar · 05 Map · 06 Events · 07 Timeline · 08 Journal ·
  09 Notices · 10 Settings (admin only)`. Each row: mono index (`--muted`,
  or `--accent` when active) + label (sans; `--accent` + weight 600 when
  active) + a right marker (small `--accent` square for the active item;
  Notices shows a mono badge count).
- **Favorites / Groups:** mono section labels + record lists (mono record
  number / dotted-leader counts + serif names).
- **Confidential toggle (INCONSPICUOUS — important):** low in the sidebar,
  above the user row. A **quiet, low-contrast** control: a small lock icon
  (12px, `--muted` stroke) at ~0.5 opacity (→0.9 on hover), plus a tiny dot
  that fills with `--accent` only when active. No border, no big switch, no
  bright color. The app must read SFW at a glance. (Implemented as
  `#flame-toggle` / `.btn-flame` — the class name is a vestige of the
  pre-v1.3 flame icon; the rendered control is the lock.)
- **User row:** hairline top border; a bordered monogram + mono name /
  role label (`KEEPER` for admins, `MEMBER` for users) + a logout glyph.

### Home Dashboard
- **Header:** mono dateline row (day/date left, reminders-pending right,
  both `--muted`), then a serif 42px greeting.
- **Stats ledger:** a 4-column strip bounded by a top `1px solid var(--ink)`
  and bottom `1px solid var(--rule)`; each cell (`border-left: 1px
  var(--rule)`) shows a serif 33px value + mono 9.5px uppercase label.
- **Two-column body** (`1fr 1fr`, center hairline): indexed sections —
  upcoming birthdays (dotted-leader rows, "in N days" in `--accent`),
  reminders (hollow square checkbox + serif text + mono due tag), next-up
  schedule (mono day/time block + serif title), recent activity (mono
  timestamp + serif-italic name + muted action).
- **Confidential behavior:** private events are **absent** from lists when
  the layer is off; they mount only when active. Accent across the whole
  frame shifts to oxblood while active.

### Contact Profile (record page)
- **Toolbar:** mono breadcrumb `PEOPLE / NAME` + right-aligned mono actions
  (`EDIT` underlined, `MERGE`, `SHARE`). Strong `1px solid var(--ink)` rule
  beneath.
- **Dossier header:** left a `118×118` bordered portrait frame (`--panel`
  bg, serif initials, mono `PORTRAIT` caption; user photo covers); right a
  mono `RECORD № NNNN`, serif 45px name, mono meta line (pronouns · zodiac ·
  location · b. date, plus `✝ d. date` for deceased), then status /
  bracketed mono tags `[ CLOSE FRIENDS ] [ VIP ]`.
- **Two-column body**, indexed sections: `PARTICULARS` (dotted leaders),
  `CONTACT` (mono key/value), `CORRESPONDENCE` (social handles),
  `TIMELINE` (log rows: mono date + mono kind label in `--accent` + serif
  entry), `MEDIA · CONTACT SHEET` (3-col grid of bordered square "plate"
  tiles rendering authenticated thumbnails), and — only when the layer is
  active — the confidential block.
- **`CONFIDENTIAL — SPICY LAYER` (only present when active):** a bordered
  block (`1px solid var(--accent)`), header with a lock icon + mono label +
  right-aligned mono `AES-256 · ENCRYPTED`, a faint rotated serif
  `CLASSIFIED` watermark behind the content, dotted-leader fields, a
  bordered health strip, serif-italic private notes. **This entire block,
  private timeline entries, and private media plates are removed from the
  DOM (and never present in API responses) when the layer is off** — no
  redaction bars, no placeholders.

### Other pages
All remaining pages (contacts list, events, calendar, map, journal,
timeline, family tree, groups, trash, import/review, settings) compose the
same vocabulary: indexed section headers, hairline-ruled tables, mono
labels, serif values, bracketed tags, dotted leaders, flat bordered tiles.
Vendored libraries (Leaflet map, family-chart tree) are themed to the
Record tokens (paper canvas, ink text, palette washes, dark variants).

---

## Interactions & Behavior
- **Confidential toggle:** clicking the sidebar lock control flips the
  session's confidential state. On → paper warms slightly, accent tokens
  animate to oxblood over 0.6s, top-edge strip + tiny toggle dot fade in,
  and all confidential content mounts. Off → reverse; content unmounts.
  Optional PIN gate and auto-disable timer (Settings) apply.
- **Hover:** nav rows lift to `--accent`; the confidential toggle rises
  from 0.5 → ~0.9 opacity; action links keep an ink underline.
- **Active nav:** color `--accent`, weight 600, right marker square visible.
- **Reduced motion:** all transitions disabled under
  `prefers-reduced-motion: reduce`.
- **Reveal semantics matter for privacy:** confidential content must not
  merely be visually hidden. It must be **absent from the API response and
  DOM** unless the confidential layer is active. The server-side gate is
  authoritative: the API never returns confidential fields/rows unless the
  global `spicy_enabled` setting is true AND the session is in active
  confidential mode. Confidential fields are encrypted at rest
  (AES-256-GCM).

## State Management
- `theme`: `'light' | 'dark' | 'system'` — per-user preference.
- `confidentialActive` (a.k.a. spicy visible): boolean, per session/user.
- Global setting `spicy_enabled` (Settings): when false the feature does
  not exist — no toggle rendered, no confidential data fetched.

## Assets
- **Fonts:** Newsreader, IBM Plex Sans, IBM Plex Mono (self-hosted latin
  subsets, ~800 KB total).
- **Icons:** inlined Lucide SVGs (2px stroke) via `js/icons.js` — search,
  lock, calendar, map pin, bell, gear, logout, etc. No emoji.
- **Imagery:** portraits + media tiles are user-uploaded (or Immich-proxied)
  photos served through authenticated routes only.
