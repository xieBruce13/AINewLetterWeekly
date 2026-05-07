# Awsome AI Newsletter

面向团队的 **AI 行业周报 Agent + 个性化阅读站**。两个面：

1. **上游：多 Agent 编辑流水线**（`.claude/agents/` + `skill/`）—— 从选题、核实到成稿、排版的固定 SOP，**有据可查、结构统一**。
2. **下游：个性化网站 + 聊天 Agent**（`web/`）—— 同一份内容，按读者的角色/在做的项目/关注方向重排+改写，每个人看到的头条都不一样；每条新闻可点击展开、可与 Agent 对话，Agent 会跨会话记住你说过的偏好。

> 想跑流水线产出本周内容：见下文。
> 想搭起个性化网站：见 [`web/README.md`](web/README.md)。

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## 这个 Agent 能干什么？

### 能力 1 · 自动播报每周重要的 AI 资讯

按项目内既定的「重要性」定义（见下文「什么算重要」），自动跑完整条流水线，产出一份结构化、可直接传阅的周报（HTML / PDF）。

- 默认时间窗口：过去 7 天；默认模块：**模型 + 产品**
- 由多个专职智能体分工完成：收集 → 过滤 → 核对 → 打分 → 取舍 → 撰稿 → 质检 → 发布
- 每一步都有 JSON 中间产物，支持事后复盘与规则调参

### 能力 2 · 按角色/场景支持差异化搜索

同一套流水线，按调用方的角色、关注方向、深度动态切片——换一组参数就能得到不同侧重的资讯。

调用时可显式指定：

- `modules`：要跑哪些模块（`models` / `products` / 两者）
- `focus_topics`：本期重点话题（例如 `coding agent`、`图像生成`、`设计类工具`）
- `must_include`：必须包含的具体条目
- `audience`：目标读者（策略 / PM / 投资人 / 创作者工具 / 通用）
- `top_n_per_module`：每个模块最多保留几条主条目

典型角色切片示例：

| 角色 | 关键参数 | 侧重 |
|---|---|---|
| 模型决策 / 选型 | `modules=models`，focus=coding/agent/长上下文 | 旗舰变化、价格速度、选型影响 |
| 产品 PM / 竞品分析 | `modules=products`，focus=workflow/交互形态 | workflow 变化、交互新范式、竞品动作 |
| 创作者工具方向 | `modules=products`，focus=AIGC/设计/视频/素材 | 创作链路工具、设计/视频生成 |
| 投资人 / 战略 | `modules=products`，focus=商业模式/分发变化 | 市场信号、access barrier 变化、初创聚焦 |
| 技术趋势监控 | 仅保留 Tier 1+2 信源，忽略二手 newsletter | 官方一手 + 技术信号 |
| 自定义主题 | `focus_topics` + `must_include` | 围绕指定主题抓一周相关条目 |

触发很轻量，在 Claude Code / Cursor 里一句中文即可，例如：  
> 「按 newsletter SOP 跑本周周报，只看产品模块，重点关注 creator tools 方向」

---

## 产出的资讯包含哪些内容？

周报一共 7 段，按固定顺序呈现，总篇幅目标 **6–8 页 PDF**：

1. **本周结论** — 1–2 个 callout，说清本期核心判断 + 对我们意味着什么
2. **模型模块** — 1 句模块总结 + 每条主条目一张卡片
3. **产品模块** — 1 句模块总结 + 每条主条目一张卡片
4. **初创聚焦** — 每期至少 1 个非大厂的独立/初创产品
5. **简讯** — 一张紧凑 2 列表格：名称 + 一句话
6. **编辑部判断** — 趋势 + 项目动作 + 下周监控
7. **参考来源** — 按模型/产品分组，最小号灰字，便于溯源

### 模型模块 · 每条主条目结构

| 字段 | 含义 |
|---|---|
| 总结 | 一句话：谁的什么模型，最值得记住的卖点 |
| 模型能力 | 2–4 个核心能力变化，带具体数字 |
| 产品功能 | 在哪些产品里可用，API 是否可用，影响什么工作流 |
| 新使用场景 | 能力落地后用户新能做什么 |
| 商业模式 | 定价与策略，具体数字 |
| 用户反馈 | 好 / 坏各 2–3 条，引真实用户原话（译为中文） |
| 与我们的关系 | 对我们产品方向的具体启发 |

外加一个小 2×2 表：**官方声明 ｜ 外部验证 ｜ 社区反馈 ｜ 编辑判断**——四层分明、不混写。

### 产品模块 · 每条主条目结构

| 字段 | 含义 |
|---|---|
| 总结 | 一句话：谁的什么产品，最值得记住的卖点 |
| 核心定位 | 解决什么问题，给谁用 |
| 产品重点 | 2–4 个核心功能 / 变化点 |
| 用户场景 | 用户在什么场景下会用它 |
| 商业模式 | 定价与策略 |
| 用户反馈 | 好 / 坏，引真实用户原话（译为中文） |
| 与我们的关系 | 对我们产品方向的具体启发 |

---

## 什么算「重要」？（过滤与打分）

重要性门槛和权重都写在 `skill/rubric.json` 里，每一条都留存判断理由，可复盘。

**模型模块**  
硬门槛：必须是模型事件（新模型/版本升级/能力跳跃/价格变化/API 能力/开源权重） + 至少一个官方或技术信号一手源 + 至少一条可核对 claim。  
打分维度：能力真变化 · 对选型的影响 · 证据质量 · 生态反响 · 持久度 · 炒作减分。  
分档：**main ≥ 7 ｜ brief 5–6 ｜ drop < 5**。

**产品模块**  
硬门槛：用户今天就能感知到（不是 closed alpha） + 至少两个独立来源。  
打分维度：用户可见度 · 准入变化 · 工作流变化 · 分发变化 · 用户反应 · 与我们方向相关性 · 证据质量 · 炒作减分。  
分档：**main ≥ 10 ｜ brief 7–9 ｜ drop < 7**。

**两条结构性规则**
- **多样性**：Top N 主条目同公司最多 N−1 条，超出则降级
- **初创必带**：每期至少 1 个非大厂（非 OpenAI / Anthropic / Google / Meta / Microsoft / Adobe / Apple）的独立或初创产品

---

## 信源（分 Tier 扫描）

**模型模块**
- Tier 1（一手）：OpenAI、Anthropic、Google Gemini、Meta AI、Mistral、xAI 官方博客与 Release Notes（次要：GLM、MiniMax、Kimi、Midjourney、Seedream、Flux 等）
- Tier 2（技术信号）：Hugging Face、GitHub Trending、Hacker News、arXiv
- 外部验证：Arena / LMSYS、Artificial Analysis、LiveBench
- Tier 3（二手补漏）：Import AI、TLDR AI、The Rundown AI

**产品模块**
- Tier 1（一手）
  - 官方 changelog：ChatGPT、Claude、Gemini Apps、Perplexity、xAI Dev
  - **重点竞品官方社媒账号**：@OpenAI、@AnthropicAI、@GoogleDeepMind、@GeminiApp、@MetaAI、@MistralAI、@xai、@perplexity_ai、@midjourney、@runwayml、@pika_labs、@LumaLabsAI、@suno_ai_、@elevenlabsio、@heygen_official、@figma、@canva、@Adobe、@framer、@gamma_app、@notion、@cursor_ai、@replit、@v0、@lovable_dev、@bolt_new、@devin_ai、@windsurf_ai、@githubcopilot…
  - **行业 KOL 推特**：@sama、@gdb、@miramurati、@DarioAmodei、@demishassabis、@sundarpichai、@elonmusk、@AravSrinivas、@mustafasuleyman、@alexandr_wang、@karpathy、@ylecun、@emollick、@OfficialLoganK、@swyx、@simonw、@goodside、@pmarca、@levie、@zoink（Dylan Field）、@bilawalsidhu、@nickfloats…（中文圈：@dotey、@op7418、@oran_ge、@jikeshijian）
- Tier 2（发现与分发）：Product Hunt、Futurepedia、There's An AI For That、Toolify、Google Trends、TikTok Creative Center、YouTube Charts、X Trends
- Tier 3（newsletter / 媒体）：The Rundown AI、Ben's Bites、Superhuman AI、TLDR AI、AI Breakfast、The Verge AI、WIRED AI、TechCrunch AI、THE DECODER 等
- 社区：Reddit（r/artificial、r/singularity、r/LocalLLaMA、r/ChatGPT、r/ClaudeAI、r/MachineLearning 等）、Hacker News、YC Startup Directory、Hugging Face、Indie Hackers

---

## 流水线（每步干什么）

整条流水线由多个专职 agent 分工完成：

| 步骤 | Agent | 产出 |
|---|---|---|
| 0 | orchestrator | 锁定本期范围（run_header） |
| 1 | collector | 按 Tier 扫信源，顺手存真实产品图片 URL（raw records） |
| 2 | filter | 跑 gate check，丢掉不合规条目 |
| 3 | normalizer | 扩成完整 schema |
| 4 | verifier | 核对官方原始出处 + Reddit 真实用户原话 2–4 条 |
| 5 | scorer | 每维度打分 + 写理由 |
| 6 | triage-editor | 三档取舍 + 多样性 + 初创必带 |
| 7 | writer | 按 `output_template.md` 成稿，用户原话全部译为中文 |
| 8 | qa-reviewer | 对照清单检查，不过就回退 |
| 9 | publisher | 下图 + 生成 HTML（必要时导出 PDF） |

每一步只做一件事，方便以后只改「收集规则」或「排版」而不用重写全部指令。详细规则以 **`skill/SKILL.md`** 为准。

---

## 你怎么用？

1. **装本地渲染依赖**（Markdown → HTML）：  
   `pip install -r requirements.txt`

2. **在智能体里说一句**，例如：  
   > 「按 newsletter SOP 跑本周周报」  
   > 「只看模型模块，保留 top 3，强调选型影响」  
   > 「看这周的产品新闻，重点关注 workflow 变化和创作方向相关性」

3. **到 `newsletter_runs/某期日期/` 里取稿**：  
   主文件 `newsletter_draft.md`，同目录下有素材图与生成好的网页文件。

---

## 导出网页与 PDF

在**某一期的文件夹**（如 `newsletter_runs/2026-04-19/`）里：

```bash
python ../../tools/convert_to_pdf.py
```

会生成（或更新）当期的 `ai_newsletter_weekly_*.html`。

**更推荐**用脚本导出 PDF（与浏览器里看到的效果一致）：

```bash
pip install -r ../../requirements-pdf.txt
playwright install chromium
python ../../tools/render_pdf.py
```

---

## 仓库里大致有什么？

| 位置 | 作用（一句话） |
|------|----------------|
| `skill/SKILL.md` | 整条流程的说明书（想深入从这里读） |
| `skill/rubric.json` | 门槛定义 + 打分维度 |
| `skill/record_schemas.json` | 每条记录的字段结构 |
| `skill/output_template.md` | 周报成品模板 |
| `skill/DESIGN.md` | 版面与配色约定 |
| `.claude/agents/` | 10 个专职智能体的 prompt |
| `newsletter_runs/` | 按日期归档的每一期草稿、图片与网页 |
| `tools/convert_to_pdf.py` | 把 Markdown 渲染成存档 HTML / PDF |
| `tools/sync_to_db.py` | 把每期 JSON 推送到 Postgres，供网站消费 |
| `tools/seed_demo_data.py` | 写一份示例数据，方便本地调试网站 |
| `db/migrations/` | Postgres 初始化 SQL（含 pgvector） |
| `web/` | Next.js 15 网站 + 聊天 Agent（详见 `web/README.md`） |

更技术向的目录说明、文件名与改法，见 **`skill/RUNBOOK.md`**。

---

## 开源许可

[MIT](LICENSE)。
