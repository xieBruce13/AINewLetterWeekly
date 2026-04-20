# DESIGN.md — AI Weekly Briefing

**Adapted from:** [Pinterest — getdesign.md/pinterest](https://getdesign.md/pinterest/design-md) (VoltAgent's `awesome-design-md`, installed via `npx getdesign@latest add pinterest`). This is a curated starting point; not an official Pinterest design system.

The newsletter is a **warm craft-feel weekly briefing**: a soft off-white canvas, plum-black text, Pinterest Red as the singular accent, generous 16–28px rounded corners, sand-toned secondary surfaces, and signature 8px white "mat" borders around every image. No cool greys, no gradients, no competing accent colors.

This file is the authoritative source for all visual decisions. `tools/convert_to_pdf.py` CSS must implement these tokens exactly; never hard-code values that aren't defined here. If a design rule changes, update this file first, then the CSS.

**Non-negotiable user requirement:** important information must be **bigger and bolder**. Pinterest's scale supports this natively — the "Display Hero" is 70px and the compact text is 12px, so there is built-in room for dramatic scale jumps. We apply the same scale jump to the **TL;DR (总结) row**, the **编辑部核心判断**, and the **h1 title** so scanners can absorb the week from three surfaces alone.

---

## 1. Visual Theme & Atmosphere

The newsletter should read the way a well-curated Pinterest board reads: warm, inspiration-led, human. Every surface leans olive/sand rather than cool steel. Every container is softly rounded rather than hard-edged. The one confident color on the page is Pinterest Red, used sparingly — a red TL;DR rail, a red brand dot in the header, red links on hover. Everything else lives in a narrow warm grayscale.

**Signature moves (adopted from Pinterest):**
- **Warm canvas.** The page background is `canvas-warm` (`#faf9f5`) — not paper-white. It feels like craft stock, not office paper.
- **White "pin" cards.** Each story block is a `paper` (`#ffffff`) card with a 24px radius sitting on the warm canvas. No shadow, no border. Content density carries the card; rounding signals "this is a unit".
- **Warm sand kickers.** `M1 · MODEL`, `P1 · PRODUCT`, `STARTUP` render as small **sand-filled pills** (`#e5e5e0` background, plum-black text, 16px radius) — not WIRED mono-uppercase ribbons.
- **Pinterest Red as the one signal.** The TL;DR (总结) row gets a **4px red left bar** on a sand-gray surface. The h1 title block carries a small red dot. Links turn red on hover. Nothing else on the page is red.
- **Generous rounding.** Every rectangle rounds. 12–16px small, 20–24px cards, 28–32px large containers, 50% for the brand dot and optional avatars. No square corners except on image mats (which are squared-edge 8px white frames — Pinterest's signature).
- **Single font.** Inter (the Pin Sans substitute) handles every role. No serif, no monospace. Pinterest's compact type hierarchy comes from weight + size + tracking, not from font family switching.

**Tone of surface:** `canvas-warm` for the page, `paper` for cards, `fog` for quiet wrappers, `sand-gray` for tags and TL;DR bars, `dark-warm` for the one inverted block (references footer).

---

## 2. Color Palette & Roles

Three-tier token architecture per Pinterest:
- `--base-*` raw hexes (don't reference directly outside this file)
- `--sema-*` semantic roles (text-primary, surface-card, border-quiet…)
- `--comp-*` component tokens (button-bg, tldr-bar, kicker-bg…)

**Do not introduce new hexes.** Pinterest's discipline is explicit: red + warm neutrals + one plum text = complete palette.

### Base colors

| Token          | Hex        | Origin                                                       |
| -------------- | ---------- | ------------------------------------------------------------ |
| `pin-red`      | `#e60023`  | Pinterest brand red                                          |
| `plum-black`   | `#211922`  | Primary text — warm near-black with plum undertone           |
| `olive-gray`   | `#62625b`  | Secondary text, captions                                     |
| `warm-silver`  | `#91918c`  | Input borders, disabled text                                 |
| `sand-gray`    | `#e5e5e0`  | Secondary surface, kicker pills, TL;DR bg, hairline rules    |
| `warm-light`   | `#e0e0d9`  | Tertiary surface (circle-avatar bg, brief table zebra)       |
| `fog`          | `#f6f6f3`  | Quiet wrapper, module tray bg                                |
| `warm-wash`    | `hsla(60,20%,98%,0.5)` | Subtle badge wash, blockquote bg                 |
| `canvas-warm`  | `#faf9f5`  | Page background (the craft-stock feel)                       |
| `paper`        | `#ffffff`  | Card surfaces, image mat                                     |
| `dark-warm`    | `#33332e`  | References footer (Pinterest's dark footer color)            |
| `link-blue`    | `#2b48d4`  | Link text — stays blue for long-form accessibility            |
| `focus-blue`   | `#435ee5`  | Focus outline only                                            |
| `error-red`    | `#9e0a0a`  | Rare form/error marker (unused in this document)             |

### Semantic roles

| Token                        | = Base           | Role                                      |
| ---------------------------- | ---------------- | ----------------------------------------- |
| `sema-text-primary`          | `plum-black`     | All body, headings, strong                |
| `sema-text-secondary`        | `olive-gray`     | Captions, source, timestamps              |
| `sema-text-muted`            | `warm-silver`    | Disabled / very low-priority              |
| `sema-text-inverse`          | `paper`          | Text on dark-warm surface                 |
| `sema-accent`                | `pin-red`        | TL;DR bar, brand dot, link hover          |
| `sema-surface-page`          | `canvas-warm`    | Body background                           |
| `sema-surface-card`          | `paper`          | Story card, detail table                  |
| `sema-surface-wrap`          | `fog`            | Module tray, info 2×2 table cells         |
| `sema-surface-sand`          | `sand-gray`      | Kicker pill, TL;DR row, brief zebra       |
| `sema-surface-wash`          | `warm-wash`      | User-quote blockquote                     |
| `sema-surface-inverse`       | `dark-warm`      | References footer                         |
| `sema-border-hairline`       | `sand-gray`      | Row dividers, card-inside-card rules      |
| `sema-border-input`          | `warm-silver`    | Input borders (rare in this doc)          |

### Do NOT use

- No cool blue-gray (`#cbd5e1` / `#1e293b` etc.). All grays lean warm.
- No amber, green, or purple in chrome. If the writer needs a semantic "verdict," that lives in weight + size, or in the red TL;DR bar.
- No gradients. No decorative glow, no halo. Pinterest is flat by discipline.

---

## 3. Typography Rules

### Font stack

Pin Sans is proprietary. We substitute **Inter** (open-source, matches Pin Sans's geometric warmth), with the Pinterest fallback chain intact — including the CJK fallbacks. Inter is loaded from Google Fonts; `-apple-system` and `PingFang SC` pick up on macOS; `Segoe UI` + `Microsoft YaHei` on Windows. **A single family handles every role.**

```css
--font-sans: "Pin Sans", "Inter", -apple-system, system-ui, "Segoe UI",
             Roboto, "PingFang SC", "Microsoft YaHei",
             "Source Han Sans SC", "ヒラギノ角ゴ Pro W3", "メイリオ", Meiryo,
             "Helvetica Neue", Helvetica, Arial, sans-serif;
```

No serif, no monospace anywhere on the page (including kickers — they render in Inter at weight 600 with +0.4px tracking, not in a mono).

### Hierarchy

Sizes target A4 print at 10.5pt body. Pinterest's web 70px hero is scaled to 32pt in print (still dramatic).

| Role                       | Size       | Weight | Line-height | Letter-spacing | Notes |
| -------------------------- | ---------- | ------ | ----------- | -------------- | ----- |
| `display-hero` (h1)        | **32pt**   | 700    | 1.05        | -1.2px         | Title block, plum-black. Negative tracking per Pinterest. |
| `hero-sub`                 | 10pt       | 500    | 1.4         | +0.1px         | Date + theme line inside header, olive-gray |
| `h2-section`               | **20pt**   | 700    | 1.15        | -0.8px         | Section titles (本周结论 / 模型模块 / 产品模块 …). Negative tracking. |
| `h3-entry`                 | **17pt**   | 700    | 1.2         | -0.4px         | Entry headline after the kicker pill |
| `kicker-pill`              | 9pt        | 600    | 1           | +0.4px         | `M1 · MODEL` pill: plum text on sand-gray, 14px rounded |
| `deck-body` (本周结论 card)| **14pt**   | 500    | 1.55        | -0.1px         | Editor's verdict paragraph — #1 highlight, never bold throughout |
| `deck-label`               | 10pt       | 700    | 1.3         | +0.4px         | UPPERCASE label above the deck paragraph (`核心判断 · EDITOR'S CALL`), rendered in **Pinterest Red** |
| `summary-row`              | **13pt**   | 700    | 1.5         | -0.1px         | 总结 row body — #2 highlight, plum-black 700, on sand with red rail |
| `summary-label`            | 9pt        | 700    | 1           | +0.6px         | UPPERCASE `TL;DR` label inside the row, rendered in **Pinterest Red** |
| `body`                     | 10.5pt     | 400    | 1.6         | 0              | Default body paragraphs |
| `body-strong`              | 10.5pt     | 700    | 1.6         | 0              | Bolded numbers, product names, verdict words |
| `table-body`               | 10pt       | 400    | 1.55        | 0              | Detail-table right column, info-table cells |
| `table-label`              | 9pt        | 700    | 1.35        | +0.3px         | Detail-table left column (模块) — sand bg |
| `info-th`                  | 9.5pt      | 700    | 1.2         | +0.3px         | Info 2×2 table header — plum text on sand bg |
| `brief-name`               | 11pt       | 700    | 1.3         | -0.1px         | Left column of 简讯 table |
| `brief-body`               | 9.5pt      | 400    | 1.5         | 0              | Right column of 简讯 table |
| `quote`                    | 10.5pt     | 400 it | 1.55        | 0              | User-quote text, italic (Pinterest doesn't do italic heavily but it's safe here) |
| `quote-source`             | 8.5pt      | 600    | 1.3         | +0.2px         | `— u/user, r/sub` attribution, olive-gray |
| `caption`                  | 8.5pt      | 500 it | 1.4         | +0.1px         | Image captions under 8px white mat |
| `reference`                | 7.5pt      | 400    | 1.4         | 0              | 参考来源 list — paper white on dark-warm |

### Principles

- **One family, many weights.** Inter covers 400 / 500 / 600 / 700 / 800. No thin weights (≤300). No serif. No mono.
- **Negative tracking on headings.** -0.4 to -1.2px on h1/h2/h3 — Pinterest's "cozy, intimate section title" trick.
- **Positive tracking on tiny UPPERCASE labels.** +0.3 to +0.6px on kickers, deck labels, `TL;DR`. Only these tiny labels are UPPERCASE — everything else is mixed case.
- **Bold lives in three places.** (1) The h1. (2) The summary-row TL;DR. (3) Inline product names / key numbers. Default body is weight 400.
- **Tabular numerics.** `font-variant-numeric: tabular-nums` on `strong`, tables, the deck, the summary row — stats align.

### Chinese-language caveat

`text-transform: uppercase` has no effect on CJK glyphs. For mixed Chinese + Latin labels (`M1 · MODEL`, `核心判断 · EDITOR'S CALL`), the Latin half carries the visual case treatment and the Chinese half inherits the mono-feel from the smaller size + heavier weight. That is why every pill-style label has both halves.

---

## 4. Component Stylings

### 4.1 Title block (h1 + subtitle)

- White card `paper` on `canvas-warm`, radius 28px, padding `22px 26px`, no shadow, no border.
- Red brand dot: 10px `pin-red` circle, positioned inline before the h1 text (or above it on tight widths). This is the ONE red mark at the top of the page.
- h1 text: `display-hero` (32pt, weight 700), plum-black. Left-aligned.
- Subtitle (date window + theme): `hero-sub` — two stacked lines of olive-gray text, 10pt weight 500. No border rule below the card.
- Margin below the card: 20px before the first section.

### 4.2 Section headers (h2)

Pinterest doesn't use ribbon bars. We replace the WIRED black ribbon with a **soft title row**:

- Plum-black text at `h2-section` (20pt weight 700, -0.8px tracking).
- Left-aligned. A **4px Pinterest Red rail** runs vertically 2px inside the text baseline (implemented as `border-left: 4px solid pin-red`, 12px padding-left).
- No background fill, no full-bleed bar.
- Margin: `24px 0 12px`.
- Within the inverted references footer, the red rail remains red but the text turns `paper` (white) on dark-warm.

### 4.3 本周结论 deck ("editor's verdict") — #1 HIGHLIGHT SURFACE

The editor's paragraph is the single most important surface in the document. Everything about it is deliberately amplified. **The deck holds exactly one block — `核心判断 · EDITOR'S CALL`.** The former `对我们的方向 · NEXT MOVE` block has been retired; the action / positioning content lives in `编辑部判断 → 项目动作` at the bottom of the issue, where it can be tied to concrete weekly tasks.

- Wrapper: `<div class="deck">`
- Card: `paper` background, 20px radius, padding `20px 24px`, **6px `pin-red` left border** (flush inside the radius). No shadow.
- Inner transforms for the `核心判断` block:
  - First `<strong>` becomes a `deck-label` UPPERCASE span in **Pinterest Red**: 10pt, weight 700, +0.4px tracking, `display: block`, margin-bottom 6px. Append ` · EDITOR'S CALL`.
  - Paragraph body: `deck-body` **14pt** weight 500 line-height 1.55, plum-black.
  - Inline `<strong>` past the label: weight 700, plum-black.
- Single block only — no inter-block separator rule, no second paragraph.

### 4.4 Module container

None. Pinterest doesn't tray content with heavy backgrounds — the white card + warm canvas is the visual distinction. `## 模型模块` just renders as a section header; story cards flow beneath it.

### 4.5 Entry "card" (story block)

- `<div class="story">`, `paper` background, **24px radius**, padding `20px 22px 14px`, no border, no shadow.
- Sits on `canvas-warm` so the radius reads cleanly.
- Between adjacent story cards: 14px vertical gap (no border line — rounding + canvas separation is enough, which is the Pinterest move).
- Auto-split h3 into:
  - **Kicker pill** at the top: `<span class="story-kicker">` — `sand-gray` fill, plum-black text, 14px border-radius (pill-rounded but NOT full), padding `3px 10px`, `kicker-pill` type (9pt weight 600 +0.4px). Content: `M1 · MODEL` / `P1 · PRODUCT` / `STARTUP`. The pill sits above the headline with 8px gap.
  - Headline: `h3-entry` (17pt weight 700 -0.4px tracking), plum-black.

### 4.6 Detail table (模块 | 具体详情)

- `.summary-row-emphasis` class applied by the renderer.
- Outer border: none. Outer radius: 16px (clips child rows via `overflow: hidden`).
- Two-column, **locked via `table-layout: fixed` at 15% / 85%** — applied to both `<th>` and `<td>` on every row. The 模块 column is never allowed to widen.
- Left column (`td:first-child`): `sand-gray` background, `table-label` type (9pt weight 700 +0.3px, UPPERCASE Latin / mixed Chinese), plum-black, vertical-align top, padding `10px 12px`.
- Right column: white background (inherit card), `table-body` type (10pt 400 line-height 1.55), plum-black, padding `10px 14px`.
- Row divider: `1px solid sand-gray`, only between rows (no bottom border on last row).
- **TL;DR row (first row) — #2 HIGHLIGHT SURFACE (Pinterest Red signal):**
  - Right cell: `summary-row` (**13pt** weight 700 -0.1px), plum-black. Background `sand-gray`. Padding `16px 18px`. **6px `pin-red` left border** (inside the cell, flush). No extra top/bottom rules.
  - Left cell: `summary-label` (9pt weight 700 +0.6px, UPPERCASE) rendered in **Pinterest Red** on `sand-gray`; the ` · TL;DR` suffix also renders red and weight-700. This and the deck-label are the only two places red appears as text on the page.

### 4.7 Info 2×2 tables (官方声明 | 外部验证, 社区反馈 | 编辑判断)

- `.info-table` class applied by the renderer to any non-first table inside a story.
- Outer: no border, 16px radius, `overflow: hidden`.
- Two columns, **locked via `table-layout: fixed` at 50% / 50%**.
- `<th>`: `sand-gray` background (NOT red), plum-black text, `info-th` type (9.5pt 700 +0.3px UPPERCASE Latin), padding `9px 14px`, left-aligned.
- `<td>`: white background, `table-body` (10pt 400), plum-black, padding `10px 14px`, top border `1px solid sand-gray`.
- No zebra.

### 4.8 User-quote blockquotes

- Background: `warm-wash`.
- No left bar (that is reserved for the deck + TL;DR red rail — blockquote is softer).
- Radius 14px. Padding `10px 16px`. Margin `10px 0`.
- Body: `quote` (10.5pt italic 400 plum-black, line-height 1.55).
- Attribution dash-em line: rendered olive-gray, 8.5pt weight 600, letter-spacing +0.2px.
- Multiple `<p>` inside a single blockquote → each paragraph separated by 6px gap.

### 4.9 Images & captions

- Images go **flush to the card's content edges**. No mat, no padding, no inset. The card's own paper surface provides the ambient framing; an extra paper-colored mat would be invisible anyway and only pushes the photo inward, breaking alignment with the tables above it.
- Implementation: `img { width: 100%; padding: 0; border-radius: 14px; display: block; margin: 12px 0 2px; }`.
- **The photo's left and right edges must line up pixel-for-pixel with the detail table and info tables in the same card.** Never inset with `max-width: 92%`, `margin: auto`, or a same-colored `padding` mat — that breaks the vertical edge the reader is scanning against.
- A gentle 14px corner radius keeps the photo feeling pin-like without adding a frame.
- Caption: the `<p>` that contains only `<em>…</em>` (python-markdown renders `*caption (来源：X)*` this way).
  - `caption` type: 8.5pt italic weight 500, olive-gray, letter-spacing +0.1px, centered, full-width within the card content, margin-top 4px, line-height 1.4.
  - No top border rule on the caption (the mat is doing the framing).

### 4.10 简讯 table (brief section)

- Wrapper: `<div class="brief-section">` with `fog` background, 20px radius, padding `14px 18px`.
- `<thead>` hidden (section name carries on the h2 above).
- Rows alternate: odd rows `paper`, even rows `warm-light`. Gentle zebra tied to Pinterest's sand/warm-light cycle.
- Each row: 12px radius, padding `8px 14px`. No border.
- Left column (28% width): `brief-name` (11pt 700 -0.1px), plum-black.
- Right column: `brief-body` (9.5pt 400 1.5), plum-black.

### 4.11 编辑部判断

Plain prose section following a section h2 with red rail. No special wrapper. Bold sub-labels (`**趋势**`, `**项目动作**`, `**下周监控**`) render as `h4`-style inline bold (11pt 700), and lists flow below.

### 4.12 参考来源 (inverted footer)

- Wrapper: `.references-section`, `dark-warm` background, `paper` (white) text, 28px radius, padding `20px 24px`, margin-top 24px.
- Inner `h2`: plum-to-white — still carries the 4px `pin-red` left rail (red on dark-warm pops), text color `paper`, font-size 14pt, negative tracking retained.
- Inner `h3` (### 模型 / ### 产品): 10pt weight 700 UPPERCASE Latin + mixed CJK, `paper` color, margin-top 10px.
- `ul` / `li`: `reference` type (7.5pt 400), `paper` at 0.82 opacity. Compact: `li { margin-bottom: 2px; }`.
- Links: `paper` color, underline, hover shifts to `sand-gray`.

### 4.13 Horizontal rule `<hr>`

- 1px `sand-gray`, margin `16px 0`. Rarely used (sections live in cards; rules are not the primary separator).

### 4.14 Yellow highlight `<mark>` — scanner magnet

The second-most-powerful tool after the red deck rail. A **soft highlighter-yellow sweep** (`#fff2a8`, darkening to `#ffea7a` when combined with `<strong>`) applied to the single phrase that carries a card's thesis. Implemented as a background gradient so the highlight sits *behind* the glyphs like a real marker stroke, not as a rectangular block.

**When to use:**
- At most **1 phrase per card**, occasionally 2 in the deck.
- Only on phrases that *change the reader's mental model* — not on numbers, not on product names, not on "nice-to-know" facts (those are already bold).
- In the deck (`## 本周结论`): highlight the one sentence clause that states the thesis.
- In the TL;DR row (`总结`): highlight the one clause that answers "why should I care this week".
- In `编辑部判断`: highlight each of the 2–3 **项目动作** action-phrases that will actually change behavior.

**When NOT to use:**
- Do not highlight product names, company names, or raw numbers. Use `<strong>` for those.
- Do not highlight entire sentences — highlight the clause, 6–20 characters ideally, up to ~30.
- Do not stack two highlights in the same paragraph (one drowns the other).
- Never use in a table's label column, in captions, in references, or in brief rows.

**Markdown authoring:** write literal `<mark>…</mark>` inside the markdown source. Combine with bold by nesting: `**<mark>做创作链路 skill 的窗口正在缩小</mark>**`.

**Rule of thumb:** if you remove every highlight and the reader can still scan the page in 30 seconds and land on the week's thesis, the highlights are doing their job. If the page feels busy, you have too many — cut.

---

## 5. Layout Principles

### Page

- A4, margins `14mm 16mm 16mm 16mm`.
- Body `max-width: 820px`, centered.
- Page background: `canvas-warm` (`#faf9f5`). Every card sits on this.
- Horizontal card padding is always within the card, never on the body.

### Vertical rhythm

8px base unit (Pinterest matches).

| Between                                           | Gap        |
| ------------------------------------------------- | ---------- |
| Title card and first section h2                  | 20px       |
| Section h2 and first content                     | 12px       |
| Adjacent story cards inside a section            | 14px       |
| Story kicker pill and story h3 headline          | 8px        |
| Story h3 and first table                         | 10px       |
| Detail table and subsequent info tables          | 12px       |
| Image mat and its caption                         | 4px        |
| Section block and next section h2                | 22px       |

### Grid ratios (LOCKED — do not adjust per-issue)

Every table uses `table-layout: fixed` so the column widths below are enforced, not suggested. The 模块 column is intentionally narrow; labels like "核心定位" / "用户反馈" are short and do not need to fight the content column for space.

- **Detail table (模块 | 具体详情): 15% / 85%.** Applied to both the `<th>` and the `<td>` on every row, TL;DR row included. If a label ever wraps to two lines, the writer should shorten it — do not widen the column.
- **Info 2×2 table (官方声明 | 外部验证 …): 50% / 50%.**
- **简讯 table: 28% / 72%.**
- **References footer lists** are flat `<ul>` — no column mechanics.

### Border-radius scale (from Pinterest)

- `8px` — small mats (image mat padding, rare)
- `12px` — tiny inline pills, brief-table rows
- `14px` — kicker pill, blockquote
- `16px` — summary / info tables
- `18px` — image content (inside the 8px mat)
- `20px` — deck card, brief-section tray
- `24px` — story cards
- `28px` — title card, references footer
- `50%` — brand dot (10px red circle in the header)

No square corners on any container. The only square edges on the page are the fine 1px sand-gray row dividers inside tables.

### Scan path

Preserved from prior versions. Any reader who looks at ONLY these three surfaces must already know the week:

1. **Title card** — issue + theme
2. **本周结论 deck card** — 13pt weight 500 paragraphs with UPPERCASE labels
3. **TL;DR row** on every story — 12pt weight 700 plum text with the 4px Pinterest Red left rail

That red rail is the one chromatic cue. Everything else is warm neutrals.

---

## 6. Depth & Elevation

Pinterest is flat — depth comes from content and surface warmth, not from simulated light.

| Level | Treatment                                   | Use                                              |
| ----- | ------------------------------------------- | ------------------------------------------------ |
| 0     | No border, no shadow                        | Default — the warm canvas                        |
| 1     | Rounded white card on `canvas-warm`         | Story cards, title card, deck card               |
| 2     | Rounded `fog` wrapper                       | 简讯 tray                                        |
| 3     | 4px `pin-red` left rail (no bg)             | Section headers, deck card edge, TL;DR row edge  |
| 4     | Inverted `dark-warm` block with white text | References footer                                |

No `box-shadow` tokens. No `filter: blur`. No gradients. If an element needs to "lift", give it radius + a different warm surface.

---

## 7. Do's and Don'ts

### Do

- Use Pinterest Red (`#e60023`) for exactly three things: the header brand dot, the section-header left rail (4px), and the TL;DR row left rail (4px). Nothing else on the page is red.
- Use plum-black (`#211922`) for every primary text surface. Never pure black.
- Use warm neutrals only: `sand-gray`, `warm-light`, `fog`, `canvas-warm`. Never cool steel.
- Round every container: 14/16/20/24/28px per the scale. Square containers are off-brand.
- Wrap every image in an 8px white "mat" with 18px inside radius.
- Render kickers as **sand-filled pills**, not UPPERCASE black text on white. The warmth is the identity.
- Use `tabular-nums` on every stat surface.
- Keep the references footer dark (the one inversion on the page).

### Don't

- Don't use cool gray / steel hexes. No `#1e293b`, no `#64748b`, no `#cbd5e1`.
- Don't use pure black (`#000000`) for body text.
- Don't use pill-rounded buttons (`border-radius: 999px`) except inside tiny text pills (`BREAKING`, `LIVE`). Our kicker is 14px radius — rounded, not full pill.
- Don't add `box-shadow`.
- Don't introduce a second accent color. Amber, green, purple — all banned in chrome.
- Don't mix font families. Inter (Pin Sans substitute) is the one family.
- Don't make the kicker UPPERCASE without the sand pill surface. Without the warm fill, the mono-uppercase kicker reads as WIRED, not Pinterest.
- Don't fill the full section-header bar black. Pinterest uses a 4px red rail, not a full ribbon.

---

## 8. Responsive Behavior

Print (A4) is primary. Screen (HTML preview) is secondary but must remain readable.

### Print

- `@page { size: A4; margin: 14mm 16mm 16mm 16mm; }`
- `body { font-size: 10.5pt; background: canvas-warm; }`
- `page-break-after: avoid` on h2, h3, the kicker pill, the deck label.
- `page-break-inside: avoid` on each `.story` card, `.deck`, `.references-section`, detail tables, info tables.
- Every element prints in its warm color — no need for a separate print stylesheet.

### Screen ≥ 900px

- Max content width 820px. Centered on canvas.
- Inter loaded via Google Fonts `<link>`. System fallback is acceptable offline.

### Screen < 900px

- Horizontal padding shrinks to 14px.
- h1 hero scales to 26pt; h3 entry to 15pt.
- Story cards drop to 18px padding.
- Long URLs force tables to `overflow-x: auto`.

No hamburger, no dark mode toggle — this is a document.

---

## 9. Agent Prompt Guide

### Quick color reference

```
pin-red       #e60023   ONLY for: brand dot, section h2 rail, TL;DR rail, link hover
plum-black    #211922   all primary text (h1, h2, h3, body, tables, TL;DR)
olive-gray    #62625b   captions, source attributions
warm-silver   #91918c   disabled / muted (rare)
sand-gray     #e5e5e0   kicker pill bg, TL;DR bg, detail-table label column, hairlines
warm-light    #e0e0d9   brief-table zebra, circle avatars (if any)
fog           #f6f6f3   quiet wrappers (brief tray)
warm-wash     hsla(60,20%,98%,0.5)   user-quote blockquote bg
canvas-warm   #faf9f5   body background — the entire page lives on this
paper         #ffffff   cards, image mat
dark-warm     #33332e   references footer (inverted) only
link-blue     #2b48d4   default link text (Pinterest keeps blue for readability)
```

### Font stack shortcut

```css
font-family: "Pin Sans", "Inter", -apple-system, system-ui, "Segoe UI",
             Roboto, "PingFang SC", "Microsoft YaHei",
             "Source Han Sans SC", "ヒラギノ角ゴ Pro W3", "メイリオ", Meiryo,
             "Helvetica Neue", Arial, sans-serif;
font-variant-numeric: tabular-nums;
```

One family. No fallback to a serif or mono — if Inter fails to load, system sans takes over cleanly.

### Ready-to-use prompts

1. **"Render the title card."** White `paper` background, 28px radius, padding `22px 26px` on `canvas-warm`. 10px `pin-red` circle left-of-headline. h1 at 32pt weight 700 plum-black -1.2px tracking. Subtitle below in olive-gray 10pt weight 500, two stacked lines.
2. **"Render a section h2."** Plum-black text at 20pt weight 700 -0.8px tracking. 4px `pin-red` `border-left` with 12px `padding-left`. No background, no ribbon. Margin `24px 0 12px`.
3. **"Render the 本周结论 deck."** White card, 20px radius, 4px `pin-red` left border, padding `18px 22px`. Each inner paragraph: UPPERCASE label (10pt 700 +0.3px plum-black) on its own line, body at 13pt weight 500 plum-black line-height 1.55.
4. **"Render a story card."** `<div class="story">`, white `paper` bg, 24px radius, padding `20px 22px 14px` on `canvas-warm`. No border, no shadow. Kicker pill inside: sand-gray bg, plum text, 14px radius, padding `3px 10px`, 9pt weight 600 +0.4px, content `M1 · MODEL`. Headline h3: 17pt weight 700 -0.4px, plum-black. 8px gap between pill and h3.
5. **"Render the TL;DR row."** First row of `.summary-row-emphasis`: right cell sand-gray bg with 4px `pin-red` left border, plum text at 12pt weight 700 padding `14px 16px`. Left cell sand-gray bg, UPPERCASE 9pt 700 +0.6px plum `TL;DR` label.
6. **"Render the references footer."** `dark-warm` bg (#33332e), 28px radius, padding `20px 24px`, margin-top 24px. All text `paper` white. Inner h2 keeps its `pin-red` rail; inner h3s are 10pt 700 UPPERCASE white. List items 7.5pt 400 at 0.82 opacity.

### Adding a new element

1. Confirm the color exists in §2. Almost certainly yes. If not, do not add.
2. Confirm the type level exists in §3. Almost certainly yes.
3. If a new class is needed, declare it here in §4 first, then implement in CSS.

### Reviewing a PR

- Corners: any `border-radius: 0` on a rectangle? Reject (except tiny table row dividers, which are 1px lines not rectangles).
- Red usage: red appears anywhere other than brand dot / section rail / TL;DR rail / link hover? Reject.
- Text color: `#000000` or cool gray anywhere? Reject — use plum-black.
- Fonts: any serif or mono? Reject — Inter only.
- Kickers: every story has a sand-pill kicker (`M1 · MODEL` etc.)? If no, reject.
- Image mat: every `<img>` has the 8px white mat treatment? If no, reject.
- Hierarchy: can a reader scan title → deck card → TL;DR rows and get the week? If no, reject.

---

## Change log

- **v3 (2026-04-19):** switched the system to Pinterest per `npx getdesign@latest add pinterest`. Warm canvas + Pinterest Red + plum-black + Pin Sans (Inter substitute) + generous rounding + sand-pill kickers + 8px white image mats + dark-warm references footer. Dropped WIRED's serif display + mono uppercase + hairline rules entirely. Kept the scan-path contract and the "bigger+bolder TL;DR" rule — now signaled by a 4px Pinterest Red rail on a sand-gray surface at 12pt weight 700.
- **v2 (2026-04-19):** WIRED broadsheet system. Deprecated by v3.
- **v1 (2026-04-19):** initial editorial system (ink + brand + amber). Deprecated by v2.
