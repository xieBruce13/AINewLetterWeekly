"""post_sync_patch.py — Apply all post-sync patches for 2026-05-06.

Run after every sync_to_db.py call that touches 2026-05-06:
  py tools/post_sync_patch.py

Does:
  1. Update total_score from triage_decisions.json
  2. Add Chinese content for items not covered by inject_zh.py
  3. Fix issue_summaries bullets with correct slugs
  4. Remove duplicate slugs (keep shorter/canonical slug)
"""
from __future__ import annotations
import json, os, re, sys
import psycopg2

sys.stdout.reconfigure(encoding="utf-8")

DB = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:fTjaIachqVRFfVXIXbkoGtsyjtEVcfZY@shuttle.proxy.rlwy.net:35509/railway",
)
ISSUE = "2026-05-06"
TRIAGE_PATH = f"newsletter_runs/{ISSUE}/triage_decisions.json"

conn = psycopg2.connect(DB)
conn.autocommit = True
cur = conn.cursor()

# ── 1. Update scores ──────────────────────────────────────────────────────────
with open(TRIAGE_PATH, encoding="utf-8") as f:
    triage = json.load(f)

score_map: dict[str, int] = {}
for mk in ("models", "products"):
    for tier in ("main", "brief", "dropped"):
        for item in triage.get(mk, {}).get(tier, []):
            name = item.get("name", "")
            score = item.get("score")
            if name and isinstance(score, (int, float)) and score > 0:
                score_map[name] = int(score)

updated_scores = 0
for name, score in score_map.items():
    cur.execute(
        "UPDATE news_items SET total_score=%s WHERE issue_date=%s AND name=%s",
        (score, ISSUE, name),
    )
    updated_scores += cur.rowcount

print(f"[1] Updated scores for {updated_scores} rows")

# ── 2. Missing Chinese patches ────────────────────────────────────────────────
extra_zh = {
    "DeepSeek V4": {
        "summary_zh": "1.6T 参数 MoE，仅需 V3.2 的 27% FLOPs，KV 缓存仅标准 GQA 的 2%；MIT 许可开源；HuggingFace + NVIDIA 双重验证效率突破真实有效。",
    },
    "Image AI Models Drive App Growth (Market Signal)": {
        "summary_zh": "Appfigures 数据：图像 AI 发布带动的 App 下载量是文本模型升级的 6.5 倍——图像功能驱动下载，但付费转化需要创意工作流场景。",
    },
    "Etsy ChatGPT App Integration": {
        "summary_zh": "Etsy 上线 ChatGPT App：用户在 ChatGPT 内直接搜索 Etsy 商品，标志 ChatGPT 向第三方电商应用平台演变——目前为 TechCrunch 单一来源报道。",
        "key_points_zh": "● ChatGPT 内置 Etsy 商品搜索，用户无需跳出 ChatGPT 即可浏览商品 ● 标志 ChatGPT 平台化趋势：从对话助手走向应用分发平台 ● 目前仅 TechCrunch 单一来源，等待独立确认",
        "scenarios_zh": "● 用户在 ChatGPT 对话中询问『帮我找一个手工制品礼物』，直接展示 Etsy 商品卡片 ● 创意从业者用 ChatGPT 寻找设计灵感同时浏览相关 Etsy 卖家",
    },
    "Airbyte Agents — Context Store + MCP": {
        "summary_zh": "Airbyte 推出 Context Store + MCP：单一 API 端点替代 5-6 个分散数据连接器，让智能体访问数据管道更稳定——目前仅公司自述，等待第三方覆盖确认。",
        "key_points_zh": "● Context Store：统一数据接入层，单端点替代 5-6 个 API 链，降低智能体数据访问的断点风险 ● MCP 集成：让 AI 智能体能稳定读取 Airbyte 管理的所有数据源 ● 仅公司自述，InfoQ/TechCrunch/HN 尚未跟进",
        "scenarios_zh": "● 工程师让智能体通过 MCP 直接查询 Airbyte 管理的数据仓库，无需为每个数据源写连接器 ● 数据团队用单端点替代 Snowflake + BigQuery + PostgreSQL 三个分散 API 调用",
    },
    "Airbyte — Rowboat AI Work App (Startup)": {
        "summary_zh": "Airbyte 旗下 Rowboat AI 工作应用：面向小团队的智能体化协作工具，整合 Airbyte 数据管道与 AI 工作流——早期产品，等待更多用户反馈。",
    },
    "Submit.DIY — AI Launch Platform for Indie Makers (Startup)": {
        "summary_zh": "Submit.DIY：AI 驱动的独立开发者产品发布平台，自动将新产品分发至 Product Hunt、Hacker News 等多个目录和社区，降低冷启动门槛。",
    },
}

patched = 0
for name, zh in extra_zh.items():
    headline = zh.get("summary_zh", "")
    cur.execute(
        "UPDATE news_items SET record=record||%s::jsonb, headline=CASE WHEN %s<>'' THEN %s ELSE headline END WHERE issue_date=%s AND name=%s",
        (json.dumps(zh, ensure_ascii=False), headline, headline, ISSUE, name),
    )
    patched += cur.rowcount

print(f"[2] Patched {patched} rows with extra Chinese content")

# ── 3. Fix issue_summaries bullets ────────────────────────────────────────────
CURSOR_SLUG = "2026-05-06-anysphere-cursor-cursor-3-x-agents-window-fleet-management-team-marke"

new_bullets = [
    {"text": "**Cursor 3.x Team Marketplace**：5月1-4日连发 Team Marketplace + 企业模型管控，AI IDE 正式成为可分发技能包的团队级代理舰队平台，$2B ARR 验证市场方向。", "slugs": [CURSOR_SLUG]},
    {"text": "**Claude Opus 4.7 基准 vs. 实战裂缝**：SWE-Bench 87.6% 历史最高，但 70% r/ClaudeAI 用户报告生产回退、token 消耗翻倍——本周最大模型选型陷阱。", "slugs": ["2026-05-06-anthropic-claude-opus-4-7"]},
    {"text": "**Mistral Medium 3.5 开源自托管**：128B 模型 4 块 GPU 可跑，SWE-Bench 77.6%，首次在消费级硬件规模实现前沿竞争力，自托管私有化部署路径打通。", "slugs": ["2026-05-06-mistral-ai-mistral-medium-3-5"]},
    {"text": "**GPT-5.5 智能体编码旗舰**：Terminal-Bench 2.0 以 82.7% 领先第二名 13+ 个百分点，同类幻觉减少 60%，长程自主任务效率大幅提升。", "slugs": ["2026-05-06-openai-gpt-5-5"]},
    {"text": "**ChatGPT 可审计记忆 + 全球 Sheets 集成**：2亿+ 用户可看见记忆来源并一键删除；Excel/Google Sheets 侧边栏全球 GA，AI 工作流首次原生嵌入电子表格。", "slugs": ["2026-05-06-openai-chatgpt-memory-sources-excel-sheets-integration"]},
    {"text": "**Adobe Firefly 60+ 工具编排**：AI Assistant 公开测试，单次对话驱动 Photoshop/Premiere/Lightroom 等 60+ Creative Cloud 应用——企业级创意智能体最大规模落地。", "slugs": ["2026-05-06-adobe-adobe-firefly-ai-assistant"]},
    {"text": "**图像 AI 商业信号**：Appfigures 数据显示图像类 AI 发布带动下载量是文本类的 6.5 倍；Midjourney V8.1 视频定价约为 Runway 的 1/25，创意工具成本基础被重写。", "slugs": ["2026-05-06-midjourney-midjourney-v8-1-alpha-image-video-expansion"]},
    {"text": "**xAI 60 秒声音克隆 $4.20/百万字符**：TTS 价格为 ElevenLabs 的 1/14 到 1/28，语音 AI 价格基础被打穿；Mistral Vibe 异步智能体同步上线，发出任务合上电脑即可离席。", "slugs": ["2026-05-06-xai-xai-grok-voice-think-fast-1-0-custom-voice-cloning", "2026-05-06-mistral-ai-mistral-vibe-remote-agents-le-chat-work-mode"]},
]

cur.execute(
    "UPDATE issue_summaries SET bullets=%s::jsonb WHERE issue_date=%s",
    (json.dumps(new_bullets, ensure_ascii=False), ISSUE),
)
print(f"[3] Updated issue_summaries: {cur.rowcount} rows, {len(new_bullets)} bullets")

# ── 4. Remove duplicate slugs ─────────────────────────────────────────────────
cur.execute("""
    SELECT company, name, issue_date, array_agg(slug ORDER BY length(slug) ASC) AS slugs
    FROM news_items
    WHERE issue_date = %s
    GROUP BY company, name, issue_date
    HAVING count(*) > 1
""", (ISSUE,))

removed = 0
for company, name, idate, slugs in cur.fetchall():
    for dup in slugs[1:]:
        cur.execute("DELETE FROM news_items WHERE slug=%s", (dup,))
        removed += cur.rowcount

print(f"[4] Removed {removed} duplicate rows")

# ── Summary ───────────────────────────────────────────────────────────────────
cur.execute("SELECT COUNT(*), SUM(CASE WHEN record->>'summary_zh' IS NOT NULL THEN 1 ELSE 0 END) FROM news_items WHERE issue_date=%s", (ISSUE,))
total, with_zh = cur.fetchone()
print(f"\n✓ {ISSUE}: {total} items, {with_zh} with Chinese content")

cur.execute("SELECT slug, total_score FROM news_items WHERE issue_date=%s ORDER BY total_score DESC LIMIT 6", (ISSUE,))
print("Top 6 by score:")
for slug, score in cur.fetchall():
    print(f"  [{score:3d}] {slug}")

conn.close()
