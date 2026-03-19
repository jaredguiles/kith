# Kith CRM — Stack & Library Research
*March 2026*

---

## Overview

This document covers the research done across four categories: open-source CRM starters, admin dashboard templates, UI component libraries, and frontend framework options. Each option is evaluated on how well it fits Kith's requirements — dark, frosted aesthetic, personal (not business) CRM feature set, self-hosted, and minimal development overhead.

---

## 1. Open-Source CRM Starters

These are projects you could fork and adapt rather than building from scratch.

---

### Atomic CRM ⭐ Top Pick
**GitHub:** [marmelab/atomic-crm](https://github.com/marmelab/atomic-crm)
**Stack:** React + TypeScript + shadcn/ui + Vite + Supabase

The strongest candidate for a starting point. Built by Marmelab, it's a full-featured CRM with contact management, timeline, notes, tasks, Kanban board for deals, import/export, activity history, and multiple auth providers. It's explicitly designed to be forked and customized by developers with basic React and SQL knowledge.

**Pros:**
- Built on shadcn/ui — same component system that best matches Kith's design tokens
- Clean, minimal codebase — not enterprise bloat
- Contact-centric data model aligns closely with Kith's schema
- Single-command deploy; PWA-enabled
- MIT-style license

**Cons:**
- Backend is Supabase (PostgreSQL) — would need to swap or adapt for the MariaDB + Node.js backend Kith already has. This is doable but adds work.
- Business CRM framing (deals, pipeline) — some parts would need to be stripped out
- No "spicy mode" or intimate data layer obviously — that's all custom work

**Verdict:** Best raw starting point for the frontend shell and contact data flow. Swap the backend; keep the UI structure.

---

### Monica HQ
**GitHub:** [monicahq/monica](https://github.com/monicahq/monica)
**Stack:** PHP (Laravel) + MySQL

The original personal relationship manager — literally what Kith is inspired by. Monica tracks interactions, reminders, notes, birthdays, how you met, and more. Feature parity with a lot of what's in the Kith spec.

**Pros:**
- Purpose-built for personal relationships, not business
- Rich feature set: interactions, reminders, call logs, life events
- Active community, well-documented

**Cons:**
- PHP/Laravel — completely different backend than Kith's Node.js stack
- UI is dated — light-mode-first, not close to Kith's dark glass aesthetic
- Heavy to adapt the frontend without rebuilding it

**Verdict:** Use as a reference for data modeling and feature decisions, not as code to fork. The Kith spec already captures everything Monica does and more.

---

### Twenty CRM
**GitHub:** [twentyhq/twenty](https://github.com/twentyhq/twenty)
**Stack:** React + TypeScript + NestJS + PostgreSQL + Redis (Nx monorepo)

Modern, beautiful open-source CRM alternative to Salesforce. Well-designed, keyboard-first, and visually close to the aesthetic Kith is going for.

**Pros:**
- Stunning UI — dark, modern, clean
- Keyboard shortcuts + command palette out of the box
- TypeScript throughout
- Strong community (40k+ GitHub stars)

**Cons:**
- Very complex monorepo — NestJS backend, BullMQ, PostgreSQL, Redis, GraphQL. Way more infrastructure than Kith needs.
- Business CRM (companies, deals, pipelines) — not personal-relationship focused
- Heavy to strip down; the architecture is tightly coupled

**Verdict:** Worth studying for UI inspiration and interaction patterns, but too large and business-focused to use as a base. The infrastructure overhead is the opposite of what Kith needs.

---

### EspoCRM
**GitHub:** [espocrm/espocrm](https://github.com/espocrm/espocrm)
**Stack:** PHP + MySQL + Backbone.js SPA frontend

Lightweight, self-hosted CRM that runs on basic LAMP-style hosting.

**Pros:**
- Genuinely lightweight by CRM standards
- Clean admin interface, fast

**Cons:**
- PHP backend
- Backbone.js frontend — outdated pattern
- Business-focused feature set

**Verdict:** Not a fit. PHP backend, outdated frontend pattern, business-centric.

---

## 2. Admin Dashboard Templates

These provide the shell — sidebar, nav, layout, topbar — that you'd build Kith's UI inside.

---

### shadcn-admin ⭐ Top Pick
**GitHub:** [satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin)
**Stack:** React + TypeScript + Vite + shadcn/ui + Tailwind CSS
**License:** MIT

This is the strongest dashboard shell for Kith. It ships with a dark sidebar layout, a working command palette (⌘K) with global search, accessible components throughout, and a clean folder structure. Light/dark mode toggle built in.

**Pros:**
- Command palette is already implemented — Kith spec requires ⌘K/Ctrl+K
- Built entirely on shadcn/ui — every component is customizable to Kith's exact color tokens
- Dark mode first
- Vite — fast dev experience, no ceremony
- TypeScript
- Active maintenance

**Cons:**
- Requires a React build step (Vite)
- You'd replace its placeholder pages with Kith's actual screens

**Verdict:** Best dashboard shell to start with. Drop in Kith's color system, swap the placeholder pages, and you have a fully functional app shell.

---

### Shadboard
**GitHub:** [Qualiora/shadboard](https://github.com/Qualiora/shadboard)
**Stack:** Next.js 15 + shadcn/ui + Tailwind CSS

Similar to shadcn-admin but built on Next.js instead of Vite.

**Pros:**
- Full Next.js app router support
- Rich component set

**Cons:**
- Next.js adds SSR/SSG complexity that Kith doesn't need (it's a personal tool, not a public site)
- Heavier than Vite + React

**Verdict:** Overkill for Kith's use case. Shadcn-admin (Vite) is simpler and more appropriate.

---

### AdminLTE 4
**GitHub:** [ColorlibHQ/AdminLTE](https://github.com/ColorlibHQ/AdminLTE)
**Stack:** Bootstrap 5.3 + TypeScript (no framework)
**License:** MIT
**Stars:** 45,000+

The gold standard for free admin templates. V4 was completely rewritten with TypeScript, dark mode support, and zero jQuery.

**Pros:**
- No React/Vue required — works with vanilla JS
- Native dark/light mode
- Enormous ecosystem of plugins and examples
- Battle-tested at massive scale
- Zero build step if you use the CDN distribution

**Cons:**
- Bootstrap aesthetic — generic out of the box. Getting to Kith's frosted glass, pure-black base, and Inter typography would require significant CSS overrides.
- Less component flexibility than shadcn/ui (Bootstrap's class-based system vs. composable primitives)
- Not TypeScript-native in the same way shadcn/ui is

**Verdict:** Strong option if you want to stay closer to vanilla JS. More CSS work to reach Kith's aesthetic than shadcn-admin, but significantly less infrastructure.

---

### TailAdmin
**GitHub:** [TailAdmin/tailadmin-free-tailwind-dashboard-template](https://github.com/TailAdmin/tailadmin-free-tailwind-dashboard-template)
**Stack:** React 19 + Tailwind CSS v4 + Vite

Modern Tailwind-first dashboard with 500+ UI elements.

**Pros:**
- Tailwind v4 (latest)
- React 19 + Vite

**Cons:**
- Uses raw Tailwind for components (not shadcn/ui) — less composable and customizable than shadcn
- Less focused than shadcn-admin

**Verdict:** Decent alternative to shadcn-admin, but shadcn-admin has a better component story for Kith.

---

## 3. UI Component Libraries

The building blocks for every interactive element in Kith.

---

### shadcn/ui ⭐ Top Pick
**Website:** [ui.shadcn.com](https://ui.shadcn.com)
**Stack:** React + Radix UI primitives + Tailwind CSS
**License:** MIT

Not a traditional component library — you copy components directly into your codebase and own them completely. Built on Radix UI for accessibility and headless behavior, styled with Tailwind. Every Kith design token maps directly to Tailwind CSS variables.

**Pros:**
- You own the code — no library lock-in, no versioning conflicts
- Fully accessible (Radix UI primitives handle ARIA)
- Tailwind CSS variables map 1:1 to Kith's design tokens (`--accent`, `--bg-card`, etc.)
- Dark mode is first-class
- Command palette (cmdk) is the exact implementation needed for ⌘K
- Massive ecosystem — shadcn-admin, Atomic CRM, and most modern dashboard templates are built on it
- Active development, huge community

**Cons:**
- Requires React + Tailwind
- You manage updates manually (copy new versions of components)

**Verdict:** The right component foundation for Kith if you go the React route. The design token system matches Kith's CSS custom properties perfectly.

---

### daisyUI
**Website:** [daisyui.com](https://daisyui.com)
**Stack:** Tailwind CSS (CSS-only, framework agnostic)
**License:** MIT

Pure CSS component library built on Tailwind. Works with any framework or vanilla HTML.

**Pros:**
- Framework agnostic — works with vanilla JS, React, Vue, anything
- Built-in themes with CSS variables (dark themes included)
- Minimal overhead
- No build step if you use the CDN

**Cons:**
- Less composable than shadcn/ui — class-based rather than component primitives
- Aesthetic is more Bootstrap-like; harder to achieve Kith's frosted glass and custom token system
- Accessibility is decent but not as thorough as Radix UI

**Verdict:** Best option if you stay with vanilla JS or want framework-agnostic components. Second choice behind shadcn/ui.

---

### Radix UI (headless)
**Website:** [radix-ui.com](https://www.radix-ui.com)
**Stack:** React

Headless component primitives — behavior and accessibility, zero styling. shadcn/ui is built on top of Radix.

**Pros:**
- Best-in-class accessibility
- Total styling freedom

**Cons:**
- Requires you to style everything yourself
- React required

**Verdict:** Use indirectly through shadcn/ui, not directly.

---

## 4. Frontend Framework Options

---

### Option A: React + Vite + shadcn/ui ⭐ Recommended
The ecosystem of shadcn-admin + shadcn/ui + Atomic CRM reference all point toward this stack. React 19 + Vite is fast to develop, the tooling is excellent, and TypeScript support is first-class. The shadcn component system maps directly to Kith's design tokens. This is the path that minimizes how much UI you build from scratch.

**Development effort:** Low — dashboard shell ready in hours, component library pre-built, just wire up the API.

---

### Option B: HTMX + Alpine.js + Tailwind (+ daisyUI)
The HTML-first approach. No build step, no framework. HTMX handles server-rendered partial updates; Alpine.js handles client-side interactivity (dropdowns, toggles, modals). The Node.js + Express backend renders HTML fragments.

**Pros:** Closest to the current spec, no build step, simple mental model
**Cons:** More HTML to write, fewer pre-built patterns, Kith's component system would need to be built largely from scratch. The command palette (⌘K) is non-trivial to implement well without a library.

**Development effort:** Medium-high for rich UI interactions (drag-to-sort, command palette, modals).

---

### Option C: Vue 3 + Vite
Alternative to React. Similar ecosystem, slightly lighter. shadcn/ui doesn't support Vue natively, but there's a [shadcn-vue](https://www.shadcn-vue.com/) port.

**Development effort:** Similar to React, slightly less ecosystem overlap with Atomic CRM and shadcn-admin.

---

## Recommendation Summary

| Category | Recommendation | Why |
|----------|---------------|-----|
| Starting point | Atomic CRM (fork) | Closest contact-centric CRM codebase; shadcn/ui-based |
| Dashboard shell | shadcn-admin | Dark layout, ⌘K command palette built in, Vite |
| Component library | shadcn/ui | Maps to Kith's design tokens, fully accessible, owned code |
| Framework | React 19 + Vite | Best ecosystem overlap with above choices |
| Backend | Keep Node.js + Express | No reason to change; swap Supabase for MariaDB |

---

## Suggested Path Forward

**Phase 1 — Scaffold:** Start with shadcn-admin as the shell. Apply Kith's color tokens to the Tailwind config. Wire up the sidebar nav structure (Contacts, Groups, Events, Settings, Spicy toggle).

**Phase 2 — Components:** Copy in shadcn/ui components as needed (Table, Modal, Form, Avatar, Badge, Combobox). Customize to match Kith's exact design spec.

**Phase 3 — CRM Features:** Reference Atomic CRM's contact list, detail view, and timeline implementations. Adapt to Kith's schema (spicy profile, tags, groups, social links, media).

**Phase 4 — Kith-Specific:** Implement spicy mode toggle (accent shift, vignette, grain), spicy profile section, Chrome extension API endpoints.

This approach avoids rebuilding the wheel on layout, accessibility, and common UI patterns — while keeping full control over every component since shadcn/ui puts the code in your repo.

---

*Sources consulted: [GitHub - marmelab/atomic-crm](https://github.com/marmelab/atomic-crm) · [GitHub - satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin) · [GitHub - monicahq/monica](https://github.com/monicahq/monica) · [GitHub - twentyhq/twenty](https://github.com/twentyhq/twenty) · [AdminLTE](https://adminlte.io) · [shadcn/ui](https://ui.shadcn.com) · [daisyUI](https://daisyui.com) · [marmelab.com/atomic-crm](https://marmelab.com/atomic-crm/) · [devdiligent.com — Open-Source CRM 2026](https://devdiligent.com/blog/best-open-source-crm-stack-for-small-businesses-in-2026/)*
