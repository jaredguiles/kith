# Kith — Brand Guidelines

> *"kith (n.) — Old English: one's friends, acquaintances, and relations."*

---

## 1. Brand Foundation

### Mission
Kith exists to help people be more intentional about the relationships that matter most. Not networking, not business contacts — the actual humans in your life.

### Positioning
Kith is **personal, private, and intimate**. It holds things you wouldn't trust to a cloud service or share with an employer. It feels like a journal that knows everyone you care about.

### Personality
| Trait | What it means in practice |
|-------|---------------------------|
| **Intimate** | Warm, personal, never clinical or cold |
| **Trustworthy** | Restrained, not flashy; earns confidence |
| **Discreet** | Privacy-first in language and design |
| **Modern & Refined** | Clean, dark, contemporary — not corporate |
| **A little edgy** | Comfortable with adult realities; not sanitized |

---

## 2. Logo & Wordmark

### Files
- **Source:** `logo.png` — white mark on transparent background
- An SVG version should be produced for all production use (scalable, color-swappable)

### Lockup
The logo mark and wordmark appear together as a unit. The mark leads, followed by a single em-space, followed by the wordmark.

### Wordmark
- Typeface: **Inter** (weight 600 — Semibold)
- Letter-spacing: `0.02em`
- Always title case: `Kith`, never `KITH` or `kith` alone
- The logo mark inherits the accent color (`--accent`) in the app; the wordmark text is `--text-primary`
- On external/print materials where the app color system is unavailable, the mark is rendered in `#7c5bf5` (purple) or white depending on background

### Clear Space
The logo requires clear space equal to the cap height of the wordmark on all four sides.

### Sizing
| Context | Minimum size |
|---------|-------------|
| Sidebar header | 20px cap height |
| Favicon / icon | 16×16px (mark only, no wordmark) |
| Print | 0.75 inch wide (full lockup) |

### Forbidden Treatments
- Do not stretch, skew, or rotate the logo
- Do not recolor the mark to anything other than white, `--text-primary`, or `--accent`
- Do not place the white-on-transparent version on a light background without switching to a dark or purple version
- Do not add drop shadows or effects to the wordmark
- Do not recreate the mark in a different style or weight

---

## 3. Color System

All colors are defined as CSS custom properties and respond to the active mode (Normal or Spicy). The system is built on a **pure black base** with frosted surfaces layered on top.

### 3.1 Normal Mode (Default)

#### Backgrounds — Layer Hierarchy
Each layer step is noticeably lighter to create depth through stacking.

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-base` | `#000000` | Page/app background |
| `--bg-surface` | `rgba(12,12,16,0.75)` | Sidebar, panels |
| `--bg-card` | `rgba(22,22,28,0.60)` | Cards, containers |
| `--bg-elevated` | `rgba(32,32,40,0.60)` | Modals, dropdowns |
| `--bg-hover` | `rgba(42,42,52,0.50)` | Hover states |
| `--bg-input` | `rgba(10,10,14,0.65)` | Form inputs |

#### Accent — Purple
The primary accent is a rich, saturated violet-purple.

| Token | Value | Usage |
|-------|-------|-------|
| `--accent` | `#7c5bf5` | Primary actions, focus rings, links, highlights |
| `--accent-hover` | `#6a4ae0` | Hover state on accent elements |
| `--accent-subtle` | `rgba(124,91,245,0.07)` | Tinted backgrounds, selected rows |
| `--accent-border` | `rgba(124,91,245,0.18)` | Borders on accent-tinted elements |
| `--accent-glow` | `rgba(124,91,245,0.10)` | Soft glow on focus/active states |

> **HEX: `#7c5bf5`** — HSL: 256°, 88%, 65%. A cool, electric purple with strong violet pull. Confident without being aggressive.

#### Text

| Token | Value | Usage |
|-------|-------|-------|
| `--text-primary` | `#ededf0` | Body copy, headings, labels |
| `--text-secondary` | `#a0a0ad` | Secondary labels, metadata, subheadings |
| `--text-muted` | `#6b6b78` | Placeholders, disabled states, timestamps |

#### Status & Semantic Colors

| Name | Token | Hex | Usage |
|------|-------|-----|-------|
| Green | `--green` | `#34d399` | Success, online status, confirmed |
| Green subtle | `--green-subtle` | `rgba(52,211,153,0.08)` | Success backgrounds |
| Amber | `--amber` | `#fbbf24` | Warnings, pending states, ratings |
| Amber subtle | `--amber-subtle` | `rgba(251,191,36,0.08)` | Warning backgrounds |
| Red | `--red` | `#f87171` | Errors, destructive actions, danger |
| Red subtle | `--red-subtle` | `rgba(248,113,113,0.08)` | Error backgrounds |
| Blue | `--blue` | `#60a5fa` | Info, links in context, highlights |
| Blue subtle | `--blue-subtle` | `rgba(96,165,250,0.08)` | Info backgrounds |
| Pink | `--pink` | `#f472b6` | Special tags, relationship indicators |

#### Borders & Glass

| Token | Value | Usage |
|-------|-------|-------|
| `--border` | `rgba(255,255,255,0.05)` | Default card/container borders |
| `--border-light` | `rgba(255,255,255,0.08)` | Slightly more visible dividers |
| `--glass-shine` | `rgba(255,255,255,0.025)` | Top-edge highlight on glass surfaces |
| `--glass-shine-strong` | `rgba(255,255,255,0.05)` | Emphasized glass shine |

---

### 3.2 Spicy Mode

Spicy Mode uses a **layered signal system** rather than a wholesale palette swap. The dark surfaces — the backgrounds, the frosted cards, the structural chrome — stay exactly the same. Only the **interactive layer** shifts. This reads as *"the same app, a different context"* rather than *"a different app entirely."*

Swapping every background token at once is the approach of a mode that wants to announce itself loudly. Kith's approach is the opposite: the shift should feel like stepping into a dimmer, more private room — not a fire alarm.

#### What changes in spicy mode

| Token | Normal | Spicy |
|-------|--------|-------|
| `--accent` | `#7c5bf5` | `#c2394f` |
| `--accent-hover` | `#6a4ae0` | `#a8303f` |
| `--accent-subtle` | `rgba(124,91,245,0.07)` | `rgba(194,57,79,0.07)` |
| `--accent-border` | `rgba(124,91,245,0.18)` | `rgba(194,57,79,0.18)` |
| `--accent-glow` | `rgba(124,91,245,0.10)` | `rgba(194,57,79,0.10)` |

#### What does NOT change
All background tokens (`--bg-base`, `--bg-surface`, `--bg-card`, `--bg-elevated`, `--bg-hover`, `--bg-input`), all text tokens, all border tokens, all status colors, and all shadow values remain identical to normal mode.

#### Spicy Accent — Desaturated Rose-Red
| Token | Value |
|-------|-------|
| `--spicy-accent` | `#c2394f` |
| `--spicy-accent-subtle` | `rgba(194,57,79,0.07)` |
| `--spicy-accent-border` | `rgba(194,57,79,0.18)` |
| `--spicy-accent-glow` | `rgba(194,57,79,0.10)` |

> **HEX: `#c2394f`** — HSL: 350°, 56%, 47%. A muted, deep rose-red. Darker and less saturated than a warning red — intimate rather than alarming. This is not the same red as `--red` (`#f87171`), which is reserved for errors and destructive actions.

The accent shift alone is not the full signal system. See Section 12 for the complete layered approach.

---

### 3.3 Color Usage Principles

1. **Purple is for action.** Every interactive affordance — buttons, links, focus rings, active nav states — uses the accent. Nothing else should compete with it.
2. **Backgrounds recede.** The layered dark surfaces create depth without distraction. Never use patterned or textured backgrounds.
3. **Status colors are semantic, not decorative.** Green means success. Red means danger. Do not use them for aesthetic variety.
4. **Text hierarchy through opacity, not weight.** Primary, secondary, and muted text are distinguished by opacity, not font size or weight alone.
5. **The spicy shift targets the interactive layer only.** When spicy mode activates, accents shift from purple to rose-red. Surfaces, text, and structural chrome remain identical. The environment shifts; the structure does not.

---

## 4. Typography

### Typeface
**Inter** — used exclusively throughout the application.

Inter is a variable font (`Inter var`) optimized for screens at small sizes. The variable format is required — it enables precise weight stepping across the full type scale without loading multiple font files, and supports optical size adjustments at display sizes.

```
font-family: 'Inter var', system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif;
```

Load via `@font-face` with `font-display: swap` for performance. The system-ui stack serves as fallback only.

> Inter has been the dominant UI typeface since the late 2010s and remains the right choice in 2026 — it is now so standard that it reads as neutral rather than trendy, which is exactly what an intimate personal app needs. Switching to something more fashionable would date the app faster.

### Type Scale

| Role | Size | Weight | Color token |
|------|------|--------|-------------|
| Page title | 22px | 700 | `--text-primary` |
| Section heading | 16px | 600 | `--text-primary` |
| Subheading / label | 13px | 500 | `--text-secondary` |
| Body copy | 14px | 400 | `--text-primary` |
| Small / metadata | 12px | 400 | `--text-secondary` |
| Micro / timestamp | 11px | 400 | `--text-muted` |

### Rules
- **Letter spacing:** `-0.01em` on headings; `0` on body; `0.04em` on uppercase labels
- **Line height:** `1.5` for body; `1.2` for display headings
- **All caps:** Used only for section labels (e.g., `GROUPS`, `TAGS`) — always `font-size: 11px`, `letter-spacing: 0.08em`, `--text-muted`
- **Numbers:** Tabular figures preferred in tables and stats
- **No italics** in the UI (reserved for empty-state flavor text only)

---

## 5. Spacing & Layout

### Spacing Scale
Uses a base-4 scale.

| Token | Value | Usage |
|-------|-------|-------|
| 4px | `xs` | Icon gaps, tight inline spacing |
| 8px | `sm` | Form control inner padding, list item gaps |
| 12px | `md` | Card inner padding (compact) |
| 16px | `lg` | Standard card padding, section gaps |
| 24px | `xl` | Page section separators |
| 32px | `2xl` | Major layout gaps |

### Layout
- **Sidebar:** Fixed, 260px wide
- **Main content:** Fluid, fills remaining width
- **Page header:** Fixed height, contains title + primary actions
- **Content area:** Scrollable, padded `24px`
- **Max content width:** `1200px` (centered on very wide screens)

### Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | `6px` | Badges, tags, small buttons |
| `--radius-md` | `10px` | Cards, inputs, buttons |
| `--radius-lg` | `14px` | Modals, panels, dropdowns |
| `--radius-xl` | `20px` | Large feature cards, avatars |

---

## 6. Frosted Surfaces & Elevation

Kith surfaces use **frosted glass** — `backdrop-filter: blur()` applied to semi-transparent dark fills. This is distinct from the heavy glassmorphism trend of the early 2020s: there are no colorful gradients visible through surfaces, no rainbow bleed, no show-off transparency. The frost is neutral, muted, and functional. It creates depth without performing it.

### Frosted Surface Recipe

```css
background: var(--bg-card);         /* semi-transparent dark fill */
border: 1px solid var(--border);    /* subtle white-tinted edge */
backdrop-filter: blur(20px);        /* neutral frost */
box-shadow: var(--shadow-md);       /* depth */
```

A top-edge shine can be added for cards with visual prominence:
```css
box-shadow: inset 0 1px 0 var(--glass-shine), var(--shadow-md);
```

Surfaces should never feel "see-through" or decorative. The frost exists to create layer separation — not to show what's behind it.

### Blur Values
| Token | Value | Usage |
|-------|-------|-------|
| `--glass-blur` | `20px` | Standard cards, panels |
| `--glass-blur-heavy` | `30px` | Modals, sidebars |

### Shadow Scale
| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 2px 8px rgba(0,0,0,0.5)` | Small components, tags |
| `--shadow-md` | `0 4px 20px rgba(0,0,0,0.6)` | Cards, dropdowns |
| `--shadow-lg` | `0 8px 40px rgba(0,0,0,0.7)` | Modals, overlays |

---

## 7. Iconography

- **Library:** Lucide Icons (stroke, 2px weight)
- **Default size:** 16px inline, 18px in nav items, 20px in page titles
- **Color:** Icons always inherit from their context — `--text-secondary` at rest, `--accent` when active, `--text-muted` when disabled
- **Never use emoji as icons.** All UI icons must be SVG (Lucide). Emoji are not icons — they are rendered differently across platforms, cannot be styled, and break visual consistency. There is no exception to this rule.
- **Stroke-only by default.** Filled icons are permitted only where the filled state communicates a meaningful status change (e.g. starred = favorited, flame = spicy mode active). Never fill an icon for decoration.
- **Navigation flame icon:** Used exclusively for the Spicy Mode toggle. Renders stroke (unlit) in normal mode, filled (lit) in spicy mode. Do not repurpose it for anything else.

> **2px stroke weight** is preferred over 1.5px. At small sizes on dense dark screens, 2px reads more clearly and holds up better at non-1x pixel densities.

---

## 8. Component Patterns

### Buttons
| Variant | Use case | Style |
|---------|----------|-------|
| `.btn-primary` | Primary action (Save, Create) | Accent background, white text |
| `.btn-secondary` | Secondary actions | `bg-elevated` fill, border |
| `.btn-danger` | Destructive (Delete, Deactivate) | Red tint fill with red border |
| `.btn-ghost` | Tertiary, in-list actions | No fill, no border; hover shows fill |
| `.btn-icon` | Icon-only controls | Square, 32px or 36px |

All buttons: `border-radius: var(--radius-md)`, `font-weight: 500`, `font-size: 14px`.

### Avatars
Circular images with `--radius-xl` (fully round). Three sizes: `sm` (28px), `md` (40px), `lg` (64px).

**Pride flag indicators** appear as a small circle overlay at bottom-right of the avatar — rendered in CSS gradients matching each flag:

| Orientation | Gradient |
|-------------|---------|
| Gay / Queer | Rainbow |
| Lesbian | Orange → white → pink |
| Bisexual | Pink → purple → blue |
| Pansexual | Pink → yellow → blue |
| Trans | Blue → pink → white |
| Non-binary | Yellow → white → purple → black |
| Asexual | Black → gray → white → purple |
| Straight | No indicator |

### Tags & Badges
- `.tag-pill` — rounded pill, 11px text, colored dot or full background tint
- Tags always display a color dot matching the tag's configured color
- System tags (Friend, Family, VIP, etc.) have predefined colors; user-created tags are freely colored

### Modals
Structure: `.modal-overlay > .modal > .modal-header + .modal-content + .modal-footer`

- Overlay: `rgba(0,0,0,0.7)` with `backdrop-filter: blur(4px)`
- Modal card: `--bg-elevated` glass recipe, `--radius-lg`, `--shadow-lg`
- Header: title (16px, 600) + close button (`btn-icon`)
- Footer: right-aligned action buttons, always `[Cancel] [Primary Action]` order

### Command Palette
Kith implements a **command palette** triggered by `⌘K` (Mac) / `Ctrl+K` (Windows/Linux). This is a standard pattern in 2026 — power users expect it. It provides:
- Quick contact search and navigation
- Fast action execution ("New contact", "Toggle spicy mode", "Go to settings")
- A keyboard-first path to everything in the app

The command palette uses `--bg-elevated` with `--glass-blur-heavy`, centered in the viewport, with a prominent search input and filtered results list.

### Empty States
`.empty-state` — centered column layout with a large muted icon, a heading, a short description, and an optional action button. Used when a list or section has no content.

---

## 9. Motion & Transitions

Kith uses motion purposefully — to confirm actions, show state changes, and provide orientation. Animation is never decorative or looping.

### Principles
- **State-driven, not entrance-driven.** Elements do not animate in on page load. Transitions happen in response to user actions (hover, toggle, navigate).
- **Fast and physical.** UI transitions use `150–250ms` durations. Anything slower feels sluggish in a productivity context.
- **Easing:** `cubic-bezier(0.16, 1, 0.3, 1)` — a fast ease-out that feels snappy and physical without bouncing.

### Transition Standards

| Event | Duration | Easing |
|-------|----------|--------|
| Hover state (background, border) | `150ms` | `ease-out` |
| Button press | `100ms` | `ease-in-out` |
| Modal open/close | `200ms` | `cubic-bezier(0.16,1,0.3,1)` |
| Page/view transition | `200ms` | `ease-out` |
| Spicy mode palette shift | `600ms` | `ease-in-out` |
| Toast notification | `250ms` in / `200ms` out | `ease-out` |

### View Transitions
Kith uses the **View Transitions API** for navigation between pages (Contacts → Contact Detail, etc.). This provides a smooth cross-fade that preserves context — not a hard page swap, not an elaborate slide. The transition is `200ms`, imperceptible enough to feel instant but smooth enough to avoid visual jarring.

### What Not to Animate
- Do not animate list items on scroll
- Do not use looping background animations (floating orbs, pulses, particles)
- Do not animate layout shifts (content should not reflow with animation)
- Do not use spring/bounce on anything in a data-dense interface

---

## 10. Accessibility

Kith follows **WCAG 2.2 AA** as a minimum. Expectations for app accessibility are materially higher in 2026 than they were in earlier years.

### Contrast Minimums
| Text type | Minimum ratio |
|-----------|--------------|
| Body copy (14px+) | 4.5:1 |
| Large text / headings (18px+ or 14px bold) | 3:1 |
| UI components & focus indicators | 3:1 |
| Muted text (`--text-muted`) | Must meet 3:1 at minimum for any actionable element |

> Note: `--text-muted` (`#6b6b78`) against `#000000` does not meet 4.5:1. It is acceptable only for non-actionable content (timestamps, decorative labels). Never use it for anything the user needs to act on.

### Focus Indicators
Every interactive element must have a visible focus ring. Kith's focus style:
```css
outline: 2px solid var(--accent);
outline-offset: 2px;
border-radius: var(--radius-sm);
```
Never suppress `outline: none` without providing an equivalent custom focus indicator.

### Reduced Motion
Respect `prefers-reduced-motion`. When set, all transitions drop to `0ms` except the spicy mode palette shift (which uses a `300ms` cross-fade instead of `0ms` to avoid a disorienting hard-cut).

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: 0ms !important; }
  .spicy-transition { transition-duration: 300ms !important; }
}
```

---

## 11. Voice & Tone

### Who Kith speaks to
A trusted friend who takes privacy seriously and doesn't judge. Never corporate, never clinical, never condescending.

### Core voice attributes
**Warm, direct, a little dry.** Kith doesn't over-explain or over-celebrate. It acknowledges what you're doing without making it awkward.

### Tone by context

| Context | Tone | Example |
|---------|------|---------|
| Empty states | Inviting, low-pressure | "No contacts yet. Add someone you care about." |
| Success | Brief, confident | "Contact saved." — not "Contact saved successfully!" |
| Errors | Clear, never blaming | "Couldn't save — check your connection and try again." |
| Destructive confirmation | Direct, gives pause | "Delete this contact? This can't be undone." |
| Spicy content | Neutral, non-judgmental | No special language — treat it like any other data |
| Onboarding | Minimal, respectful | Explain once; don't repeat warnings |

### Writing rules
- **No exclamation marks** in UI copy (except genuine celebration, used once per session maximum)
- **No passive voice** — "Contact deleted" not "Contact has been deleted"
- **No ellipsis in UI labels** — use clear, complete labels
- **Present tense** — "Add contact" not "Adding contact"
- **Sentence case** for all UI copy — not Title Case, not ALL CAPS (except 11px section labels)
- **Never call spicy content "explicit"** — use "spicy" or treat it neutrally without labeling at all

---

## 12. Spicy Mode Design System

Spicy mode communicates through **three layers of signal** stacked on top of each other. No single layer is enough on its own — together they make the mode unmistakable without being jarring.

---

### Layer 1 — Accent Shift (Interactive)

The accent color transitions from purple (`#7c5bf5`) to rose-red (`#c2394f`) over `600ms`. Every interactive element that uses `--accent` shifts simultaneously: buttons, focus rings, active nav states, links, selected rows, the sidebar indicator strip. The surfaces beneath them do not move.

This is the primary signal. It covers every affordance in the app.

---

### Layer 2 — Ambient Environment Signals

These are the secondary signals — subtle, always-visible, non-intrusive. They reinforce the mode without competing with content.

#### Sidebar left-edge accent strip
A `2px` vertical strip running the full height of the sidebar's left edge, colored `--accent`. In normal mode it is purple. In spicy mode it shifts to rose-red with the rest of the accent layer. It is small enough to be background noise but persistent enough that a glance at the sidebar always confirms the current mode.

```css
.sidebar::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 2px;
  background: var(--accent);
  transition: background 600ms ease-in-out;
}
```

#### Viewport edge vignette
A near-invisible `inset box-shadow` on the `body` or app wrapper that creates a subtle warm darkening at the screen perimeter — like the edges of a dimly lit room. At `0` opacity in normal mode; transitions in at `600ms` when spicy activates.

```css
/* Normal mode — invisible */
--vignette: inset 0 0 120px rgba(0,0,0,0);

/* Spicy mode */
--vignette: inset 0 0 120px rgba(194,57,79,0.06);
```

Applied as: `box-shadow: var(--vignette)` on the outermost app container. The red tint is barely perceptible — it should not be obviously visible, only *felt*.

#### Grain texture overlay
A fixed `::after` pseudo-element on `body` using an SVG noise filter at `~3% opacity`. Adds a very slight analog texture to the background in spicy mode — the visual equivalent of a dimmer setting. At `0` opacity normally; fades in at `600ms`.

```css
body.spicy-mode::after {
  content: '';
  position: fixed; inset: 0; z-index: 0;
  pointer-events: none;
  opacity: 0.03;
  background-image: url("data:image/svg+xml,..."); /* SVG feTurbulence noise */
}
```

The grain is intentionally imperceptible to most users. Its job is to make the mode feel qualitatively different to read — not to be a visible design element.

#### Flame icon — lit state
When spicy mode is active, the flame icon switches from a **stroke** (unlit) to a **filled** (lit) state — the visual difference between an unlit and a lit candle. Combined with the accent color and a `drop-shadow` glow, it reads as "on" without being loud.

```css
.btn-flame.active {
  color: var(--accent);
  filter: drop-shadow(0 0 6px var(--accent-glow));
}
/* Fill the SVG shape — turns the outline flame into a solid flame */
.btn-flame.active svg {
  fill: currentColor;
  stroke: none;
}
```

The flame icon is an SVG — never an emoji. Emoji cannot be styled and render inconsistently across platforms.

---

### Contact-Level Spicy Signals

Individual contacts that have spicy data get a subtle treatment in spicy mode — a left-border accent on their list row or card. This is not a badge, not a label, not an icon — just a `2px` rose-red left border that says *"there's more here"* without announcing it.

```css
/* In spicy mode, contacts with is_spicy = true */
.contact-row.has-spicy-data {
  border-left: 2px solid var(--accent-border);
}
```

In normal mode, these contacts look identical to all others. The signal only appears when the context makes it relevant.

---

### Reduced Chrome Intensity

When spicy mode is active, non-essential sidebar elements (section labels like `GROUPS`, `TAGS`, nav items not currently in use) drop to slightly higher opacity than their normal muted state — the sidebar *quiets down*. This creates the sensation of the interface stepping back to give the content more space.

```css
.spicy-mode .sidebar-section-label,
.spicy-mode .nav-item:not(.active) {
  opacity: 0.5;  /* from 0.7 in normal mode */
}
```

---

### Spicy Mode Brand Contract

1. **The flame is the only toggle icon.** Not a lock, not an eye, not a warning. A Lucide flame SVG — stroke (unlit) at rest, filled and glowing when active. Never an emoji.
2. **No warnings or disclaimers inside spicy mode.** The user opted in — Kith trusts them.
3. **The accent shifts; the structure does not.** Surfaces, text, and layout are identical in both modes. There is no visual "dirtiness" to spicy mode — it is clean, private, and refined.
4. **All three layers activate together** over `600ms ease-in-out`. There is no partial or intermediate state.
5. **Spicy mode can be globally disabled in Settings.** When disabled: the flame icon is hidden, the toggle does not exist, the vignette and grain never appear, and no spicy content is accessible anywhere in the app. The app behaves as if the feature does not exist.

---

## 13. Don'ts

| ❌ Don't | ✅ Do instead |
|----------|--------------|
| Use light backgrounds | Stay within the dark surface system |
| Use accent purple for non-interactive decorative elements | Reserve purple for affordances only |
| Show the spicy mode color scheme as a "theme option" | Spicy is a content mode, not a visual preference |
| Swap background/surface tokens in spicy mode | Only accent tokens shift — surfaces stay neutral |
| Use `#e84057` or a bright red for the spicy accent | Use the desaturated rose `#c2394f` — intimate, not alarming |
| Make the grain or vignette obviously visible | They should be felt, not seen — keep both under 5% opacity |
| Use emoji as UI icons | Use SVG icons (Lucide) — emoji are unstyleable and render inconsistently |
| Mix Lucide with other icon libraries | Use Lucide exclusively |
| Use more than one typeface | Inter only |
| Show success/error/warning colors decoratively | Use semantic colors semantically |
| Use gradients on text or buttons | Flat fills or transparent fills only |
| Add blur effects to text | Blur is for surfaces only |
| Animate content on entry | Transitions are for state changes (hover, toggle), not page load |
| Use looping background animations (orbs, particles, pulses) | Static background; motion is user-triggered only |
| Use heavy glassmorphism (colorful bleed-through, extreme transparency) | Use neutral frosted surfaces only |

---

## 14. Quick Reference

```
Brand name:      Kith
Logo file:       logo.png (SVG preferred for production)
Typeface:        Inter var

── Normal Mode ──────────────────────────
Base:            #000000
Accent:          #7c5bf5
Accent hover:    #6a4ae0
Text primary:    #ededf0
Text secondary:  #a0a0ad
Text muted:      #6b6b78

── Spicy Mode (accent layer only) ───────
Spicy accent:    #c2394f
Spicy hover:     #a8303f
Surfaces:        unchanged from normal mode
Text:            unchanged from normal mode

── Semantic ─────────────────────────────
Success:         #34d399
Warning:         #fbbf24
Error:           #f87171
Info:            #60a5fa

── Structure ────────────────────────────
Border:          rgba(255,255,255,0.05)
Blur:            20px (standard), 30px (heavy)
Radius:          6 / 10 / 14 / 20px
Spicy signals:   accent shift + edge vignette (6%) + sidebar strip + grain (3%) + flame glow
```

---

*Kith Brand Guidelines — v1.2 — March 2026*
