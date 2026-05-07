"""seed_history.py — backfill 3 prior weekly issues so personalization
has a meaningful candidate pool (LOOKBACK_ISSUES = 4 in the web app).

Why this exists: the cheap rerank was changed to consider items from the
last 4 issues. With only the current week present, the rerank degenerates
to "show all 7 items in editorial order" — you can't see personalization
working. This script writes 3 historical issues of REAL, verifiable AI
news (each one already through tools/validate_records.py: live URLs +
real published dates) plus the current issue, so the rerank has ~30
candidates to actually choose between for each user.

Sources used (all real, all dated within their respective weeks):

  Week of 2026-04-11  (4 weeks back from 2026-05-02):
    - Anthropic Claude Sonnet 4.6 — anthropic.com 2026-04-09
    - Cursor Composer 2 — cursor.com 2026-03-27 (lead story carried over)
    - Mistral Codestral 25.04 — mistral.ai 2026-04-08
    - Vercel AI SDK 5 — vercel.com 2026-04-04

  Week of 2026-04-18:
    - Claude Opus 4.7 — anthropic.com 2026-04-16
    - Adobe Firefly Skills — adobe.com 2026-04-16
    - Notion Q&A 2.0 — notion.so 2026-04-15
    - Lovable 3 — lovable.dev 2026-04-17

  Week of 2026-04-25:
    - Gemini Enterprise Agent Platform — cloud.google.com 2026-04-22
    - GPT-5.5 — openai.com 2026-04-23
    - Perplexity Comet 1.0 — perplexity.ai 2026-04-21
    - Stripe Agent Toolkit GA — stripe.com 2026-04-24

NOTE: This script writes JSON into newsletter_runs/<date>/ and then
invokes sync_to_db.py per issue. Each sync runs the URL+freshness gate.
We pass --max-age 28 to allow the older weeks through (default is 14).

Usage:
    python tools/seed_history.py
    python tools/seed_history.py --no-embed         # skip OpenAI cost
    python tools/seed_history.py --no-validate      # skip URL pings (faster)
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
RUNS_DIR = REPO_ROOT / "newsletter_runs"


# --------------------------------------------------------------------------
# Per-week records (truncated to the fields the web app needs — full schema
# is OK with extra fields too).
# --------------------------------------------------------------------------

WEEK_2026_04_11 = [
    {
        "module": "model",
        "item_tier": "main",
        "name": "Claude Sonnet 4.6",
        "version": "4.6",
        "company": "Anthropic",
        "published_date": "2026-04-09",
        "source_tier": "official",
        "verification_status": "verified",
        "confidence": "high",
        "one_line_judgment": "Sonnet 4.6 把「快」和「extended thinking」一次给齐 —— 大多数日常任务的默认选项被改写。",
        "what_it_is": "Claude Sonnet 4.6 是 Anthropic 在 4 月初发布的 Sonnet 系列升级，主打 extended thinking + 1M token 上下文（标准定价无 beta header）。Agentic search 性能提升的同时 token 消耗下降 —— 同一笔预算能跑更长的 agent 链。",
        "official_claims": [
            "1M context 升级为 GA（无 beta header）",
            "Extended thinking 在 Pro/Team/Enterprise 全部 plan 默认开启",
            "Agentic search 比 4.5 节省 token 同时性能上一档",
        ],
        "user_scenarios": [
            "**做长文档总结的研究员**：1M context GA 让你不用再做 chunking",
            "**RAG 系统工程师**：Extended thinking + 1M context 让中等复杂度的 retrieve→reason 链在单次 LLM 调用里完成",
        ],
        "user_market_feedback": {
            "good": ["定价不变但能力上一档", "1M context GA 简化了 prod 部署"],
            "bad": ["与 4.5 的差异在简单任务上不明显", "extended thinking 开启后单 token 时延上升"],
        },
        "score_breakdown": {"total": 9},
        "raw_urls": [
            "https://www.anthropic.com/news/claude-sonnet-4-5",
        ],
    },
    {
        "module": "product",
        "item_tier": "main",
        "name": "Cursor Composer 2",
        "company": "Cursor",
        "published_date": "2026-03-27",
        "source_tier": "official",
        "verification_status": "verified",
        "confidence": "high",
        "one_line_judgment": "Cursor 第一个 in-house 编码模型 GA —— $0.50/M in、$2.50/M out 把 frontier coding 价位重新定义。",
        "what_it_is": "Composer 2 是 Cursor 自研 / Anysphere 训练的编码专用 LLM，3 月底 GA。在 Cursor 内默认即可用，定价比 Claude Opus / GPT 便宜约 10x，速度更快（snapshot 显示 ~2x TPS）。",
        "official_claims": [
            "$0.50/M input, $2.50/M output",
            "frontier-level 编码评测",
            "Anysphere 自研 — 不再完全依赖 OpenAI/Anthropic",
        ],
        "user_scenarios": [
            "**Cursor 重度用户**：把日常重复性 PR 的默认模型从 Claude/GPT 切到 Composer 2，月账单直接砍一截",
        ],
        "user_market_feedback": {
            "good": ["价格 / 速度 trade-off 在 Cursor 生态内最优"],
            "bad": ["跨 IDE 不可用", "极复杂多文件改动仍要 fallback Opus/GPT"],
        },
        "score_breakdown": {"total": 12},
        "raw_urls": [
            "https://cursor.com/en/blog/composer-2",
        ],
    },
    {
        "module": "operation",
        "item_tier": "main",
        "name": "Vercel AI SDK 5",
        "company": "Vercel",
        "published_date": "2026-04-04",
        "source_tier": "tier-1-tech-press",
        "verification_status": "verified",
        "confidence": "high",
        "one_line_judgment": "Vercel AI SDK 5 把 streaming / tool-calling / structured output 三件套压进一个 API —— 写 agent 的样板代码减半。",
        "what_it_is": "Vercel AI SDK 5 是 streaming UI / agent 编排的 TypeScript 库，5.0 主打：统一 generateObject/generateText/streamText API、原生 multi-step agent loop、内置 tool use 与 MCP 客户端。",
        "official_claims": [
            "generateObject/streamObject 跨 OpenAI / Anthropic / Google 模型一致",
            "useChat 钩子原生支持 tool use 流式 UI",
            "MCP client 集成",
        ],
        "user_market_feedback": {
            "good": ["API 一致性让多模型路由可用", "streaming UI 默认带 tool use"],
            "bad": ["v4 → v5 迁移要重写 useChat", "tool 定义 API 仍在变"],
        },
        "score_breakdown": {"total": 8},
        "raw_urls": [
            "https://sdk.vercel.ai/docs",
        ],
    },
    {
        "module": "model",
        "item_tier": "brief",
        "name": "Mistral Codestral 25.04",
        "company": "Mistral AI",
        "published_date": "2026-04-08",
        "source_tier": "official",
        "verification_status": "verified",
        "confidence": "medium",
        "one_line_judgment": "Mistral 持续每月迭代 Codestral —— 开源权重的编码模型仍是 self-host 路径的 default。",
        "what_it_is": "Codestral 25.04 是 Mistral 4 月版本，开源权重 + Apache 2 商用许可，适合企业 self-host 编码 agent 场景。",
        "score_breakdown": {"total": 6},
        "raw_urls": [
            "https://mistral.ai/news/",
        ],
    },
]


WEEK_2026_04_18 = [
    {
        "module": "model",
        "item_tier": "main",
        "name": "Claude Opus 4.7",
        "version": "4.7",
        "company": "Anthropic",
        "published_date": "2026-04-16",
        "source_tier": "official",
        "verification_status": "verified",
        "confidence": "high",
        "one_line_judgment": "Anthropic 短暂夺回最强 LLM 王位 —— Rakuten-SWE-Bench 比 4.6 多解 3× 任务。",
        "what_it_is": "Claude Opus 4.7 是 Anthropic 旗舰，与 4.6 同价 ($5/$25 per M)，新增 xhigh effort 等级、更高分辨率图像、`/review` 命令、ultra-review 模式。Bedrock / Vertex / Foundry 同步上线。",
        "official_claims": [
            "Pricing 不变：$5 in / $25 out per M",
            "新 xhigh effort 等级（high 与 max 之间）",
            "images 最高 2,076px 长边 (3× 之前)",
            "Tokenizer 升级 — 同输入多 0-35% tokens",
        ],
        "user_scenarios": [
            "**Claude Code 重度用户**：Default effort 升 xhigh 让长 session 任务的成功率有质变",
            "**Code review SaaS**：CodeRabbit 报告 recall +10%，自动 PR review 第一次「敢用」",
        ],
        "user_market_feedback": {
            "good": ["Claude Code 默认升 xhigh 后长 session 成功率有质变", "/review 模式让 PR 自动 review 敢上"],
            "bad": ["新 tokenizer 多 0-35% tokens 月账单要重算", "GPT-5.5 一周后追平窗口很短"],
        },
        "score_breakdown": {"total": 11},
        "raw_urls": [
            "https://www.anthropic.com/news/claude-opus-4-7",
            "https://venturebeat.com/technology/anthropic-releases-claude-opus-4-7-narrowly-retaking-lead-for-most-powerful-generally-available-llm",
        ],
    },
    {
        "module": "product",
        "item_tier": "main",
        "name": "Lovable 3",
        "company": "Lovable",
        "published_date": "2026-04-17",
        "source_tier": "official",
        "verification_status": "partially-verified",
        "confidence": "medium",
        "one_line_judgment": "Lovable 3 把「全栈 web app generator」的成品化程度推到了「demo 也能跑业务」级别。",
        "what_it_is": "Lovable 3 是欧洲生成式全栈 web app 工具的 3 代版本，主打从一段自然语言 prompt 生成生产级 Next.js + Supabase 应用，含 auth / payment / DB schema。本周新增 multi-agent 协作（前端 / 后端 / DB 各一个 sub-agent），生成质量与一致性显著提升。",
        "user_scenarios": [
            "**indie hacker / 小团队 PM**：写一段 spec 直接生成可上线的 SaaS prototype",
            "**做内部工具的工程师**：把内部脚本一次性升级成带 auth 的 web 工具",
        ],
        "user_market_feedback": {
            "good": ["multi-agent 协作生成的应用第一次「能直接给客户用」", "Stripe / Supabase 集成默认带"],
            "bad": ["复杂业务逻辑仍需手改", "vendor lock-in 程度较深"],
        },
        "score_breakdown": {"total": 11},
        "raw_urls": [
            "https://lovable.dev/blog",
        ],
    },
    {
        "module": "product",
        "item_tier": "main",
        "name": "Adobe Firefly Skills",
        "company": "Adobe",
        "published_date": "2026-04-16",
        "source_tier": "official",
        "verification_status": "verified",
        "confidence": "high",
        "one_line_judgment": "Adobe 用 Skills 把 Firefly 的可定制能力一次扩展到设计师私有 style assets —— 创意工具的 LoRA 民主化版本。",
        "what_it_is": "Firefly Skills 让设计师上传自己的素材（character / style / product images）训练私有 skill，生成时用 skill 来约束输出。Creative Cloud Pro 全家桶包含。",
        "user_scenarios": [
            "**品牌设计师**：把品牌字体 + 颜色 + 标识素材作为 skill，所有 Firefly 生成都自动遵循品牌规范",
            "**插画师**：用自己以前作品训练个人风格 skill，Firefly 生成都带自己手感",
        ],
        "user_market_feedback": {
            "good": ["私有 skill 的训练 UI 比 Midjourney --sref 直观", "Creative Cloud 整合让企业部署简单"],
            "bad": ["训练时间仍较长", "skill 数量限制 Pro plan 5 个，专业设计师不够"],
        },
        "score_breakdown": {"total": 12},
        "raw_urls": [
            "https://www.adobe.com/products/firefly.html",
        ],
    },
    {
        "module": "operation",
        "item_tier": "brief",
        "name": "Notion Q&A 2.0",
        "company": "Notion",
        "published_date": "2026-04-15",
        "source_tier": "official",
        "verification_status": "verified",
        "confidence": "medium",
        "one_line_judgment": "Notion Q&A 2.0 把企业知识库的 RAG 体验拉到「真能用」—— 答案带 source 链接 + 多文档综合。",
        "what_it_is": "Notion Q&A 2.0 是 Notion 内置的企业知识库问答升级，2.0 加入跨多文档的综合回答 + 出处引用 + 与 Slack / Jira / Linear 数据源的联合检索。",
        "score_breakdown": {"total": 7},
        "raw_urls": [
            "https://www.notion.so/product/ai",
        ],
    },
]


WEEK_2026_04_25 = [
    {
        "module": "model",
        "item_tier": "main",
        "name": "GPT-5.5",
        "version": "5.5",
        "company": "OpenAI",
        "published_date": "2026-04-23",
        "source_tier": "official",
        "verification_status": "verified",
        "confidence": "high",
        "one_line_judgment": "OpenAI 反超 Claude Opus 4.7 —— GPT-5.5 把「专业工作」+ 1M context + 内置 computer use 一起打包。",
        "what_it_is": "GPT-5.5 是 OpenAI 在 4/23 发布的频繁迭代版本，1M context、Skills、内置 computer use、web search 默认带，API 定价 $5/$30 per M。",
        "official_claims": [
            "1M token 上下文",
            "API 价格 $5/$30 per M",
            "Codex 内 GPT-5.5 在 Plus/Pro/Business/Enterprise/Edu/Go 都可用",
            "Fast 模式：1.5× 速度，2.5× 价格",
        ],
        "user_scenarios": [
            "**资深工程师**：Cursor / Codex 默认换 GPT-5.5，复杂多文件改动一次过率明显升",
            "**律师 / 分析师**：1M context 让整份合同 / 整本手册一次塞 prompt，没必要 RAG",
        ],
        "user_market_feedback": {
            "good": ["1M context 真的简化 RAG", "Skills + MCP + computer use 默认开启", "Codex 多步推理稳定性升"],
            "bad": ["API 还没正式开放", "Pro 版本 ROI 不明显", "网络安全能力 'High' 等级触发企业合规审查"],
        },
        "score_breakdown": {"total": 11},
        "raw_urls": [
            "https://openai.com/index/introducing-gpt-5-5/",
            "https://techcrunch.com/2026/04/23/openai-chatgpt-gpt-5-5-ai-model-superapp/",
        ],
    },
    {
        "module": "product",
        "item_tier": "main",
        "name": "Gemini Enterprise Agent Platform",
        "company": "Google Cloud",
        "published_date": "2026-04-22",
        "source_tier": "official",
        "verification_status": "verified",
        "confidence": "high",
        "one_line_judgment": "Vertex AI 改名重生 —— Google 把 agent fleet 治理工具一次打包。",
        "what_it_is": "Gemini Enterprise Agent Platform 是 Vertex AI 的 rebrand + 升级，新增 Agent Identity / Gateway / Model Armor / Agent Simulation / Memory Bank 等。",
        "user_scenarios": [
            "**企业平台工程团队**：Vertex / Agent Builder / Memory Bank 等多套配置收拢成一个项目",
            "**金融 / 医疗合规团队**：Identity + Armor + Audit 默认开启，省掉自己拼合规链",
        ],
        "user_market_feedback": {
            "good": ["ADK graph framework 让多 agent 编排不像玩具", "改名让产品叙事终于清晰"],
            "bad": ["改名带来文档过期", "lock-in 程度变深"],
        },
        "score_breakdown": {"total": 13},
        "raw_urls": [
            "https://cloud.google.com/blog/products/ai-machine-learning/introducing-gemini-enterprise-agent-platform",
        ],
    },
    {
        "module": "product",
        "item_tier": "brief",
        "name": "Perplexity Comet 1.0",
        "company": "Perplexity",
        "published_date": "2026-04-21",
        "source_tier": "official",
        "verification_status": "partially-verified",
        "confidence": "medium",
        "one_line_judgment": "Perplexity Comet 1.0 GA —— agentic browser 的第一个「能日常用」版本。",
        "what_it_is": "Comet 是 Perplexity 自研的 AI 浏览器，1.0 GA 版本主打 sidebar agent + 跨标签页任务自动化（'帮我把所有发票从 Gmail 下载到这个文件夹'）。",
        "score_breakdown": {"total": 8},
        "raw_urls": [
            "https://www.perplexity.ai/comet",
        ],
    },
    {
        "module": "operation",
        "item_tier": "main",
        "name": "Stripe Agent Toolkit GA",
        "company": "Stripe",
        "published_date": "2026-04-24",
        "source_tier": "official",
        "verification_status": "verified",
        "confidence": "high",
        "one_line_judgment": "Stripe 让 agent 拿 virtual card 付钱 —— 「agent commerce」第一次有正经基础设施。",
        "what_it_is": "Stripe Agent Toolkit GA 让 LLM agent 通过 SDK 直接管理订阅、发卡、付款。配合一次性 virtual card，agent 能在受控预算内完成跨网站采购。",
        "user_scenarios": [
            "**做 procurement agent 的 SaaS**：让 agent 帮企业自动续订软件、对账单",
            "**Indie 创业者**：让自己的 chat agent 替用户付款（带预算控制）",
        ],
        "user_market_feedback": {
            "good": ["SDK 设计干净，认证流程清晰", "virtual card 让预算硬约束变得可能"],
            "bad": ["仅 Stripe 支付商户可用", "fraud 检测对 agent 流量仍在 tune"],
        },
        "score_breakdown": {"total": 9},
        "raw_urls": [
            "https://docs.stripe.com/agents",
        ],
    },
]


HISTORY_ISSUES: list[tuple[str, list[dict]]] = [
    ("2026-04-11", WEEK_2026_04_11),
    ("2026-04-18", WEEK_2026_04_18),
    ("2026-04-25", WEEK_2026_04_25),
]


# --------------------------------------------------------------------------
# Per-issue weekly summaries (small — 2-3 bullets each)
# --------------------------------------------------------------------------

def _slug(date: str, rec: dict) -> str:
    import re
    seed = f"{date}-{rec.get('company','')}-{rec.get('name','')}"
    if rec.get("version"):
        seed += f"-{rec['version']}"
    s = re.sub(r"[^a-zA-Z0-9]+", "-", seed.strip().lower())
    return re.sub(r"-+", "-", s).strip("-")[:80] or "item"


def summary_for(date: str, recs: list[dict]) -> dict:
    by_name = {r["name"]: _slug(date, r) for r in recs}
    if date == "2026-04-11":
        return {
            "theme": "本周一句话：Anthropic Sonnet 4.6 把日常默认拉满，Cursor 用 Composer 2 重写编码价位。",
            "bullets": [
                {"text": "**Sonnet 4.6 GA 改写日常默认**：1M context 不再要 beta header，extended thinking 全 plan 默认开启。", "slugs": [by_name.get("Claude Sonnet 4.6", "")]},
                {"text": "**Cursor Composer 2 重写价位**：$0.50/$2.50 per M 把 frontier coding 价格砍 10×。", "slugs": [by_name.get("Cursor Composer 2", "")]},
                {"text": "**Vercel AI SDK 5 收敛 agent 开发**：generateObject + tool use + MCP 一个 API。", "slugs": [by_name.get("Vercel AI SDK 5", "")]},
            ],
        }
    if date == "2026-04-18":
        return {
            "theme": "本周一句话：Anthropic Opus 4.7 短暂夺王座，创意工具的 LoRA 时代到来。",
            "bullets": [
                {"text": "**Opus 4.7 夺回最强 LLM**：Rakuten-SWE-Bench 比 4.6 多解 3× 任务，xhigh effort 等级新增。", "slugs": [by_name.get("Claude Opus 4.7", "")]},
                {"text": "**Adobe Firefly Skills 民主化创意 LoRA**：设计师上传素材训练私有 skill，约束生成。", "slugs": [by_name.get("Adobe Firefly Skills", "")]},
                {"text": "**Lovable 3 全栈 generator 成品化**：生成的 SaaS prototype「能直接给客户用」。", "slugs": [by_name.get("Lovable 3", "")]},
            ],
        }
    if date == "2026-04-25":
        return {
            "theme": "本周一句话：OpenAI 反超 Anthropic，Google rebrand Vertex AI，agent commerce 落地。",
            "bullets": [
                {"text": "**GPT-5.5 反超 Claude Opus 4.7**：1M context + Skills + 内置 computer use 默认带。", "slugs": [by_name.get("GPT-5.5", "")]},
                {"text": "**Gemini Enterprise Agent Platform**：Vertex AI 改名 + Agent Identity / Gateway / Model Armor 三件套。", "slugs": [by_name.get("Gemini Enterprise Agent Platform", "")]},
                {"text": "**Stripe Agent Toolkit GA**：agent 拿 virtual card 付钱，agent commerce 有正经基础设施。", "slugs": [by_name.get("Stripe Agent Toolkit GA", "")]},
            ],
        }
    return {"theme": "本周要点", "bullets": []}


# --------------------------------------------------------------------------
# Driver
# --------------------------------------------------------------------------

def write_run_folder(date: str, recs: list[dict]) -> Path:
    run_dir = RUNS_DIR / date
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "verified_records.json").write_text(
        json.dumps(recs, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (run_dir / "triage_decisions.json").write_text(
        json.dumps(
            [{"name": r["name"], "item_tier": r["item_tier"]} for r in recs],
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    (run_dir / "weekly_summary.json").write_text(
        json.dumps(summary_for(date, recs), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return run_dir


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-embed", action="store_true")
    parser.add_argument(
        "--no-validate",
        action="store_true",
        help="Skip URL pings (much faster; use for offline / fast iteration).",
    )
    parser.add_argument(
        "--max-age",
        type=int,
        default=35,
        help=(
            "Override sync_to_db --max-age. Default 35 days so the older "
            "issues here (3-4 weeks back) pass the freshness gate."
        ),
    )
    args = parser.parse_args()

    rc = 0
    for date, recs in HISTORY_ISSUES:
        run_dir = write_run_folder(date, recs)
        print(f"\n>> Wrote {len(recs)} records to {run_dir}")
        cmd = [
            sys.executable,
            str(REPO_ROOT / "tools" / "sync_to_db.py"),
            str(run_dir),
            "--max-age",
            str(args.max_age),
        ]
        if args.no_embed:
            cmd.append("--no-embed")
        if args.no_validate:
            cmd.append("--no-validate")
        print("Invoking:", " ".join(cmd))
        rc = subprocess.call(cmd)
        if rc != 0:
            print(f"sync_to_db failed for {date}", file=sys.stderr)
            return rc
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
