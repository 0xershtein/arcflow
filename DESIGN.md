---
name: arcflow docs
description: The documentation site for arcflow — ruled bands, one indigo accent, and panels that hold real artifacts.
colors:
  paper: "#ffffff"
  paper-raised: "#fafafa"
  hairline: "#e4e4e7"
  hairline-strong: "#d4d4d8"
  ink: "#18181b"
  ink-soft: "#3f3f46"
  ink-muted: "#71717a"
  indigo: "#4f46e5"
  indigo-ink: "#ffffff"
  mark-ground: "#18181b"
  paper-dark: "#0f0f11"
  surface-dark: "#18181b"
  paper-raised-dark: "#141417"
  hairline-dark: "#27272a"
  hairline-strong-dark: "#3f3f46"
  ink-dark: "#fafafa"
  ink-soft-dark: "#d4d4d8"
  ink-muted-dark: "#a1a1aa"
  indigo-dark: "#818cf8"
  indigo-ink-dark: "#0f0f11"
  mark-ground-dark: "#09090b"
typography:
  display:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "clamp(36px, 4.4vw, 56px)"
    fontWeight: 700
    lineHeight: 1.04
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "clamp(30px, 4vw, 42px)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.03em"
  title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.6
    letterSpacing: "-0.02em"
  subtitle:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.6
  lede:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.55
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  caption:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
  mono-panel:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.6
  data:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.5
    fontFeature: "tabular-nums"
rounded:
  xs: "5px"
  sm: "6px"
  pill-sm: "7px"
  tab: "8px"
  control: "9px"
  panel: "10px"
  surface: "12px"
  full: "50%"
spacing:
  "2": "2px"
  "4": "4px"
  "6": "6px"
  "8": "8px"
  "10": "10px"
  "12": "12px"
  "16": "16px"
  "20": "20px"
  "22": "22px"
  "24": "24px"
  "28": "28px"
  "32": "32px"
  "44": "44px"
  "48": "48px"
  "56": "56px"
  "80": "80px"
components:
  button-primary:
    backgroundColor: "{colors.indigo}"
    textColor: "{colors.indigo-ink}"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "42px"
    typography: "{typography.label}"
  button-primary-hover:
    backgroundColor: "{colors.indigo}"
    textColor: "{colors.indigo-ink}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "42px"
  button-ghost-hover:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.ink}"
  copy-button:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.sm}"
    padding: "4px 10px"
  copy-button-hover:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.ink}"
  code-block:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.panel}"
    padding: "16px 18px"
    typography: "{typography.mono}"
  nav-link:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.pill-sm}"
    padding: "6px 10px"
    typography: "{typography.label}"
  nav-link-active:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.ink}"
  toc-link-current:
    backgroundColor: "transparent"
    textColor: "{colors.indigo}"
    rounded: "{rounded.sm}"
    padding: "4px 8px"
  tab:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.tab}"
    padding: "6px 14px"
    typography: "{typography.label}"
  tab-selected:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.ink}"
  status-aside:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.surface}"
    padding: "22px 22px 6px"
    typography: "{typography.label}"
  artifact-panel:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.surface}"
    padding: "22px"
  demo-frame:
    backgroundColor: "{colors.paper-raised}"
    rounded: "{rounded.surface}"
    height: "560px"
  inline-code:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xs}"
    padding: "1px 5px"
---

# Design System: arcflow docs

## Overview

**Creative North Star: "The Ruled Notebook"**

The site is a sheet of paper with rules drawn on it. Sections are separated by a single hairline and nothing else — no cards floating over a tinted page, no shadows, no gradients except the one functional fade that keeps a long code line from sliding under the copy button. Everything that carries weight on this site is an artifact: a real `defineNode`, a real validation issue, a real catalog entry, a real editor running in the page. The system's job is to frame those without competing with them.

Density is documentation density, not marketing density: 16px body at 1.6, hairlines at every seam, a 232px sidebar that lists the current page's own headings, and one accent colour that appears only on two things — what is live (the current section, the primary action, the status dot) and what is wrong. The palette is a neutral zinc ramp in both themes, so the mono blocks and the embedded editor read as the loudest things on screen, which is the point.

The site chooses light or dark from the reader's system and yields to a `data-theme` attribute either way, because the editor it embeds already answers to `data-theme`. The two themes are not inversions of each other: the accent lightens (`#4f46e5` → `#818cf8`) and its text colour flips from white to near-black, because white on the dark accent measures 2.98:1 and near-black measures 6.42:1.

**Key Characteristics:**
- Ruled bands: every top-level section opens with one 1px hairline, and that is the only division.
- Zero shadows. Depth is hairline, tone, and one blurred sticky header.
- One indigo accent, reserved for live state, the primary action, and error-adjacent emphasis.
- System sans for prose, mono for every artifact; no third face.
- Tabular numerals wherever numbers are compared (status list, tables, time).
- Both themes are first-class and overridable by `data-theme`; neither is a filter of the other.

## Colors

A neutral zinc ramp in two themes with a single indigo accent; every surface distinction is a step of a few percent, never a hue shift.

### Primary
- **Indigo** (`#4f46e5` light / `#818cf8` dark): The only chromatic colour on the site. It carries the primary button, links, the focus ring, the selection wash (accent at 24% via `color-mix`), the status dot, the brand mark's stroke, and the sidebar entry for the section currently being read. Nothing decorative is ever indigo.
- **Indigo Ink** (`#ffffff` light / `#0f0f11` dark): Text and glyphs placed *on* the accent. It exists as a separate token precisely because it is not the same value in both themes — white on the dark accent measures 2.98:1, near-black on it measures 6.42:1.

### Neutral
- **Paper** (`#ffffff` light / `#0f0f11` dark): The page ground, and the ground of the four artifact panels.
- **Paper Raised** (`#fafafa` light / `#141417` dark): The recessed tone: code blocks, the status aside, nav hover and selected states, inline code, the demo frame.
- **Surface** (`#ffffff` light / `#18181b` dark): A named container tone used by dark mode's component grounds.
- **Hairline** (`#e4e4e7` light / `#27272a` dark): Every rule on the site — section dividers, header and footer edges, table row lines, panel borders, the sidebar's vertical tick.
- **Hairline Strong** (`#d4d4d8` light / `#3f3f46` dark): Borders that must be found rather than merely present: the ghost button, the copy button, the demo frame, the bracket connector, the scrollbar thumb.
- **Ink** (`#18181b` light / `#fafafa` dark): Headings, active navigation, emphasized values.
- **Ink Soft** (`#3f3f46` light / `#d4d4d8` dark): Body prose, table cells, list text, code block text.
- **Ink Muted** (`#71717a` light / `#a1a1aa` dark): Navigation at rest, captions, the footer, definition terms.
- **Mark Ground** (`#18181b` light / `#09090b` dark): The rounded square behind the brand mark only.

### Named Rules
**The Two Jobs Rule.** The accent marks what is live or what is wrong, and nothing else. If a colour is being used to make an element feel important rather than to report its state, it is the wrong colour.

**The Paired Ink Rule.** Never put a raw white on the accent. Foreground on accent is always `indigo-ink`, which changes value per theme; that pairing is the reason the token exists.

**The Two Themes, Not One Rule.** Dark mode is authored, not derived. A new token needs a value in both blocks and in the `data-theme="dark"` override; no filter or inversion substitutes for it.

## Typography

**Display / Body Font:** the platform UI sans (`ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`)
**Artifact Font:** the platform mono (`ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`)

**Character:** Two faces, both the reader's own. Prose is unbranded on purpose — the site's voice comes from what it shows, not from a typeface — and the mono face is reserved absolutely for machine text, so anything in mono on this site is something you could paste into a terminal or a file.

### Hierarchy
- **Display** (700, `clamp(36px, 4.4vw, 56px)`, 1.04, -0.035em, `text-wrap: balance`, max 26ch): The landing headline only. One per site.
- **Headline** (700, `clamp(30px, 4vw, 42px)`, 1.15, -0.03em): The `h1` on every documentation page.
- **Title** (700, 22px, -0.02em, 48px of space above, `scroll-margin-top: 78px`): Section headings. These are what the sidebar lists, so a heading is also a navigation entry.
- **Subtitle** (700, 16px): Sub-section headings, including the artifact panel headings at 15px.
- **Lede** (400, 18px, 1.55, max 62ch): The one paragraph under the display headline.
- **Body** (400, 16px, 1.6, max 70ch via `.measure`): All prose.
- **Label** (400–600, 14px): Navigation, buttons, tabs, table cells, the status aside.
- **Caption** (400, 13–13.5px): The footer, sidebar sub-entries, the note under the agent session.
- **Mono** (400, 13px, 1.6, `tab-size: 2`): Code blocks. Drops to 12.5px inside the four artifact panels, where the column is narrower; inline code runs at `0.92em` of its context.

### Named Rules
**The Mono Means Machine Rule.** Monospace is only ever real code, real JSON, a real command or a real transcript. Mono is never used for emphasis, for labels, or for atmosphere.

**The Measure Rule.** Prose is capped: 70ch for body (`.measure`), 62ch for the lede, 46ch inside an artifact panel, 26ch for the display headline. A paragraph that runs the full 860px column is a bug.

## Layout

A centred single column with an optional sidebar, and one rhythm shared by both.

- **Documentation pages:** a 1140px grid of `232px / minmax(0, 1fr)` with a 24px gutter. The sidebar is sticky at `top: 72px`, scrolls within `calc(100vh - 96px)`, and is built from the page's own `h2` elements at runtime — adding a section adds a sidebar entry, and the entry for the last heading past the top of the window is the one marked current (scroll handler throttled to 80ms; the foot of the page counts as being in the final section). Main is capped at 860px with `44px 24px 80px` padding.
- **Landing:** no sidebar at all — a page to read once, not to navigate. The container widens to 1180px, main goes full width with a 36px top pad, and the header nav appears in its place.
- **Hero:** a `7fr / 5fr` grid with a 48px gutter. The pitch (headline, lede, copyable install command, the two actions) sits left; the honest status aside sits right, quieter but never hidden.
- **Section rhythm:** `56px` top and bottom per section, `40px` below 900px. Headings carry 48px above, paragraphs 16px below, code blocks 24px below.
- **Breakpoints:** `960px` — sidebar collapses and navigation moves back into the header; `900px` — the hero stacks (32px gap) and the four artifact panels become one column, the bracket connector becoming a single 1px stem; `720px` — header padding tightens to `10px 16px` and the header GitHub link drops.
- **Browser surfaces are part of the layout:** scrollbars are themed (`scrollbar-color: hairline-strong transparent`), selection is the accent at 24%, focus is a 2px accent outline at 2px offset, `box-sizing: border-box` is global, and smooth scrolling is only enabled under `prefers-reduced-motion: no-preference`.

### Named Rules
**The Page Lists Itself Rule.** The sidebar is derived from the rendered headings, never from a hand-kept list beside the page. Content and navigation cannot drift.

## Elevation & Depth

The site has no shadows. Grep the shipped stylesheets and `box-shadow` does not appear once. Depth is expressed three ways and only three ways: a 1px hairline, a small tonal step to `paper-raised`, and — in exactly one place — translucency.

That one place is the sticky header, which sits on `color-mix(in srgb, var(--bg) 88%, transparent)` with `backdrop-filter: blur(8px)`, so content passing under it is felt rather than hidden. The four artifact panels get their grid lines from a 1px gap over a hairline-coloured grid background rather than from borders on each panel, which keeps the seams exactly 1px and shared.

### Named Rules
**The Flat Sheet Rule.** No `box-shadow` anywhere, in either theme. If an element needs to separate from its ground, it gets a hairline or a tonal step — never a lift.

**The One Gradient Rule.** The single gradient in the system is functional: the 108×46px fade at the top-right of a code block, painted from `--code-bg` so it dissolves a long line before it reaches the copy button. A block placed on a different surface sets `--code-bg` and the fade follows. Gradients are not available for decoration.

## Shapes

Rounded rectangles on one small ramp, scaled to the size of the thing: 5px on inline code, 6px on the copy button and sidebar sub-links, 7px on nav pills and the brand mark, 8px on framework tabs, 9px on buttons, 10px on code blocks and segmented controls, 12px on the surfaces that hold something whole — the status aside, the artifact panel grid, the editor frame. The only circle in the system is the 7px status dot.

Borders are a uniform 1px; the system's whole structural vocabulary is `1px solid var(--line)` with `--line-strong` reserved for edges a reader must be able to locate. The one drawn figure on the site is the bracket connector under the step definition: a two-footed 1px SVG path in `hairline-strong`, stroked with `vector-effect: non-scaling-stroke` so it stays hairline at any width.

### Named Rules
**The Radius Follows Size Rule.** A control under 32px tall takes 6–7px; a button takes 9px; a block of code takes 10px; anything that contains a whole artifact takes 12px. Nothing on the site is a pill and nothing is a square.

## Components

Everything here is a frame around someone else's content. The character is quiet, hairline-bounded, and instantly legible in both themes.

### Buttons
- **Shape:** 9px corners, fixed 42px height, `0 20px` padding, 15px at weight 550.
- **Primary:** accent ground, `indigo-ink` text, accent border. Hover is `filter: brightness(1.08)` — it brightens rather than swapping to a second accent value.
- **Ghost:** transparent ground, `hairline-strong` border, `ink` text. Hover fills with `paper-raised`.
- **Transition:** background and border colour over 180ms on `cubic-bezier(0.16, 1, 0.3, 1)`. Nothing moves, scales, or lifts on hover.

### Code Block (signature)
- A `figure` with a 1px hairline border, 10px corners, `--code-bg` defaulting to `paper-raised`, and `16px 18px` of padding around 13px mono at 1.6 with `tab-size: 2`.
- A **copy button** pinned at `top: 8px; right: 8px`, on its own `paper` ground with a `hairline-strong` border so it has something to stand on in light mode, at `z-index: 1` above the fade. Label swaps to "Copied" for 1500ms; a blocked clipboard fails silently because the code is selectable anyway.
- The fade described in Elevation & Depth is part of this component and reads `--code-bg`, so any host surface that overrides the ground keeps a matching fade.

### Tabs (framework switcher)
- A 2px-gap row of borderless 14px buttons above the code block: muted at rest, `paper-raised` ground on hover, and selected at weight 600 with a `--line` border and `paper-raised` ground on 8px corners.
- The reader's choice persists per group in `localStorage`, restored after hydration so the prerendered page and the first client render agree; a blocked store only costs the memory.
- The same segmented pattern recurs on the editor page's step-shape switcher, inside a 10px hairline-bordered 4px-padded track.

### Navigation
- **Header:** sticky, `z-index: 10`, 12px×28px padding, hairline bottom, translucent blurred ground. The brand is a 26px inline SVG mark plus the wordmark at weight 650 and -0.02em. Nav links are 14px muted pills (7px, `6px 10px`) that take `ink` text on `paper-raised` for hover and current. The header nav is present only on the landing (`.shell:has(.is-landing)`) and below 960px; the GitHub link sits at `margin-left: auto` and disappears below 720px.
- **Sidebar:** page links at 14px, current page at weight 600 in `ink`; under it, the current page's own sections indented behind a 1px left hairline, 13.5px, and the section currently being read takes the accent as its text colour — the accent as a reading position, not as a highlight block.
- **Footer:** hairline top, 13px muted, the licence and framework credits left, source right.

### Status Aside (signature)
- The honest half of the hero: 12px corners, hairline border, `paper-raised` ground, 14px text. Opens with a 7px accent dot beside "0.1.0, released 2026-09-21", then the plain statement of where the packages live, then a definition list of hairline-separated rows (term muted left, value right-aligned) in tabular numerals.
- Its quietness is the whole design: it is never collapsed, never behind a toggle, and never styled as a warning banner.

### Artifact Panels
- A 2×2 grid whose 1px gap over a hairline ground draws the seams, wrapped in a 12px hairline-bordered rounded box with `overflow: hidden`. Each panel is `paper`-grounded with 22px padding, a 15px heading, a ≤46ch note at 14px, and a code block that sets `--code-bg: var(--surface-2)` and tightens to `13px 15px` / 12.5px.
- Below 900px it becomes one column and the connector collapses to a single stem.

### Editor Frame
- A `hairline-strong` 1px border, 12px corners, `overflow: hidden`, `paper-raised` ground, 560px default height, with a centred 14px muted "Loading the editor…" placeholder before hydration.
- **The frame is the only thing the site contributes.** Inside it, the editor themes itself through its own `--fb-*` tokens and `theme="auto"`. No site token, no site font, no site accent crosses that border.

### Tables
- Full width, collapsed borders, 14px, left-aligned headers at weight 600, `9px 12px` cells with a hairline bottom rule and top-aligned content, `ink-soft` text, tabular numerals.

### Motion
- Two durations: 150ms for small controls (the copy button), 180ms for buttons. One easing curve across the whole site: `cubic-bezier(0.16, 1, 0.3, 1)`.
- One authored animation: the bracket connector draws itself once over 1s on that same curve (`stroke-dasharray: 1` with `pathLength="1"`), and `prefers-reduced-motion: reduce` removes the animation and the dash entirely, leaving the line drawn.
- Only colour animates. Nothing translates, scales, fades in on scroll, or reveals on hover.

### Named Rules
**The Host's Border Rule.** The embedded editor is unbranded. The site's styling stops at the frame; the editor is themed only through its own `--fb-*` tokens. If a site token leaks inside that border, it is a bug in the site, not a theme.

**The Colour-Only Motion Rule.** Transitions animate colour. Motion that moves a thing is reserved for the one connector that draws once, and that one yields to reduced motion.

## Do's and Don'ts

### Do:
- **Do** separate sections with exactly one `1px solid var(--line)` rule and 56px of vertical air (40px below 900px).
- **Do** give every new colour a value in all three token blocks: `:root`, the `prefers-color-scheme: dark` block, and the `[data-theme='dark']` override.
- **Do** use `indigo-ink` for anything sitting on the accent; white on the dark accent measures 2.98:1.
- **Do** put real artifacts in mono — actual definitions, actual issues, actual commands, actual transcripts — and keep the measured numbers traceable to this repository.
- **Do** cap prose: 70ch body, 62ch lede, 46ch in a panel, 26ch display.
- **Do** set `--code-bg` when a code block sits on a surface other than `paper-raised`, so the copy fade matches its ground.
- **Do** derive in-page navigation from the rendered `h2` elements rather than a parallel list.
- **Do** theme the browser's own surfaces — selection, focus ring, scrollbar, caret — from the same palette, and use tabular numerals wherever numbers stack.
- **Do** keep every claim about the packages inside what is true today: 0.1.0 is on npm under `@arcsig-labs`, and running from source is clone + `pnpm install` + `pnpm dev`.

### Don't:
- **Don't** add a `box-shadow`. The system has none; use a hairline or a tonal step.
- **Don't** add a decorative gradient. The only gradient is the functional code-block fade.
- **Don't** let any site styling cross into the embedded editor. It themes itself through `--fb-*`; the packages stay unbranded.
- **Don't** imply the packages are published, and **don't** invent users, customers, testimonials, benchmarks or download counts. None exist.
- **Don't** introduce a third typeface, and don't use mono for emphasis, labels or atmosphere.
- **Don't** use the accent for decoration — it means live or wrong, nothing else.
- **Don't** animate position, scale or opacity on scroll or hover; transitions carry colour only.
- **Don't** hide or soften the status aside, and don't restyle it as a warning banner.
- **Don't** put the sidebar on the landing; below 960px navigation belongs in the header.
