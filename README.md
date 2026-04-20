# Awsome AI Newsletter

Multi-agent pipeline that produces a **weekly AI industry briefing**: collect → filter → normalize → verify → score → triage → write → QA → publish. Output is `newsletter_draft.md` plus a print-ready HTML file (save as PDF from the browser).

**Not a news aggregator** — it enforces editorial structure: official claims vs. third-party validation vs. community voice vs. explicit judgment, with Reddit quotes (translated to Chinese) and real product screenshots for main entries.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Contents

- [Overview](#overview)
- [Pipeline](#pipeline)
- [Repo layout](#repo-layout)
- [Quick start](#quick-start)
- [HTML and PDF](#html-and-pdf)
- [Design](#design)
- [Customize](#customize)
- [中文](#中文)
- [License](#license)

## Overview

| | |
|---|---|
| **Audience** | Teams shipping AI-native creative / workflow / skill-system products who want a long-form (~15–30 page) internal briefing. |
| **Stack** | **Claude Code** uses [`.claude/agents/`](.claude/agents/). **Cursor** can run the same flow via newsletter orchestration agents. Spec lives in **`skill/SKILL.md`**. |
| **Python** | Only needed to **render HTML** from markdown (`tools/convert_to_pdf.py`). Use Python 3.9+ and `pip install -r requirements.txt`. |

**Version control:** `*.html` and `*.pdf` are **gitignored** — regenerate them from `newsletter_draft.md`. Per-run markdown, JSON artifacts, and `newsletter_runs/.../images/` are tracked.

**Why many agents:** One mega-prompt drifts (skips verification, mixes scoring with prose). Separate agents keep prompts small, allow parallel collection in step 1, and write **auditable** JSON between steps. Change rubrics in `rubric.json`; change voice in `writer.md` without rewriting the whole SOP.

## Pipeline

```
orchestrator     → run_header.md
collector        → raw_*_records.json        (models ‖ products)
filter           → filtered_records.json
normalizer       → normalized_records.json
verifier         → verified_records.json     (sources + Reddit quotes)
scorer           → scored_records.json
triage-editor    → triage_decisions.json
writer           → newsletter_draft.md
qa-reviewer      → PASS or REVISE (writer may loop)
publisher        → ai_newsletter_weekly_YYYY-MM-DD.html
```

| Step | Role |
|------|------|
| 0 | Scope lock, dispatch, QA loop |
| 1 | Tiered collection (official → signals → newsletters → community) |
| 2–3 | Gates + schema-normal records |
| 4 | Cross-check claims; harvest Reddit quotes |
| 5–6 | Rubric scores; main / brief / drop + diversity rules |
| 7–8 | Draft from `output_template.md`; editorial checklist |
| 9 | Fetch images; run `convert_to_pdf.py` |

## Repo layout

```
.claude/agents/          # Agent prompts
skill/
  SKILL.md               # Canonical SOP (start here)
  DESIGN.md              # Visual system (v3)
  output_template.md     # Writer skeleton
  rubric.json            # Gates + scoring
  record_schemas.json    # JSON between steps
  RUNBOOK.md, INSTALL.md, HEARTBEAT.sample.md
tools/convert_to_pdf.py  # Markdown → HTML
newsletter_runs/YYYY-MM-DD/   # Drafts, JSON artifacts, images/
requirements.txt
LICENSE
```

## Quick start

1. Install the renderer dependency:

   ```bash
   pip install -r requirements.txt
   ```

2. **Generate an issue** in Claude Code (or your agent UI), for example:

   - “Run the newsletter SOP for this week.”
   - Or invoke `@newsletter-orchestrator` with the same intent.

3. Find outputs under `newsletter_runs/<date>/` (draft markdown, JSON chain, final HTML after publish step).

## HTML and PDF

From a dated run folder:

```bash
cd newsletter_runs/YYYY-MM-DD
python ../../tools/convert_to_pdf.py
```

Open `ai_newsletter_weekly_YYYY-MM-DD.html` in a browser → **Print → Save as PDF** (A4 / Letter–friendly styles).

## Design

All visual tokens are defined in **`skill/DESIGN.md`**. **`tools/convert_to_pdf.py`** implements that spec — add colors or sizes in `DESIGN.md` first, then the script.

## Customize

| Goal | Edit |
|------|------|
| Sources | `skill/SKILL.md` (collection) + `.claude/agents/collector.md` |
| Gates / scores | `skill/rubric.json` |
| Record shapes | `skill/record_schemas.json` + `normalizer.md` |
| Copy structure | `skill/output_template.md` + `writer.md` |
| QA rules | `skill/SKILL.md` step 8 + `qa-reviewer.md` |
| Look & feel | `skill/DESIGN.md` + `tools/convert_to_pdf.py` |

**Possible next steps:** daily `HEARTBEAT` accumulation; ops/cost module; stronger Reddit/X automation; CI fixture run for schema drift.

## 中文

**Awsome AI Newsletter** 是一套多智能体周报流水线：按 `skill/SKILL.md` 完成收集、过滤、验证（含 Reddit 原声）、评分、分流、撰写与 QA，最后输出可打印 HTML/PDF。主条目强调「官方 / 外部验证 / 社区 / 编辑判断」分层与 Reddit 译文。

运行：在 Claude Code 中说「按 newsletter SOP 跑本周周报」或使用 `@newsletter-orchestrator`。本地重渲 HTML：进入 `newsletter_runs/YYYY-MM-DD` 后执行 `python ../../tools/convert_to_pdf.py`。

细则见 `skill/SKILL.md`，视觉见 `skill/DESIGN.md`，评分见 `skill/rubric.json`。

## License

[MIT](LICENSE).
