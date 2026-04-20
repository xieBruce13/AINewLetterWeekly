"""
Newsletter Markdown -> Publication-Ready HTML converter.

Implements the Pinterest-adapted editorial design system defined in
`skill/DESIGN.md` (v3). All tokens (colors, type scale, spacing) come from
that file; this script is the authoritative renderer but not the authoritative
design source. Do not introduce hexes or sizes that are not declared in
DESIGN.md.

Usage (run from inside a dated newsletter_runs folder):
    py ../../tools/convert_to_pdf.py

Output: ai_newsletter_weekly_YYYY-MM-DD.html. For a PDF that matches the
on-screen layout, use ../../tools/render_pdf.py (Chromium + screen media);
browser Ctrl+P may differ unless background graphics are enabled.
"""

import markdown
import base64
import os
import re
import sys
from pathlib import Path
from datetime import date

INPUT = "newsletter_draft.md"

# Derive the issue date from the enclosing folder name (e.g. `2026-04-16/`)
# so that re-running this script for an older issue doesn't overwrite with
# today's date. Falls back to today if the folder isn't dated.
_folder_name = os.path.basename(os.getcwd())
if re.fullmatch(r"\d{4}-\d{2}-\d{2}", _folder_name):
    DATE_STR = _folder_name
else:
    DATE_STR = date.today().strftime("%Y-%m-%d")
OUTPUT_HTML = f"ai_newsletter_weekly_{DATE_STR}.html"

# Kicker labels appended after the numeric prefix in each h3 / spotlight h2.
# e.g. "M1｜Opus 4.7" → kicker pill "M1 · MODEL"; "P2｜Codex" → "P2 · PRODUCT"
KICKER_SUFFIX = {
    "M": "MODEL",
    "P": "PRODUCT",
    "S": "STARTUP",
}

DECK_LABEL_SUFFIX = {
    "核心判断": "EDITOR'S CALL",
    "编辑部判断": "EDITOR'S NOTE",
}

GOOGLE_FONTS = (
    'https://fonts.googleapis.com/css2'
    '?family=Inter:wght@400;500;600;700;800'
    '&display=swap'
)

CSS = r"""
/* ==================================================================
 * AI Weekly Briefing — implements skill/DESIGN.md v3 (Pinterest-adapted)
 * Warm canvas + Pinterest Red + plum-black + Pin Sans (Inter substitute).
 * Generous rounding, sand-pill kickers, 8px white image mats,
 * dark-warm references footer. No shadows, no cool grays.
 * ================================================================== */

:root {
    /* ---- base tokens ---- */
    --pin-red:      #e60023;
    --plum-black:   #211922;
    --olive-gray:   #62625b;
    --warm-silver:  #91918c;
    --sand-gray:    #e5e5e0;
    --warm-light:   #e0e0d9;
    --fog:          #f6f6f3;
    --warm-wash:    hsla(60, 20%, 98%, 0.55);
    --canvas-warm:  #faf9f5;
    --paper:        #ffffff;
    --dark-warm:    #33332e;
    --link-blue:    #2b48d4;

    /* ---- semantic ---- */
    --sema-text-primary:    var(--plum-black);
    --sema-text-secondary:  var(--olive-gray);
    --sema-text-muted:      var(--warm-silver);
    --sema-text-inverse:    var(--paper);
    --sema-accent:          var(--pin-red);
    --sema-surface-page:    var(--canvas-warm);
    --sema-surface-card:    var(--paper);
    --sema-surface-wrap:    var(--fog);
    --sema-surface-sand:    var(--sand-gray);
    --sema-surface-wash:    var(--warm-wash);
    --sema-surface-inverse: var(--dark-warm);
    --sema-border-hairline: var(--sand-gray);

    /* ---- type ---- */
    --font-sans: "Pin Sans", "Inter", -apple-system, system-ui, "Segoe UI",
                 Roboto, "PingFang SC", "Microsoft YaHei",
                 "Source Han Sans SC", "ヒラギノ角ゴ Pro W3",
                 "メイリオ", Meiryo, "Helvetica Neue", Helvetica, Arial, sans-serif;
}

@page { size: A4; margin: 14mm 16mm 16mm 16mm; }

/* Preserve card / table / footer backgrounds when using 打印 or Save as PDF.
 * Browsers default to stripping backgrounds unless this is set. */
html {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
}

@media print {
    html, body {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
    }
    body {
        font-size: 10.5pt !important;
        background: var(--sema-surface-page) !important;
        /* Match on-screen column width so the column isn’t full-bleed on paper. */
        max-width: 820px !important;
        margin-left: auto !important;
        margin-right: auto !important;
        padding: 22px 4px 4px !important;
    }
    h2, h3, .story-kicker, .deck-label { page-break-after: avoid; }
    .story, .deck, .references-section, table, blockquote, .title-card {
        page-break-inside: avoid;
    }
    * { box-shadow: none !important; }
}

* { box-sizing: border-box; margin: 0; padding: 0; }

html { background: var(--sema-surface-page); }

body {
    font-family: var(--font-sans);
    font-size: 10.5pt;
    line-height: 1.6;
    color: var(--sema-text-primary);
    max-width: 820px;
    margin: 0 auto;
    padding: 22px 4px 4px;
    background: var(--sema-surface-page);
    font-feature-settings: "ss01", "cv01";
}

strong, table, .deck, .summary-row-emphasis, .info-table, .stat {
    font-variant-numeric: tabular-nums;
}

p { margin: 6px 0; }
strong { color: var(--sema-text-primary); font-weight: 700; }
em { color: var(--sema-text-primary); font-style: italic; }

/* ---------- <mark> in source: no yellow wash (HTML / print / PDF). */
mark {
    background: none;
    color: inherit;
    padding: 0;
    border-radius: 0;
    font-weight: inherit;
}
strong mark, mark strong {
    background: none;
    color: inherit;
    font-weight: 700;
}
a {
    color: var(--link-blue);
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 2px;
}
a:hover { color: var(--sema-accent); }

ul, ol { padding-left: 20px; margin: 6px 0; }
li { margin-bottom: 5px; line-height: 1.55; }

hr {
    border: none;
    border-top: 1px solid var(--sema-border-hairline);
    margin: 16px 0;
}

/* ---------- Title card ---------- */

.title-card {
    background: var(--sema-surface-card);
    border-radius: 28px;
    padding: 22px 26px 20px;
    margin: 0 0 20px;
}
.title-card .brand-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--sema-accent);
    margin-right: 10px;
    vertical-align: middle;
    position: relative;
    top: -4px;
}
h1 {
    display: inline;
    font-size: 32pt;
    font-weight: 700;
    color: var(--sema-text-primary);
    line-height: 1.05;
    letter-spacing: -1.2px;
    margin: 0;
}
.header-sub {
    margin: 12px 0 0;
    font-size: 10pt;
    font-weight: 500;
    color: var(--sema-text-secondary);
    line-height: 1.4;
    letter-spacing: 0.1px;
}
.header-sub p { margin: 0; }
.header-sub strong { color: var(--sema-text-secondary); font-weight: 600; }

/* ---------- Section headers (h2) ---------- */

h2 {
    font-size: 20pt;
    font-weight: 700;
    color: var(--sema-text-primary);
    line-height: 1.15;
    letter-spacing: -0.8px;
    padding: 2px 0 2px 12px;
    margin: 24px 0 12px;
    border-left: 4px solid var(--sema-accent);
}

/* ---------- Story card (h3 entry + spotlight) ---------- */

.story {
    background: var(--sema-surface-card);
    border-radius: 24px;
    padding: 20px 22px 14px;
    margin: 0 0 14px;
}

.story-kicker {
    display: inline-block;
    background: var(--sema-surface-sand);
    color: var(--sema-text-primary);
    font-size: 9pt;
    font-weight: 600;
    letter-spacing: 0.4px;
    padding: 3px 11px;
    border-radius: 14px;
    margin: 0 0 8px;
    line-height: 1.2;
    text-transform: uppercase;
}

h3 {
    font-size: 17pt;
    font-weight: 700;
    color: var(--sema-text-primary);
    line-height: 1.2;
    letter-spacing: -0.4px;
    margin: 0 0 10px;
}

h4 {
    font-size: 11pt;
    font-weight: 700;
    color: var(--sema-text-primary);
    margin: 10px 0 4px;
}

/* ---------- 本周结论 deck card — #1 highlight surface ---------- */

.deck {
    background: var(--sema-surface-card);
    border-radius: 20px;
    border-left: 6px solid var(--sema-accent);
    padding: 20px 24px;
    margin: 0 0 20px;
}
.deck .deck-block {
    margin: 0 0 14px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--sema-border-hairline);
}
.deck .deck-block:last-child {
    margin-bottom: 0;
    padding-bottom: 0;
    border-bottom: none;
}
.deck .deck-label {
    display: block;
    font-size: 10pt;
    font-weight: 700;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    color: var(--sema-accent);
    margin-bottom: 6px;
    line-height: 1.3;
}
.deck .deck-body {
    display: block;
    font-size: 14pt;
    font-weight: 500;
    line-height: 1.55;
    letter-spacing: -0.1px;
    color: var(--sema-text-primary);
}
.deck .deck-body strong {
    font-weight: 700;
    color: var(--sema-text-primary);
}

/* ---------- User-quote blockquotes ---------- */

blockquote {
    background: var(--sema-surface-wash);
    border: none;
    border-radius: 14px;
    margin: 10px 0;
    padding: 10px 16px;
    font-size: 10.5pt;
    font-style: italic;
    line-height: 1.55;
    color: var(--sema-text-primary);
}
blockquote p { margin: 3px 0; }
blockquote strong {
    color: var(--sema-text-primary);
    font-weight: 700;
    font-style: normal;
}

/* ---------- Tables (shared) ---------- */

table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    margin: 10px 0;
    font-size: 10pt;
    line-height: 1.55;
    table-layout: fixed;
    border-radius: 16px;
    overflow: hidden;
    background: var(--sema-surface-card);
    border: 1px solid var(--sema-border-hairline);
}
th {
    background: var(--sema-surface-sand);
    color: var(--sema-text-primary);
    padding: 9px 14px;
    text-align: left;
    font-size: 9.5pt;
    font-weight: 700;
    letter-spacing: 0.3px;
    text-transform: uppercase;
}
td {
    padding: 10px 14px;
    border-top: 1px solid var(--sema-border-hairline);
    vertical-align: top;
    color: var(--sema-text-primary);
    word-wrap: break-word;
    overflow-wrap: break-word;
}
tr:first-child td { border-top: none; }
thead + tbody tr:first-child td { border-top: 1px solid var(--sema-border-hairline); }

/* ---------- Detail table (模块 | 具体详情) — fixed 15 / 85 columns ---------- */

table.summary-row-emphasis {
    border: none;
    table-layout: fixed;
}
table.summary-row-emphasis col.label-col,
table.summary-row-emphasis th:first-child,
table.summary-row-emphasis td:first-child { width: 15%; }
table.summary-row-emphasis col.content-col,
table.summary-row-emphasis th:last-child,
table.summary-row-emphasis td:last-child { width: 85%; }

table.summary-row-emphasis td:first-child {
    background: var(--sema-surface-sand);
    color: var(--sema-text-primary);
    font-size: 9pt;
    font-weight: 700;
    letter-spacing: 0.3px;
    text-transform: uppercase;
    padding: 10px 12px;
    vertical-align: top;
}
table.summary-row-emphasis td:not(:first-child) {
    background: var(--sema-surface-card);
    padding: 10px 14px;
}

/* TL;DR (first row) — #2 highlight surface.
 * Sand bg + 6px pin-red left rail on the content cell, red label.
 * Red is the ONE chromatic cue on the page. */
table.summary-row-emphasis tr:first-child td {
    background: var(--sema-surface-sand) !important;
    border-top: none;
}
table.summary-row-emphasis tr:first-child td:first-child {
    color: var(--sema-accent);
}
table.summary-row-emphasis tr:first-child td:first-child::after {
    content: " · TL;DR";
    color: var(--sema-accent);
    font-weight: 700;
}
table.summary-row-emphasis tr:first-child td:last-child {
    font-size: 13pt;
    font-weight: 700;
    letter-spacing: -0.1px;
    line-height: 1.5;
    padding: 16px 18px;
    border-left: 6px solid var(--sema-accent);
}

/* ---------- Info 2×2 tables (官方声明 | 外部验证, 社区反馈 | 编辑判断) ---------- */

table.info-table {
    border: none;
    table-layout: fixed;
}
table.info-table th:first-child,
table.info-table td:first-child { width: 50%; }
table.info-table th:last-child,
table.info-table td:last-child  { width: 50%; }
table.info-table th {
    background: var(--sema-surface-sand);
    color: var(--sema-text-primary);
    font-size: 9.5pt;
    font-weight: 700;
    letter-spacing: 0.3px;
    text-transform: uppercase;
    padding: 9px 14px;
}
table.info-table td {
    background: var(--sema-surface-card);
    font-size: 10pt;
    color: var(--sema-text-primary);
    padding: 10px 14px;
    border-top: 1px solid var(--sema-border-hairline);
}

/* ---------- Brief (简讯) ---------- */

.brief-section {
    background: var(--sema-surface-wrap);
    border-radius: 20px;
    padding: 14px 18px;
    margin: 6px 0 14px;
}
.brief-section table {
    border: none;
    border-radius: 0;
    background: transparent;
    margin: 0;
}
.brief-section thead { display: none; }
.brief-section tbody tr:nth-child(odd) td  { background: var(--sema-surface-card); }
.brief-section tbody tr:nth-child(even) td { background: var(--warm-light); }
.brief-section td {
    padding: 9px 14px;
    border: none;
    font-size: 9.5pt;
    line-height: 1.5;
    color: var(--sema-text-primary);
}
.brief-section tr td:first-child { border-top-left-radius: 12px; border-bottom-left-radius: 12px; }
.brief-section tr td:last-child  { border-top-right-radius: 12px; border-bottom-right-radius: 12px; }
.brief-section table { table-layout: fixed; }
.brief-section th:first-child,
.brief-section td:first-child { width: 28%; }
.brief-section th:last-child,
.brief-section td:last-child  { width: 72%; }
.brief-section td:first-child {
    font-size: 11pt;
    font-weight: 700;
    letter-spacing: -0.1px;
}

/* ---------- References (inverted dark-warm footer) ---------- */

.references-section {
    background: var(--sema-surface-inverse);
    color: var(--sema-text-inverse);
    padding: 20px 24px 22px;
    margin: 24px 0 0;
    border-radius: 28px;
    font-size: 7.5pt;
    line-height: 1.4;
}
.references-section p { color: rgba(255,255,255,0.82); }
.references-section h2 {
    font-size: 14pt;
    color: var(--sema-text-inverse);
    margin: 0 0 10px;
    border-left: 4px solid var(--sema-accent);
    padding: 2px 0 2px 12px;
    letter-spacing: -0.5px;
}
.references-section h3 {
    font-size: 10pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    color: var(--sema-text-inverse);
    margin-top: 10px;
    margin-bottom: 4px;
    line-height: 1.2;
}
.references-section h3:first-of-type { margin-top: 2px; }
.references-section ul {
    padding-left: 16px;
    color: rgba(255,255,255,0.82);
}
.references-section li {
    margin-bottom: 2px;
    line-height: 1.35;
    font-size: 7.5pt;
}
.references-section a { color: var(--sema-text-inverse); }
.references-section a:hover { color: var(--sand-gray); }
/* If any .story wrappers slipped in (rare), flatten them against the dark
 * footer so the inverted block stays uninterrupted. */
.references-section .story {
    background: transparent;
    border-radius: 0;
    padding: 0;
    margin: 10px 0 0;
}
.references-section .story-kicker { display: none; }

/* ---------- Images & captions ----------
 * Images span the full card content width so their left/right edges
 * align pixel-for-pixel with every table in the same card. No mat/
 * padding — the original 8px padding used the same paper color as the
 * card surface, so it rendered as invisible whitespace and made the
 * visible photo 16px narrower than the table. Clean flush alignment
 * beats an invisible frame. */

img {
    width: 100%;
    max-width: 100%;
    height: auto;
    display: block;
    margin: 12px 0 2px;
    padding: 0;
    border-radius: 14px;
}
p > em:only-child {
    display: block;
    text-align: center;
    font-size: 8.5pt;
    font-weight: 500;
    font-style: italic;
    color: var(--sema-text-secondary);
    line-height: 1.4;
    letter-spacing: 0.1px;
    margin: 4px 0 12px;
}

/* ---------- Code ---------- */

code {
    background: var(--sema-surface-sand);
    padding: 1px 6px;
    border-radius: 6px;
    font-family: "JetBrains Mono", "SF Mono", Menlo, ui-monospace, monospace;
    font-size: 9pt;
    color: var(--sema-text-primary);
}
pre {
    background: var(--sema-surface-inverse);
    color: var(--sema-text-inverse);
    padding: 12px 16px;
    border-radius: 14px;
    font-family: "JetBrains Mono", "SF Mono", Menlo, ui-monospace, monospace;
    font-size: 9pt;
    line-height: 1.45;
    overflow-x: auto;
    margin: 10px 0;
}
pre code { background: transparent; padding: 0; color: var(--sema-text-inverse); }
"""


def embed_image_as_base64(img_path: str) -> str:
    if not os.path.exists(img_path):
        return img_path
    ext = Path(img_path).suffix.lower().lstrip(".")
    mime = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
            "gif": "image/gif", "webp": "image/webp"}.get(ext, "image/png")
    with open(img_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    return f"data:{mime};base64,{b64}"


def process_images_in_html(html: str) -> str:
    def replace_src(match):
        full_tag = match.group(0)
        src = match.group(1)
        if src.startswith(("http://", "https://", "data:")):
            return full_tag
        local_path = src
        if not os.path.isabs(local_path):
            local_path = os.path.join(os.path.dirname(INPUT) or ".", local_path)
        if os.path.exists(local_path):
            b64_uri = embed_image_as_base64(local_path)
            return full_tag.replace(src, b64_uri)
        return full_tag
    return re.sub(r'<img[^>]+src="([^"]+)"', replace_src, html)


def _build_kicker_from_prefix(prefix: str) -> str:
    """Given an entry prefix like 'M1', 'P2', 'S1', return the pill label.

    'M1' → 'M1 · MODEL', 'P3' → 'P3 · PRODUCT'.
    """
    m = re.match(r'^([A-Z]+)\s*(\d+)$', prefix.strip())
    if not m:
        return prefix.strip()
    letter, number = m.group(1), m.group(2)
    suffix = KICKER_SUFFIX.get(letter[0])
    label = f"{letter}{number}"
    return f"{label} · {suffix}" if suffix else label


def split_h3_kicker(h3_line: str) -> str:
    """Extract the `M1｜` / `P2｜` prefix from an h3 and emit a kicker pill
    followed by a clean h3 containing only the headline portion."""
    m = re.match(
        r'^(<h3[^>]*>)\s*([MPSmps]\s*\d+)\s*[｜|]\s*(.+?)\s*(</h3>)\s*$',
        h3_line
    )
    if not m:
        return h3_line
    open_tag, prefix, headline, close_tag = m.groups()
    kicker = _build_kicker_from_prefix(prefix.upper())
    return (f'<span class="story-kicker">{kicker}</span>'
            f'{open_tag}{headline}{close_tag}')


def _strip_h2_to_headline(h2_line: str) -> tuple[str, str]:
    """Return (kicker_text, clean_h3_line) for the spotlight h2.

    `## 本期初创聚焦｜rtrvr.ai — AI Subroutines` becomes:
      kicker: "STARTUP · SPOTLIGHT"
      headline: `<h3>rtrvr.ai — AI Subroutines</h3>`
    """
    inner = re.sub(r'</?h2[^>]*>', '', h2_line).strip()
    parts = re.split(r'[｜|]', inner, maxsplit=1)
    headline = parts[1].strip() if len(parts) == 2 else inner
    kicker = "STARTUP · SPOTLIGHT"
    h3_line = f'<h3>{headline}</h3>'
    return kicker, h3_line


def transform_conclusion_blockquotes(block_html: str) -> str:
    """Inside a .deck wrapper, turn each blockquote-paragraph's leading
    <strong>…</strong> into a block-level .deck-label and wrap the remainder
    in a .deck-body span. Append an UPPERCASE Latin suffix for scanners."""
    def transform_p(match):
        inner = match.group(1)
        m = re.match(r'^\s*<strong[^>]*>(.+?)</strong>\s*[:：]?\s*(.*)$',
                     inner, flags=re.DOTALL)
        if not m:
            return f'<div class="deck-block"><span class="deck-body">{inner}</span></div>'
        label_text = m.group(1).strip().rstrip(':：').strip()
        body_text = m.group(2).strip()
        suffix = DECK_LABEL_SUFFIX.get(label_text)
        display_label = f"{label_text} · {suffix}" if suffix else label_text
        return (f'<div class="deck-block">'
                f'<span class="deck-label">{display_label}</span>'
                f'<span class="deck-body">{body_text}</span>'
                f'</div>')
    inside = re.sub(r'</?blockquote[^>]*>', '', block_html)
    return re.sub(r'<p[^>]*>(.*?)</p>', transform_p, inside, flags=re.DOTALL)


def wrap_structure(html: str) -> str:
    """Apply DESIGN.md §4 structure — Pinterest v3.

    Transformations:
      - Title block: h1 + its blockquote subtitle become a .title-card with
        a 10px red brand dot before h1 (handled in style_header_block).
      - `## 本周结论` → plain h2 (red rail), then blockquotes become a .deck
        card (red rail, white bg, serif-feel editor's verdict).
      - `## 模型模块` / `## 产品模块` → plain h2 (red rail). No tray.
      - Each h3 → .story card with an auto-split sand-pill kicker.
      - `## 本期初创聚焦｜X` → h2 "STARTUP · SPOTLIGHT" + .story card.
      - `## 简讯` → h2 + .brief-section wrapper (fog tray, zebra rows).
      - `## 参考来源` → h2 + .references-section inverted dark-warm footer.
      - First <table> inside a .story → .summary-row-emphasis.
      - Subsequent <table>s inside a .story → .info-table.
    """
    html = re.sub(r'<h3[^>]*>.*?</h3>', lambda m: split_h3_kicker(m.group(0)),
                  html)

    lines = html.split('\n')
    out = []
    in_story = False
    in_deck = False
    in_brief = False
    in_references = False  # once we hit `## 参考来源`, stop wrapping h3s as stories
    story_table_count = 0
    conclusion_capture = False
    conclusion_buffer = []

    def close_story():
        nonlocal in_story, story_table_count
        if in_story:
            out.append('</div>')
            in_story = False
            story_table_count = 0

    def close_deck():
        nonlocal in_deck, conclusion_capture, conclusion_buffer
        if in_deck:
            transformed = transform_conclusion_blockquotes('\n'.join(conclusion_buffer))
            out.append(transformed)
            out.append('</div>')
            in_deck = False
            conclusion_capture = False
            conclusion_buffer = []

    def close_brief():
        nonlocal in_brief
        if in_brief:
            out.append('</div>')
            in_brief = False

    def close_all():
        close_story()
        close_deck()
        close_brief()

    i = 0
    while i < len(lines):
        line = lines[i]

        is_h2 = bool(re.match(r'<h2[^>]*>', line))
        is_h3 = bool(re.match(r'<h3[^>]*>', line))
        has_kicker_then_h3 = bool(re.match(r'^<span class="story-kicker">', line))
        is_hr = line.strip() == '<hr />'

        if conclusion_capture and not (is_h2 or is_hr):
            conclusion_buffer.append(line)
            i += 1
            continue

        if is_h2:
            close_all()
            h2_text = re.sub(r'<[^>]+>', '', line)
            is_conclusion = '本周结论' in h2_text
            is_brief = '简讯' in h2_text
            is_startup = '初创聚焦' in h2_text
            is_refs = '参考来源' in h2_text

            if is_refs:
                in_references = True

            if is_startup:
                kicker, h3_line = _strip_h2_to_headline(line)
                out.append('<h2>本期初创聚焦 · STARTUP SPOTLIGHT</h2>')
                out.append('<div class="story">')
                out.append(f'<span class="story-kicker">{kicker}</span>')
                out.append(h3_line)
                in_story = True
                story_table_count = 0
            elif is_conclusion:
                out.append(line)
                out.append('<div class="deck">')
                in_deck = True
                conclusion_capture = True
            elif is_brief:
                out.append(line)
                out.append('<div class="brief-section">')
                in_brief = True
            else:
                out.append(line)

        elif has_kicker_then_h3:
            close_story()
            if in_references:
                # Inside the references footer, sub-headings render flat; no
                # story-card wrapping, no sand-pill kicker (drop the span).
                cleaned = re.sub(
                    r'^<span class="story-kicker">[^<]*</span>', '', line
                )
                out.append(cleaned)
            else:
                out.append('<div class="story">')
                out.append(line)
                in_story = True
                story_table_count = 0

        elif is_h3:
            close_story()
            if in_references:
                out.append(line)
            else:
                out.append('<div class="story">')
                out.append(line)
                in_story = True
                story_table_count = 0

        elif is_hr:
            close_all()
            # Suppress literal <hr /> if a section header follows — the red
            # rail on h2 is already the primary separator.
            j = i + 1
            while j < len(lines) and lines[j].strip() == '':
                j += 1
            if j < len(lines) and re.match(r'<h2[^>]*>', lines[j]):
                pass
            else:
                out.append(line)

        else:
            if in_story and '<table>' in line:
                story_table_count += 1
                if story_table_count == 1:
                    line = line.replace(
                        '<table>', '<table class="summary-row-emphasis">', 1
                    )
                else:
                    line = line.replace(
                        '<table>', '<table class="info-table">', 1
                    )
            out.append(line)

        i += 1

    close_all()
    return '\n'.join(out)


def style_header_block(html: str) -> str:
    """Title card (DESIGN.md §4.1): white card on warm canvas, 28px radius,
    red brand dot before the h1, olive-gray subtitle below.

    Anchor on the first <h1> and the blockquote IMMEDIATELY following it
    (optionally separated by whitespace). Any later blockquote stays as a
    user-quote wash card."""
    m = re.search(
        r'(<h1[^>]*>)(.*?)(</h1>)\s*(<blockquote>(.*?)</blockquote>)',
        html, flags=re.DOTALL
    )
    if not m:
        return html
    h1_open, h1_text, h1_close, _, bq_inner = m.groups()
    bq_inner = re.sub(r'</strong>\s*<strong[^>]*>', '</strong><br><strong>', bq_inner)
    new_h1 = (
        f'<div class="title-card">'
        f'{h1_open}<span class="brand-dot"></span>{h1_text}{h1_close}'
        f'<div class="header-sub">{bq_inner}</div>'
        f'</div>'
    )
    return html[:m.start()] + new_h1 + html[m.end():]


def wrap_references(html: str) -> str:
    """Wrap everything from `## 参考来源` onward in the dark-warm footer
    block (DESIGN.md §4.12)."""
    m = re.search(r'<h2[^>]*>[^<]*参考来源[^<]*</h2>', html)
    if m:
        html = (html[:m.start()] +
                '<div class="references-section">' +
                html[m.start():] +
                '</div>')
    return html


def main():
    if not os.path.exists(INPUT):
        print(f"ERROR: {INPUT} not found in current directory ({os.getcwd()})")
        print("Run this script from inside a newsletter_runs/YYYY-MM-DD/ folder.")
        sys.exit(1)

    with open(INPUT, encoding="utf-8") as f:
        md_text = f.read()

    html_body = markdown.markdown(
        md_text,
        extensions=["tables", "fenced_code", "toc", "smarty", "attr_list"],
    )

    html_body = process_images_in_html(html_body)
    html_body = wrap_structure(html_body)
    html_body = style_header_block(html_body)
    html_body = wrap_references(html_body)

    full_html = f"""<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="color-scheme" content="light">
<title>AI Weekly - {DATE_STR}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="{GOOGLE_FONTS}" rel="stylesheet">
<style>{CSS}</style>
</head>
<body>
{html_body}
</body>
</html>"""

    with open(OUTPUT_HTML, "w", encoding="utf-8") as f:
        f.write(full_html)

    print(f"Done: {OUTPUT_HTML}")


if __name__ == "__main__":
    main()
