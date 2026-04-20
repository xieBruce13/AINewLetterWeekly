# AI Weekly Newsletter — Multi-Agent Pipeline

**An editorial judgment system** for a weekly AI industry briefing: ten specialized agents run a fixed SOP from tiered collection through verification, scoring, triage, writing, QA, and publication-ready HTML (print-to-PDF). It is **not** a passive news feed — every main entry separates official claims, third-party validation, community voice, and explicit editorial take, with real Reddit quotes (translated to Chinese) and product screenshots where required.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## Contents

- [Who it is for](#who-it-is-for)
- [What you get](#what-you-get)
- [Why multi-agent](#why-multi-agent)
- [Pipeline overview](#pipeline-overview)
- [Repository layout](#repository-layout)
- [Quick start](#quick-start)
- [Regenerate HTML / PDF](#regenerate-html--pdf)
- [Design system](#design-system)
- [Extending the system](#extending-the-system)
- [中文简介](#中文简介)
- [License](#license)

---

## Who it is for

Teams building **AI-native creative, workflow, or skill-system products** who want a **15–30 page weekly briefing** with structured evidence, rubric-backed scoring, and a consistent visual system — suitable for internal strategy reads and `Ctrl+P` archival PDFs.

---

## What you get

| Layer | What happens |
|--------|----------------|
| **Collection** | Tiered sources: official announcements → technical signals (benchmarks, leaderboards) → newsletters → community (Reddit / HN / X) |
| **Quality gates** | Filter → normalize → **verify** official claims against primary sources |
| **Editorial** | Score with explicit per-dimension justifications; triage into `main` / `brief` / `drop` with diversity + startup rules |
| **Output** | `newsletter_draft.md` → styled **`ai_newsletter_weekly_YYYY-MM-DD.html`** (Pinterest-inspired design in `skill/DESIGN.md`) |

**Note on Git:** Generated `*.html` / `*.pdf` files are listed in `.gitignore` — they are meant to be reproduced from `newsletter_draft.md` with `tools/convert_to_pdf.py`. Markdown, JSON pipeline artifacts, and `images/` under each run stay versioned.

---

## Why multi-agent

One giant prompt holding sourcing rules, schemas, rubrics, templates, and QA checks drifts: the model mixes steps, skips verification, or collapses scoring into prose.

**Splitting into agents** gives:

- **Isolated context** — the writer does not need to internalize the full rubric; the scorer does not need the HTML template.
- **Parallel collection** — model and product collectors can run together in Step 1.
- **Iterability** — change scoring in `rubric.json` / `scorer.md`; change tone in `writer.md` without touching the SOP.
- **Auditability** — each step writes JSON (or markdown) to disk; you can re-run from any step’s artifact.

The canonical spec is **`skill/SKILL.md`**; agent prompts reference it by section.

---

## Pipeline overview

```
User request  →  orchestrator (scope lock → run_header.md)
              →  collector (parallel: models ‖ products → raw_*_records.json)
              →  filter → filtered_records.json
              →  normalizer → normalized_records.json
              →  verifier (primary sources + Reddit quotes) → verified_records.json
              →  scorer → scored_records.json
              →  triage-editor → triage_decisions.json
              →  writer → newsletter_draft.md
              →  qa-reviewer (loop writer on REVISE)
              →  publisher → ai_newsletter_weekly_YYYY-MM-DD.html
```

| Step | Agent (concept) | Responsibility |
|------|------------------|----------------|
| 0 | Orchestrator | Scope lock, dispatch, QA loop |
| 1 | Collector | Tiered scan (models + products) |
| 2 | Filter | Rubric gate thresholds |
| 3 | Normalizer | Schema-conformant records |
| 4 | Verifier | Cross-reference + Reddit quotes |
| 5 | Scorer | Rubric scores + justifications |
| 6 | Triage | main / brief / drop, diversity, overrides |
| 7 | Writer | Compose from `output_template.md` |
| 8 | QA | Editorial checklist |
| 9 | Publisher | Images + HTML via `convert_to_pdf.py` |

In **Claude Code**, agent definitions live under [`.claude/agents/`](.claude/agents/). In **Cursor**, the same pipeline can be driven via the newsletter orchestration subagents (see your workspace’s agent configuration). The **skill** folder is portable to other agent hosts that load `SKILL.md`-style workflows.

---

## Repository layout

```
.
├── .claude/agents/          # Agent prompts (orchestrator, collector, … publisher)
├── skill/
│   ├── SKILL.md             # Authoritative 9-step SOP
│   ├── DESIGN.md            # Visual design system (v3)
│   ├── output_template.md   # Writer skeleton
│   ├── rubric.json          # Gates + scoring dimensions
│   ├── record_schemas.json  # JSON shapes between steps
│   ├── RUNBOOK.md           # Compact run reference
│   ├── INSTALL.md           # Skill install / OpenClaw-oriented notes
│   └── HEARTBEAT.sample.md  # Optional daily signal template
├── tools/
│   └── convert_to_pdf.py    # Markdown → HTML renderer
├── newsletter_runs/
│   └── YYYY-MM-DD/          # Per-issue artifacts + images/
├── requirements.txt         # Python deps for the renderer
├── README.md
└── LICENSE
```

---

## Quick start

### Prerequisites

- **Agent runtime:** Claude Code (`.claude/agents/`) or another environment that can run the newsletter skill / orchestrator (e.g. Cursor with newsletter agents).
- **Python 3.9+** for local HTML generation.

```bash
pip install -r requirements.txt
```

### Generate a new issue

In Claude Code (or your configured agent UI), use a prompt such as:

> Run the newsletter SOP for this week.

or invoke the orchestrator:

> `@newsletter-orchestrator` — generate this week’s briefing.

The orchestrator runs Step 0, then dispatches the downstream steps in order. QA may send the draft back to the writer for revision (typically up to two loops). When finished, note the dated folder under `newsletter_runs/` and the final HTML filename.

---

## Regenerate HTML / PDF

After editing `newsletter_draft.md` or updating `DESIGN.md` / `convert_to_pdf.py`:

```bash
cd newsletter_runs/YYYY-MM-DD
python ../../tools/convert_to_pdf.py
```

Open the generated `ai_newsletter_weekly_YYYY-MM-DD.html` in a browser → **Print → Save as PDF**. Layout targets A4 / US Letter–friendly print styles.

---

## Design system

Defined in **`skill/DESIGN.md`** (v3, Pinterest-adapted):

- **Palette:** warm canvas (`#faf9f5`), Pinterest red (`#e60023`), plum-black (`#211922`), olive secondaries — no cool grays, no drop shadows.
- **Type:** Inter / Pin Sans stack; PingFang SC for CJK fallback.
- **Renderer:** **`tools/convert_to_pdf.py`** implements the tokens; do not add ad-hoc colors or sizes — update `DESIGN.md` first.

---

## Extending the system

| To change… | Edit… |
|------------|--------|
| Source lists | `skill/SKILL.md` (collection sections) + `collector.md` |
| Gate thresholds | `skill/rubric.json` → `gates` |
| Scoring dimensions | `skill/rubric.json` → `dimensions` |
| Record shapes | `skill/record_schemas.json` + `normalizer.md` |
| Section order / voice | `skill/output_template.md` + `writer.md` |
| QA checklist | `skill/SKILL.md` Step 8 + `qa-reviewer.md` |
| Visuals | `skill/DESIGN.md` + `tools/convert_to_pdf.py` |

### Roadmap (ideas)

- Daily `HEARTBEAT` accumulation into the weekly run  
- Dedicated ops / infra / cost module with its own rubric  
- Stronger automation for Reddit / X harvesting (verifier currently relies on tool-based search)  
- CI dry-run on fixtures to catch schema regressions  

---

## 中文简介

本项目是一套 **多智能体驱动的 AI 行业周报流水线**：由编排器按 `skill/SKILL.md` 调度收集、过滤、结构化、交叉验证（含 Reddit 用户原声）、评分、分流、撰写、编辑 QA，最后下载配图并渲染为 **可打印 HTML/PDF**。核心价值是 **编辑判断**：主条目需分层呈现「官方声明 / 外部验证 / 社区反馈 / 编辑判断」，并对 Reddit 引用做中文译文。

**运行：** 在 Claude Code 中说明「按 newsletter SOP 跑本周周报」或 `@newsletter-orchestrator`。**本地重渲 HTML：** 进入 `newsletter_runs/YYYY-MM-DD` 后执行 `python ../../tools/convert_to_pdf.py`。

详细规范见 `skill/SKILL.md`；视觉规范见 `skill/DESIGN.md`；评分见 `skill/rubric.json`。

---

## License

[MIT](LICENSE).
