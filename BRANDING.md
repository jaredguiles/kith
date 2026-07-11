# Kith — Brand Provenance (superseded)

> **This document is superseded by [`DESIGN.md`](DESIGN.md).**
>
> BRANDING.md v1.2 described Kith's original visual system — a dark
> frosted-glass UI (pure-black base, layered translucent surfaces,
> `backdrop-filter` blur), Inter typography, a `#7c5bf5` purple accent, a
> `#c2394f` rose-red spicy accent, a flame spicy toggle, pride-flag avatar
> overlays, and admin-configurable accent colors. That system shipped in
> v1.0–v1.2 and was **fully replaced in v1.3 by "The Record"** (paper/ink
> editorial dossier, Newsreader + IBM Plex, ink-blue → oxblood confidential
> accent, zero blur/glass, 4px print-like corners, lock toggle). All current
> visual specifications live in `DESIGN.md`; the implementation is
> `server/public/css/style.css`.
>
> This file is kept only for **name and logo provenance**, below.

---

## Name

> *"kith (n.) — Old English: one's friends, acquaintances, and relations."*

The name "Kith" comes from the Old English word for one's friends,
acquaintances, and relations — as in "kith and kin." Kith exists to help
people be more intentional about the relationships that matter most: not
networking, not business contacts — the actual humans in your life. It is
personal, private, and intimate — a journal that knows everyone you care
about.

Always title case: `Kith`, never `KITH` or `kith` alone.

## Logo & Wordmark

- **Source file:** `logo.png` (repo root) — white mark on transparent
  background. An SVG version (`server/public/assets/logo.svg`) was produced
  during the v1 build for scalable, color-inheriting production use; it
  renders in `currentColor` so it follows the active theme.
- **Lockup:** the mark leads, followed by a single em-space, followed by the
  wordmark.
- **Forbidden treatments (still apply):** do not stretch, skew, rotate, or
  recolor the mark arbitrarily; no drop shadows or effects on the wordmark;
  do not recreate the mark in a different style or weight; do not place the
  white-on-transparent version on a light background.
- The original wordmark typeface was **Inter Semibold** (letter-spacing
  0.02em). Under The Record, in-app the masthead is set in **Newsreader**
  per `DESIGN.md` — the Inter spec here is historical.

---

*Original document: Kith Brand Guidelines v1.2 (March 2026), retired
2026-07-07 with the v1.3 "The Record" redesign. See git history for the
full text.*
