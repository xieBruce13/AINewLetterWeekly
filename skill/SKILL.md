---
name: newsletter_weekly
description: Weekly AI newsletter workflow. Collects from tiered sources, verifies against primary evidence, scores by reproducible rubrics, and writes a structured editorial briefing.
---

# Newsletter Weekly Skill

Use this skill when the user asks for:
- a weekly AI newsletter / briefing / digest
- a model + product news roundup
- a structured "what matters this week" report
- a recurring AI market/product scan that should follow a stable SOP

Do **not** use this skill for a one-off factual question that does not require editorial selection.

## Execution model — multi-agent pipeline

This SOP is the **authoritative definition**. It is executed by a multi-agent system under `.claude/agents/`:

| Step | Agent | Reads | Writes |
|------|-------|-------|--------|
| 0 | `newsletter-orchestrator` | user request, this SOP | `run_header.md` |
| 1 | `newsletter-collector` | run_header, source lists (§1A, §1B) | `raw_model_records.json`, `raw_product_records.json` |
| 2 | `newsletter-filter` | raw records, `rubric.json` gates | `filtered_records.json` |
| 3 | `newsletter-normalizer` | filtered, `record_schemas.json` | `normalized_records.json` |
| 4 + 4B | `newsletter-verifier` | normalized | `verified_records.json` (with Reddit quotes) |
| 5 | `newsletter-scorer` | verified, `rubric.json` dimensions | `scored_records.json` |
| 6 | `newsletter-triage` | scored, `rubric.json` thresholds | `triage_decisions.json` |
| 7 | `newsletter-writer` | triage + verified, `output_template.md` | `newsletter_draft.md` |
| 8 | `newsletter-qa` | draft, Step 8 checklist | PASS or REVISE notes |
| 9 | `newsletter-publisher` | draft, `tools/convert_to_pdf.py` | `ai_newsletter_weekly_YYYY-MM-DD.html` |

The orchestrator never writes newsletter content. Each specialist reads only the sections of this SOP that pertain to its step, which keeps each agent's context small and its behavior stable. If you are updating a rule, update it here; the agent prompts reference this file as the source of truth.

**Companion files:**
- `skill/DESIGN.md` — the newsletter's authoritative design system (colors, type, components, layout). Read before touching `tools/convert_to_pdf.py` or changing anything about how the PDF looks.
- `skill/output_template.md` — per-section markdown skeleton the writer fills in.
- `skill/record_schemas.json` — the JSON shapes passed between pipeline steps.
- `skill/rubric.json` — gate definitions and scoring dimensions.

## Core principle

This workflow is **not** news aggregation.
Its job is to help the team decide:
1. what actually changed,
2. what is actually credible,
3. what matters for our own product decisions,
4. and what deserves to be kept in the weekly archive.

Always separate five layers of information:
- **Official claims** — what the vendor says
- **Third-party validation** — independent benchmarks, Artificial Analysis, community reproduction
- **Media interpretation** — what journalists and newsletters wrote about it
- **Community reaction** — Reddit, X, HN — sentiment and real user experience
- **Editorial judgment** — our own assessment, explicitly labeled as such

## Default operating mode

Unless the user overrides:
- Time window: last 7 days ending now
- Modules: `models` + `products` (operations module is future / not yet defined — do not activate unless user explicitly requests and accepts that it has no rubric)
- Language: match the user's language; default to Chinese for Chinese requests
- Keep: top 3 main entries per module (top 5 if the week is dense); plus brief mentions for borderline items
- Output format: structured markdown following `output_template.md`

## Editorial focus — what this newsletter is FOR

This newsletter serves a team building **AI-native creative tools / skill systems / workflow products**. The reader cares about:
1. Frontier model capability that changes how general reasoning / agent / long-context / multimodal workflows behave
2. Creative, design, content, and general-knowledge-work products (Claude Design, Figma AI, Adobe Firefly, Canva AI, etc.)
3. Agent / skill / workflow infrastructure (Claude Code, Codex, Chrome Skills, MCP, orchestration layers)
4. Startups and indie products in the creation / productivity / skill space

**Deprioritize (max tier = brief, usually drop):**
- Narrow vertical specialist models (biotech, genomics, law-firm-specific, finance-quant-specific, drug discovery) — unless the release directly informs how vertical specialization will play out in creative domains, AND that inference can be made in 1 sentence
- Enterprise-only releases with Trusted Access / closed alpha that the reader cannot try themselves
- Pure research papers with no product or workflow implication
- Funding rounds, org shuffles, executive quotes

If an item is vertically specialized but the team might want to know it exists, put it in 简讯 with one line, not in main. Do NOT open a main entry for a product the team will never touch.

## Inputs to capture before starting

- `time_window`
- `modules` (`models`, `products`)
- `top_n_per_module`
- `audience` (internal strategy / PM / investor / creator tools / general)
- `focus_topics` (optional)
- `must_include` items explicitly named by the user
- `exclude_topics` (optional)
- `output_format` (markdown / doc / pdf-ready markdown)

If the user is vague, infer sensible defaults and proceed. State your assumptions at the top of the output.

---

## Workflow

### Step 0 — Scope Lock

Before collecting anything, write a run header:

- Report date
- Time window
- Modules requested
- Focus topics
- Named must-include items
- Language
- Desired depth

If a `newsletter_runs/current_week/signals.jsonl` file exists from HEARTBEAT scans, read it first and incorporate any pre-collected signals.

---

### Step 1 — Collect by Source Tier

Collect separately for each module. **Always go tier by tier in order.** Do not skip to Tier 3 before checking Tier 1.

> **Image collection rule:** While collecting from each source, also save key visual assets. Store image URLs in each record's `image_urls` field. Target: at least 1–2 images per main entry. **It is better to publish an entry with NO image than with a bad image.**
>
> **CRITICAL — must be actual product images, NOT promotional/marketing graphics:**
> - **Preferred (in order):** 1) Product UI screenshots showing the actual interface 2) Benchmark data tables/charts from official sources 3) Comparison tables from review articles 4) Architecture diagrams
> - **HARD BAN — must NEVER use:** Hero banners, promotional graphics, blog header images, logo compilations, stock photos, AI-generated fantasy/abstract imagery (glowing letters, neon scenes, robot mascots, concept art), Product Hunt thumbnail graphics that are obviously marketing art rather than UI, YouTube video thumbnails.
> - **How to find actual product images:** Search tech media articles (TechCrunch, The Verge, 9to5Google, The New Stack, etc.) which embed real screenshots. Extract image URLs from the raw HTML of these articles (`Select-String` on downloaded HTML for `src="https://...png|jpg"`). Official blog posts also embed product UI within the article body (not the header image). For startups without press coverage, check the product's own documentation/demo page for screenshots.
> - **URL verification:** Before downloading, check that the image URL path contains keywords like `screenshot`, `ui`, `interface`, `asset`, `dashboard`, or is clearly a product capture. Reject URLs containing `hero`, `banner`, `og-image`, `thumbnail`, `cover`, `social`, `maxresdefault` (YouTube thumbnail), or paths under `/marketing/`, `/press/`, `/media-kit/`.
> - **Post-download verification:** After downloading, actually open the image and confirm it shows real UI or real data. If the image shows abstract art, mascots, glowing logos in stylized scenes, or generic product photography, DELETE it and either (a) find a real screenshot or (b) ship the entry with no image. Never ship a bad image just to have one.

#### 1A. Model Sources

**Tier 1 — Official first-party sources (check first, always)**
- OpenAI News + Model Release Notes
- Anthropic Newsroom + Claude Release Notes
- Google Gemini official updates + Gemini Apps Release Notes
- Meta AI Blog
- Mistral official updates
- xAI News + developer Release Notes

Secondary official vendors (check if relevant that week):
- GLM, MiniMax, Kimi, Midjourney, Seedream, Flux, other emerging labs

**Tier 2 — Technical signal sources**
- Hugging Face Trending Papers / Trending Models
- GitHub Trending
- Hacker News
- arXiv discovery feeds
- Major benchmark repos (if a new eval run dropped)

**Tier 3 — Newsletters and media (discovery + gap-filling, not final truth)**
- Import AI (weekly, research + model-level meaning)
- TLDR AI (daily headlines)
- The Rundown AI (broad model + industry)

**External validation sources (use after collection to cross-check)**
- Arena / LMSYS-style rankings
- Artificial Analysis
- LiveBench

**User prompt supplements**
- If the user explicitly says "also check X this week", treat it as a required collection target.

#### 1B. Product Sources

**Tier 1 — Official changelogs (check first, always)**
- ChatGPT Release Notes + Enterprise/Edu Release Notes
- Claude Release Notes
- Gemini Apps Release Notes + monthly Gemini Drops
- Perplexity Changelog
- xAI developer Release Notes

**Tier 2 — Discovery platforms + distribution signals**

Launch / discovery:
- Product Hunt (AI topic)
- Futurepedia
- There's An AI For That
- Toolify

Distribution signal:
- Google Trends (search interest validation)
- TikTok Creative Center (consumer-level hashtag/video heat)
- YouTube Charts (category-level, not old-style overall trending)
- X Trends (personalized — use for heat discovery only, not objective ranking)

**Tier 3 — Newsletters and media**
- The Rundown AI
- Ben's Bites (product / tool / startup launch signals)
- Superhuman AI (quick hands-on + tool-oriented)
- TLDR AI
- AI Breakfast
- AI Valley Newsletter
- The Verge (AI), WIRED (AI), TechCrunch (AI)
- AI News, THE DECODER, VentureBeat (AI)

**Community / ecosystem**
- Reddit (r/artificial, r/singularity, r/LocalLLaMA, product-specific subs)
- X / official accounts / founders
- YC Startup Directory (AI)
- Hugging Face Hub
- Towards AI community
- Hacker News

**Startup / indie discovery (mandatory — at least 1 per issue)**
- Product Hunt (daily AI launches — look beyond top-3 for novel small products)
- YC Startup Directory (AI)
- Indie Hackers
- r/SideProject, r/startups
- Ben's Bites (often covers small tools)
- There's An AI For That (emerging tools with traction signals)

> **Startup diversity rule:** Every issue must include **at least one startup or indie/novel small product** that is NOT from a major tech company (Anthropic, OpenAI, Google, Meta, Microsoft, Adobe, Apple). This ensures the newsletter is not exclusively big-company focused. The startup entry can be in the main module or brief section, but it must be present.

---

### Step 2 — Pre-filter (Gate Check)

Before normalizing, run gate checks to avoid wasting effort on non-qualifying items. Refer to `rubric.json` for gate definitions.

#### 2A. Model Gates

For each candidate, check:
1. **Is it a model event?** — New model, version upgrade, benchmark/capability jump, context/latency/pricing major change, API capability, open-weight release, significant training method. Company funding, executive quotes, general AI commentary → **drop immediately**.
2. **Does it have a Tier 1 or Tier 2 source?** — If only Tier 3 newsletter mentions exist with no traceable official or technical source → **move to watchlist**, do not promote to main.
3. **Is minimum evidence met?** — At least one concrete, verifiable claim with a traceable URL → otherwise **move to watchlist**.

#### 2B. Product Gates

For each candidate, check:
1. **Can users perceive it today?** — Must be publicly available, in public beta, or have confirmed imminent launch. Pure concept or closed alpha → **max tier = brief**.
2. **Evidence beyond a single source?** — Must appear in more than one independent source. A single newsletter mention without corroboration → **move to watchlist**.

Items that fail all gates → drop. Items that fail one gate → watchlist (may appear as brief mention).

---

### Step 3 — Normalize into Records

Turn raw findings into structured records following `record_schemas.json`.

For each record, you **must** fill:
- `source_tier` — which tier the primary evidence came from
- `confidence` — high / medium / low
- `verification_status` — verified / partially-verified / unverified
- `gate_results` — pass/fail for each gate

Clearly tag which fields come from official sources, which from third-party, and which from community. Do not mix these in a single freeform paragraph.

---

### Step 4 — Verify / Cross-reference

For each normalized record:
1. Can every `official_claim` be traced back to a specific changelog, release note, blog post, or paper URL? If not, mark that claim as `unverified`.
2. Are there external benchmark results, Artificial Analysis pages, or community reproduction attempts? Update `external_validation_summary`.
3. If a claim appeared only in newsletters or social media and cannot be verified against a primary source, explicitly note this in `risk_caveat`.

Update `verification_status` and `confidence` based on results.

### Step 4B — Collect Real User Voices from Reddit

For every **main** entry, search Reddit for genuine user reactions. This is mandatory, not optional.

**Search strategy:**
- Search relevant subreddits: r/artificial, r/singularity, r/LocalLLaMA, r/ChatGPT, r/ClaudeAI, r/MachineLearning, and product-specific subs
- Use the product/model name as search term within the current time window
- Look for substantive comments (not just hype or one-liners) that reflect real usage experience

**What to capture (2–4 quotes per main entry):**
- At least 1 positive real-use experience quote
- At least 1 skeptical / critical / problem-reporting quote
- Include the Reddit username (as u/username) and subreddit (as r/subreddit)
- Preserve the original language; if translating, note it

**Format in the newsletter:**
```
> "Actual quote text here..." — u/username, r/subreddit
```

**Quality bar:** Generic hype comments ("this is amazing!") do not count. Look for comments that describe specific usage, comparisons, problems encountered, or workflow impact.

---

### Step 5 — Score by Module-specific Rubric

Apply the rubrics defined in `rubric.json`. Every dimension must have an explicit numeric score **and** a one-sentence justification stored in `score_breakdown.justifications`.

#### 5A. Model Scoring

Dimensions (per `rubric.json`):
- `real_capability_change` (0–3)
- `selection_impact` (0–2)
- `evidence_quality` (0–2)
- `ecosystem_echo` (0–2)
- `durability` (0–1)
- `hype_penalty` (0 to -3)

**Total = sum of above (theoretical range: -3 to 10)**

#### 5B. Product Scoring

Dimensions (per `rubric.json`):
- `user_visibility` (0–2)
- `access_barrier_change` (0–2)
- `workflow_change` (0–3)
- `distribution_change` (0–2)
- `user_reaction` (0–2)
- `relevance_to_our_direction` (0–3)
- `evidence_quality` (0–2)
- `hype_penalty` (0 to -3)

**Total = sum of above (theoretical range: -3 to 16)**

---

### Step 6 — Triage (Three-tier Keep)

For each candidate, assign `item_tier` based on score and editorial judgment:

#### Models
- **main** (score >= 7): full expanded entry
- **brief** (score 5–6): 2-3 line mention in the brief section
- **drop** (score < 5): archived with `drop_reason`, not published

#### Products
- **main** (score >= 10): full expanded entry
- **brief** (score 7–9): 2-3 line mention in the brief section
- **drop** (score < 7): archived with `drop_reason`, not published

**Diversity rule:** Top N main items should have at most N-1 entries from the same company. If one company dominates, demote the weakest entry to brief and promote the next-best from a different company.

**Startup inclusion rule:** Across both modules combined, at least 1 entry (main or brief) must feature a startup / indie / small-company product. If no startup qualifies for main, the highest-scoring startup must appear in the brief section with a slightly expanded description (3–4 lines instead of the usual 1–2).

**Editorial override:** If both editorial gates fail ("not a real change" + "doesn't affect selection"), demote even if score is technically above threshold.

All triage decisions and reasons must be recorded in the records for archive.

---

### Step 7 — Write the Newsletter

Follow `output_template.md` structure strictly.

**CRITICAL: internal vs. published content**

The scoring, confidence, source tiers, gate results, and triage decisions are **internal process artifacts**. They live in `scored_records.json` and `triage_decisions.json`, NOT in the published newsletter. The reader never sees scores like "9/10" or labels like "Tier 1" or "置信度：高". The newsletter is an editorial product, not a process log.

**Overall structure (top-down):**

1. **本周结论** — 1–2 callout blocks stating the week's core judgment + what it means for us
2. **模型模块** — 1 sentence module summary → individual entry cards
3. **产品模块** — 1 sentence module summary → individual entry cards
4. **本期初创聚焦** — 1 startup/indie product spotlight (if not already in main modules)
5. **简讯** — compact 2-column table (name + one sentence), no scores, no reasons
6. **编辑部判断** — trends + project actions + next week watchlist
7. **参考来源** — grouped list, smallest type

**DO NOT include:** 方法说明, 排除项, overview/ranking tables, score badges, confidence indicators. These add noise and pages without reader value.

**Per-entry writing rules (same structure for model AND product entries):**

Each main entry is a self-contained **card** (rendered as a bordered box in PDF). The card has a **title line** followed by a **2-column detail table** — left column is section label, right column is content. This format comes from the SOP example and is much more compact and scannable than separate headings.

**Card structure:**

```
### 编号｜名称

| 模块 | 具体详情 |
|------|---------|
| 总结 | 一句话：谁的什么产品/模型，最值得记住的卖点。 |
| 能力/功能 | 2–4 个核心变化，用 ● 分点，每点带具体数字。图片直接放在表格内或紧随表格后。 |
| 产品落点 | 在哪些产品里可用，API 是否可用，影响什么工作流。 |
| 新场景 | 能力落地后用户新能做什么。 |
| 商业模式 | 定价和策略，用具体数字。 |
| 用户反馈 | 好：2–3 个正面要点。坏：2–3 个负面要点。引用真实用户声音（中文）。 |
| 与我们的关系 | 对我们产品方向的具体启发。 |
```

**Key formatting rules for the detail table:**

- Left column ("模块") width ~15%, right column ("具体详情") width ~85%
- Right column content uses `●` bullets for sub-points, NOT nested markdown lists
- Numbers and benchmarks inline with text (e.g., "SWE-bench Verified **87.6%**")
- Images (`![](images/xxx.png)`) placed immediately after the entry table, not inside it
- The 信息分层 2×2 table (官方/验证/社区/判断) is placed AFTER the main detail table as a separate small table
- User quotes in blockquote format AFTER the detail table: `> "quote" — source`

**Writing style rules (match SOP):**

- **Sentences must be short and direct.** Max 2–3 sentences per paragraph. If you find yourself writing 4+ sentences, break it up or cut.
- **Lead with the conclusion**, then support. Don't build up to a point — state it, then justify.
- **Bold all key numbers, product names, and verdict words.** The reader should be able to scan bold text and get 80% of the content.
- **All user quotes in Chinese.** If the original is English, translate it naturally. Do not include original English.
- **No meta-commentary.** Don't say "这是本周最重要的事件" — just write it as the first entry. Position signals importance.
- **No score display.** Never write "得分 9/10" or "14/16" in the published output.
- **No source tier labels.** Never write "Tier 1" or "来源层级" in the output.
- **No confidence labels.** Never write "置信度：高" in the output.

**Image rules:**

- Each main entry SHOULD include **1–2 actual product images**, but NEVER use a bad image to fill the slot
- Preferred: product UI screenshots, benchmark data charts, feature comparison tables
- **Reject and delete if encountered:** blog hero images, marketing banners, stock photos, logo graphics, AI-generated art (glowing letters, neon scenes, mascots, concept art), YouTube thumbnails, Product Hunt marketing thumbnails that are not real UI
- **If no real product image can be sourced for an entry, ship the entry with no image.** Do not substitute a generic / decorative / AI-generated image. A text-only entry is strictly better than a misleading one.
- Format: `![caption](images/filename.png)` → italic caption on next line with source attribution
- Collect images during Step 1; open each downloaded image and confirm it shows the actual product or real data before embedding
- Store in `newsletter_runs/YYYY-MM-DD/images/`
- Image source strategy: scrape `<img src="">` from TechCrunch / The Verge / 9to5Google / The New Stack / official docs article HTML → filter for real screenshots → download

**User voice rules:**

- Every main entry must include **2–4 real quotes** from Reddit, HN, or official testers
- **All quotes must be translated to Chinese**
- Format: `> "translated quote" — source description`
- At least 1 positive + 1 critical/skeptical voice per entry
- Generic hype ("太棒了！") does not count — quotes must describe specific experience

---

### Step 8 — Editorial QA

Before finalizing, run this checklist:

**Content checks:**
- [ ] Does every main entry directly connect to the team's focus (creative / skill / workflow / agent infra)? Vertical specialist models that do not inform our direction must be in 简讯 or dropped, not main.
- [ ] Does every entry include the 信息分层 2×2 table?
- [ ] Does every entry clearly say **why it matters** and **与我们的关系**?
- [ ] For each image present: does it actually show product UI or real data? If it is a hero banner, logo art, AI-generated graphic, or generic marketing image — DELETE it and either source a real screenshot or ship the entry with no image.
- [ ] Does every entry include 2–4 real user quotes, all in Chinese?
- [ ] Is there at least 1 startup/indie product (main or brief)?
- [ ] Are key numbers and verdicts **bolded**?
- [ ] Are all paragraphs ≤ 3 sentences?
- [ ] Visual hierarchy check: can a reader extract the week's main story from title + 本周结论 + each card's "总结" row alone?

**Format checks (things that must NOT appear in published output):**
- [ ] No scores (9/10, 14/16, etc.) anywhere in the output
- [ ] No "置信度" or "来源层级" labels
- [ ] No "方法说明" section
- [ ] No "排除项" section
- [ ] No English-language user quotes (all translated to Chinese)
- [ ] No overview/ranking tables with score columns

**Structure checks:**
- [ ] 本周结论 uses callout blocks, not plain paragraphs
- [ ] Each main entry is a self-contained card with consistent sub-sections
- [ ] 简讯 is a compact 2-column table only
- [ ] 编辑部判断 includes trends + project actions + watchlist
- [ ] Total content targets **6–8 PDF pages**

If any check fails, revise before proceeding to Step 9.

---

### Step 9 — Generate PDF

After editorial QA passes, generate a publication-ready PDF. This step is **mandatory** — every newsletter run must produce a PDF.

**Pipeline:**
1. Download all referenced images to `newsletter_runs/YYYY-MM-DD/images/` (use WebFetch or shell `curl`)
2. Convert `newsletter_draft.md` → HTML using the `convert_to_pdf.py` script in the run folder
3. The script handles: markdown→HTML conversion, image embedding, visual hierarchy CSS, and PDF generation
4. Output: `ai_newsletter_weekly_YYYY-MM-DD.html` (open in browser → Ctrl+P → PDF) or direct PDF if playwright is available

**Visual design — authoritative source: `skill/DESIGN.md`**

All visual rules (color tokens, type scale, component styling, spacing) are defined in `skill/DESIGN.md`. That file is the single source of truth for the newsletter's design system. If a design decision is not covered here, look there.

`tools/convert_to_pdf.py` is the renderer that implements those tokens. When updating design:
1. Edit `skill/DESIGN.md` first (add/change tokens, components).
2. Update `convert_to_pdf.py` CSS to match.
3. Never introduce a hex color, font size, or component style that isn't declared in `DESIGN.md`.

**Non-negotiable hierarchy rules (summary — full rules in DESIGN.md §3–5):**

- Title block (h1 banner): **26pt** bold, white on navy gradient
- 本周结论 callout: **12.5pt body / 13pt bold verdict words**, amber left border — must visually dominate the module content below
- Module headers (h2): **17pt** bold in brand-blue
- Entry titles (h3): **14pt** bold
- 总结 row (first row of each card's detail table): **11.5pt / 11pt**, amber fill, bolder weight, visually distinct from other rows
- Body: 10.5pt
- 简讯: 9pt, demoted (no card)
- 参考来源: 7.5pt, muted gray

The **scan path** must be preserved in every issue: a reader scrolling through the PDF should grasp the week's main story from title → 本周结论 → each card's 总结 row alone. If any revision weakens that path, reject it.

**Page target:** 6–8 PDF pages.

**PDF style is defined in the `convert_to_pdf.py` script's embedded CSS.** Update it when design requirements change.

---

## Traceability and artifact habit

Save each run in a reproducible folder:

```
newsletter_runs/YYYY-MM-DD/
  raw_model_records.json
  raw_product_records.json
  scored_records.json
  triage_decisions.json
  newsletter_draft.md
  images/                          ← downloaded images for this issue
  convert_to_pdf.py                ← HTML/PDF generator (self-contained)
  ai_newsletter_weekly_YYYY-MM-DD.html  ← publication-ready HTML
```

This makes future refinement, rubric calibration, and post-hoc review possible.

---

## Output style

- Be editorial, not chatty.
- Use tables for structured comparisons; use prose for judgments and analysis.
- Prefer short decisive paragraphs over bloated lists.
- Be explicit when evidence is thin — never convert vendor marketing into editorial fact.
- Do not overclaim.
- Keep the tone useful for internal strategy and product discussion.
- Every table must have real content; never leave a template placeholder in the final output.

---

## Prompt patterns to trigger this skill

- "按 newsletter SOP 跑一版这周模型和产品新闻。"
- "做一版过去 7 天 AI 产品与模型周报，按我们既定结构。"
- "只看模型模块，保留 top 3，并强调选型影响。"
- "看这周的产品新闻，重点关注 workflow 变化和创作方向相关性。"
- "把这周 newsletter 跑出来，并加入我指定的 X / Y / Z。"
