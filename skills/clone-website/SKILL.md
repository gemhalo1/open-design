---
name: clone-website
zh_name: "网站复刻"
en_name: "Clone Website"
description: |
  Clone any public URL into a self-contained, editable HTML artifact, then fix
  it up to the user's requirements. Renders the page in headless Chromium so
  client-rendered (React/Vue/SPA) sites are captured the way a human sees them —
  not the empty shell that a raw source download returns — inlines stylesheets
  and images, drops scripts for a stable static snapshot, and saves a full-page
  reference screenshot to diff against while editing. Use when the user pastes a
  URL and asks to copy, clone, mirror, replicate, or "make the same as" a site,
  optionally with changes (rewrite copy, swap colors, drop sections, rebrand).
triggers:
  - "clone website"
  - "clone this url"
  - "copy this website"
  - "mirror this page"
  - "replicate this site"
  - "make the same as this url"
  - "复刻网站"
  - "克隆网页"
  - "照着这个网址做"
  - "把这个网站复制一份"
od:
  mode: prototype
  surface: web
  platform: desktop
  scenario: design
  category: web-artifacts
  preview:
    type: html
    entry: example.html
  design_system:
    requires: false
  craft:
    requires:
      - typography
      - color
      - anti-ai-slop
  capabilities_required:
    - file_write
  example_prompt: |
    Clone https://stripe.com into an editable HTML file, then change the hero
    headline to "Payments for builders" and swap the accent color to emerald.
---

# Clone Website

Turn a URL into an editable, self-contained `index.html` the user can keep
shaping inside Open Design. The hard part of cloning is **fidelity on modern
sites**: most marketing and product pages render their content with JavaScript,
so downloading the raw HTML source returns an empty `<div id="root">`. This
skill renders the page in a real browser first, then snapshots what was painted.

## Workflow

1. **Capture.** Run the bundled snapshot tool against the URL. Default
   (rendered) mode is correct for almost everything:

   ```bash
   node assets/capture.mjs "<url>" --out index.html --shot reference.png
   ```

   - It launches headless Chromium, waits for network idle, scrolls to trigger
     lazy-loaded content, inlines stylesheets, base64-inlines images, removes
     `<script>` tags (a static snapshot must not re-run hydration that would
     wipe the DOM), and injects `<base href>` so any non-inlined asset still
     loads. It also writes `reference.png`, a full-page screenshot.
   - If it reports **Playwright not found**, install it once
     (`npm i -D playwright && npx playwright install chromium`) or fall back to
     static mode for server-rendered sites: add `--static`.
   - Tuning flags: `--max-asset-kb <n>` (asset inline ceiling, default 512),
     `--viewport <w>x<h>` (default 1440x900), `--wait-ms <n>` (extra settle
     time), `--keep-scripts` (rarely wanted — risks re-render/redirect).

2. **Sanity-check the snapshot.** Open `index.html` and confirm the real
   content is present (headings, sections, copy), not a blank shell. If the page
   came back empty, the site likely blocked headless access or needed an
   interaction — increase `--wait-ms`, or note the limitation to the user rather
   than shipping an empty clone. Compare against `reference.png` for layout.

3. **Apply the user's fixes.** Edit `index.html` directly to satisfy what they
   asked for — rewrite copy, swap colors/fonts, remove sections, rebrand, make
   it responsive, strip tracking. Treat `reference.png` as the visual ground
   truth for everything you are *not* changing, so edits stay surgical and the
   rest of the page keeps its pixel-level look.

4. **Preview.** The artifact is `index.html`; it renders in the Open Design
   preview iframe with no external build step. Verify it loads and the requested
   changes are visible.

## Fidelity notes — be honest about these

- **Inlined:** stylesheets, `<img>` images (up to the size cap), the rendered
  DOM. These carry the bulk of the visual fidelity.
- **Left as network URLs (via `<base href>`):** web fonts, CSS
  `background-image` assets, and any image over the size cap. The clone looks
  pixel-perfect while online; for a fully offline mirror, raise
  `--max-asset-kb` and tell the user fonts may still hot-link.
- **Dropped:** JavaScript behavior (carousels, menus, animations). The snapshot
  is the painted end-state, not an interactive reimplementation. If the user
  needs interactivity back, rebuild it intentionally rather than restoring the
  original scripts.

## Why the bundled tool, not a hand-rolled snapshot

A rendered page keeps its visual state in three places, and a naive
`document.outerHTML` dump only captures the first:

1. **DOM + attributes** — survives serialization.
2. **External `<link>` CSS** — survives as a reference, but its `url()` and
   `@import` resolve relative to the *stylesheet's* location, not the document.
   Inline the CSS without rewriting them and every font / background-image 404s,
   so the page falls back to system fonts with the wrong metrics.
3. **Runtime-only CSS** — styled-components / emotion and other CSS-in-JS inject
   rules straight into the CSSOM via `insertRule`, leaving their `<style>` tags'
   text nodes *empty*; constructable `adoptedStyleSheets` live in no `<style>`
   at all. A raw dump loses all of it, so the clone renders the right DOM and
   the right fonts but the wrong type sizes, weights, and layout.

`assets/capture.mjs` flattens the live CSSOM back into the document for all
three cases (absolute `url()` rewriting + re-serializing every sheet's
`cssRules`, including the empty styled-components tags and adopted sheets).
**Do not** swap it for a `curl`-and-regex snapshot or a one-off `outerHTML`
dump — that reintroduces exactly these losses.

**Failure signature:** if the clone has the right text and fonts but the type
sizes / weights / spacing look off, that is CSS-in-JS loss (item 3), not a
content problem. Re-run `capture.mjs` rather than patching sizes by hand.

## Boundaries

- Only clone pages the user is authorized to copy. Decline obvious wholesale
  rip-offs of someone else's product passed off as original; cloning for
  reference, learning, redesign, or one's own site is the intended use.
- Do not capture pages behind a login or paywall unless the user owns the
  account and explicitly asks.
- For "make it *feel* like this" rather than a 1:1 copy, prefer the
  `reference-design-contract` skill (turns references into a reusable
  `DESIGN.md`); this skill is for faithful structural clones.
