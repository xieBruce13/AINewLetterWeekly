# Awsome AI Newsletter

用 **多智能体流水线** 自动产出 **AI 行业周报**：收集 → 过滤 → 结构化 → 交叉验证 → 评分 → 分流 → 撰写 → 质检 → 发布。最终得到 `newsletter_draft.md` 以及可在浏览器中 **打印为 PDF** 的 HTML。

**这不是新闻聚合器** —— 它强制「编辑结构」：区分官方说法、第三方验证、社区声音与明确的编辑判断；主条目包含 Reddit 用户原声（正文译为中文）与真实产品截图。

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## 目录

- [概览](#概览)
- [流水线](#流水线)
- [仓库结构](#仓库结构)
- [快速开始](#快速开始)
- [本地渲染与导出](#本地渲染与导出)
- [视觉设计](#视觉设计)
- [自定义与扩展](#自定义与扩展)
- [开源许可](#开源许可)

## 概览

| | |
|---|---|
| **适用对象** | 正在做 AI 原生创意 / 工作流 / 技能系统类产品的团队，需要一份篇幅较长（约 15–30 页）的内部策略向周报。 |
| **运行环境** | **Claude Code** 使用 [`.claude/agents/`](.claude/agents/) 中的子智能体；**Cursor** 可通过内置的 newsletter 编排类子智能体跑同一套流程。流程与规范的权威来源是 **`skill/SKILL.md`**。 |
| **Python** | 仅用于把 Markdown **渲染成 HTML**（`tools/convert_to_pdf.py`）。需 Python 3.9+，依赖安装：`pip install -r requirements.txt`。 |

**版本管理：** `*.html`、`*.pdf` 已列入 **`.gitignore`**，应从 `newsletter_draft.md` 重新生成后本地使用。每期运行的 Markdown、流水线 JSON 产物，以及 `newsletter_runs/.../images/` 可纳入版本库。

**为何拆成多个智能体：** 单条超长提示词容易漂移（跳过验证、把打分和撰稿混在一起）。拆成多个智能体后，提示词更小、第一步可并行收集模型与产品线索、各步之间落盘 **可审计的 JSON**。改评分改 `rubric.json`，改文风改 `writer.md`，不必重写整份 SOP。

## 流水线

```
编排器 orchestrator  → run_header.md
收集器 collector     → raw_*_records.json    （模型 ‖ 产品 并行）
过滤 filter          → filtered_records.json
规范化 normalizer    → normalized_records.json
核验 verifier        → verified_records.json （信源 + Reddit 引语）
打分 scorer          → scored_records.json
分流 triage-editor    → triage_decisions.json
撰稿 writer           → newsletter_draft.md
质检 qa-reviewer      → 通过 或 退回修改（撰稿可循环）
发布 publisher        → ai_newsletter_weekly_YYYY-MM-DD.html
```

| 步骤 | 职责 |
|------|------|
| 0 | 划定本周范围、调度后续步骤、驱动质检闭环 |
| 1 | 分层收集：官方 → 技术信号 → 通讯 / 订阅 → 社区 |
| 2–3 | 闸门过滤 + 符合 schema 的结构化记录 |
| 4 | 核对官方表述；采集 Reddit 引语 |
| 5–6 | 按量表打分；主条 / 简讯 / 丢弃 + 多样性等规则 |
| 7–8 | 按 `output_template.md` 成稿；执行编辑质检清单 |
| 9 | 拉取配图；调用 `convert_to_pdf.py` 生成 HTML |

## 仓库结构

```
.claude/agents/          # 各子智能体提示词
skill/
  SKILL.md               # 权威 SOP（建议先读）
  DESIGN.md              # 视觉规范（v3）
  output_template.md     # 撰稿骨架
  rubric.json            # 闸门与打分维度
  record_schemas.json    # 步骤间 JSON 形状
  RUNBOOK.md, INSTALL.md, HEARTBEAT.sample.md
tools/convert_to_pdf.py  # Markdown → HTML 渲染
newsletter_runs/YYYY-MM-DD/   # 每期：草稿、JSON 链、图片等
requirements.txt
LICENSE
```

## 快速开始

1. 安装渲染脚本依赖：

   ```bash
   pip install -r requirements.txt
   ```

2. 在 **Claude Code**（或你已配置好的智能体界面）里生成一期，例如：

   - 自然语言：「按 newsletter SOP 跑本周周报。」
   - 或调用：`@newsletter-orchestrator`，意图同上。

3. 在 `newsletter_runs/<日期>/` 下查看输出：撰稿 Markdown、各步 JSON、发布步骤完成后的 HTML。

## 本地渲染与导出

在 **带日期的期号目录** 下执行：

```bash
cd newsletter_runs/YYYY-MM-DD
python ../../tools/convert_to_pdf.py
```

用浏览器打开 `ai_newsletter_weekly_YYYY-MM-DD.html`，**打印 → 另存为 PDF**。版式兼顾常见 A4 / Letter 打印。

## 视觉设计

颜色、字号、间距等 **设计令牌** 一律以 **`skill/DESIGN.md`** 为准；**`tools/convert_to_pdf.py`** 负责实现该规范。若要改观感，请先改 `DESIGN.md`，再改脚本。

## 自定义与扩展

| 想改什么 | 主要改这些文件 |
|----------|----------------|
| 信源与收集范围 | `skill/SKILL.md`（收集相关章节）+ `.claude/agents/collector.md` |
| 闸门与打分 | `skill/rubric.json` |
| 记录结构 | `skill/record_schemas.json` + `normalizer.md` |
| 章节结构与文风 | `skill/output_template.md` + `writer.md` |
| 质检规则 | `skill/SKILL.md` 第 8 步 + `qa-reviewer.md` |
| 版式与渲染 | `skill/DESIGN.md` + `tools/convert_to_pdf.py` |

**后续可做：** 每日 `HEARTBEAT` 信号累积进周报；单独「运维 / 成本」模块与量表；加强 Reddit / X 自动化；用 CI 对 fixture 跑干跑以发现 schema 漂移。

更细的流程说明见 **`skill/SKILL.md`**，安装与 OpenClaw 相关说明见 **`skill/INSTALL.md`**，紧凑执行备忘见 **`skill/RUNBOOK.md`**。

## 开源许可

[MIT](LICENSE)。
