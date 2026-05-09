import Link from "next/link";
import { sqlClient } from "@/lib/db/client";

export const revalidate = 0;

export const metadata = {
  title: "如何运作 · ZenoNews",
  description:
    "ZenoNews 的编辑机制、网站个性化、信源范围及 OpenAI 侧成本测算说明。",
};

export default async function AboutPage() {
  const stats = await loadStats();

  return (
    <article className="bg-claude-canvas dark:bg-claude-dark">
      <div className="container-tight py-12 sm:py-20">
        {/* ── Header ── */}
        <div className="text-[12px] font-medium uppercase tracking-uc text-claude-coral">
          如何运作
        </div>
        <h1 className="mt-4 max-w-3xl font-display text-[40px] leading-[1.1] tracking-display text-claude-ink dark:text-white sm:text-[52px]">
          ZenoNews{" "}
          <span className="text-claude-coral">产品说明（PRD）</span>
        </h1>
        <p className="mt-5 max-w-3xl text-[18px] leading-[1.6] text-claude-body dark:text-white/80">
          描述编辑机制、网站个性化、信源范围及 OpenAI 侧成本测算假设，供内部评审与对外说明引用。
        </p>

        <StatStrip stats={stats} />

        {/* ══════════════════════════════════════
            1 文档控制
        ══════════════════════════════════════ */}
        <Section title="1 文档控制">
          <Table
            headers={["项", "内容"]}
            rows={[
              ["文档目的", "对齐编辑流水线、网站个性化、信源范围与模型/成本假设。"],
              [
                "适用范围",
                "仓库内 skill/ SOP、.claude/agents/、tools/ 抓取管线、web/ 阅读站。",
              ],
              [
                "权威与冲突处理",
                "成稿结构与编辑规则以 skill/SKILL.md 为准；RSS 等可配置抓取清单以 tools/sources.yaml 为准。正文信源表与 YAML 同步维护。",
              ],
            ]}
          />
        </Section>

        {/* ══════════════════════════════════════
            2 编辑与发布机制
        ══════════════════════════════════════ */}
        <Section title="2 编辑与发布机制">

          <SubSection title="2.1 周报与编辑部（Zeno）">
            <p className="mb-4 font-medium">默认范围（可被 Step 0 覆盖）</p>
            <Table
              headers={["参数", "默认值"]}
              rows={[
                ["时间窗", "最近 7 天（截止「当前运行时刻」）"],
                ["模块", "models + products"],
                ["语言", "与用户请求一致；中文请求默认中文成稿"],
                ["主条目数量", "每模块约 top 3（密集周可放宽至 5，见 SKILL）"],
              ]}
            />
            <p className="mt-5 mb-2 font-medium">成稿结构（固定顺序）</p>
            <p className="text-claude-body dark:text-white/80">
              本周结论 → 模型模块 → 产品模块 → 本期初创聚焦 → 简讯（两列表格）→ 编辑部判断 → 参考来源。篇幅目标 6–8 页 PDF。
            </p>
            <p className="mt-5 mb-2 font-medium">取舍规则（摘录）</p>
            <ul className="space-y-2">
              <Bullet>
                模型主条：评分阈值与维度见{" "}<Code>skill/rubric.json</Code>；主文门槛含「可核对的一手/技术源」。
              </Bullet>
              <Bullet>
                产品主条：需用户可感知发布 + 多源印证（见 SKILL Gate）。
              </Bullet>
              <Bullet>
                结构性：公司多样性上限；每期至少 1 条非八大厂初创/独立产品（定义见 SKILL）。
              </Bullet>
            </ul>
          </SubSection>

          <SubSection title="2.2 网站个性化">
            <Table
              headers={["步骤", "行为", "数据来源"]}
              rows={[
                ["画像", "角色、公司、当前项目、focus_topics[]、dislikes[]", "user_profiles"],
                [
                  "候选池",
                  "标签重叠、向量相似、跨期刊、LOOKBACK_ISSUES = 4",
                  "news_items、embedding",
                ],
                [
                  "精排文案",
                  "为 Top N 生成 personalized blurb / reason；缺 OPENAI_API_KEY 时用稿件字段降级",
                  "web/lib/personalization/rerank.ts",
                ],
                ["聊天", "流式回复 + 可选新闻检索工具", "web/app/api/chat/route.ts"],
                [
                  "长期记忆",
                  "从对话抽取事实写入记忆表",
                  "web/lib/agent/memory.ts",
                ],
              ]}
            />
          </SubSection>
        </Section>

        {/* ══════════════════════════════════════
            3 更新频率与时间范围
        ══════════════════════════════════════ */}
        <Section title="3 更新频率与时间范围">
          <Table
            headers={["项", "定义"]}
            rows={[
              ["周报素材窗", "默认 7 天；每期 Step 0 写入 run_header 可改。"],
              [
                "个性化回看",
                "约 4 期 × 每期刊内条目，用于跨期对比（非「只显示第 4 期」）。",
              ],
              [
                "入库新鲜度",
                "由 P2 抓取频率与 sync_to_db 运行时刻决定；无内置 cron 强制日更。",
              ],
              ["站外 digest", "配置为每周一次触发（与部署平台上 cron 一致）。"],
            ]}
          />
        </Section>

        {/* ══════════════════════════════════════
            4 数据来源
        ══════════════════════════════════════ */}
        <Section title="4 数据来源">
          <p className="mb-6 text-claude-body dark:text-white/80">
            分四块：<strong>RSS/Atom（YAML）</strong>、<strong>Reddit</strong>、<strong>Hacker News</strong>、<strong>深度刊补充（Newsletter / YC / Product Hunt 等）</strong>；配图单独一小节。
          </p>

          {/* 4.1 RSS/Atom */}
          <SubSection title="4.1 RSS/Atom（tools/sources.yaml）">
            <p className="mb-4 text-claude-muted text-[14px]">
              图例 — <Code>tier</Code>：<Code>official</Code> 官方站点 / <Code>press</Code> 科技媒体；
              <Code>module</Code>：管线侧默认归类，实际仍以正文分类为准。
            </p>

            <SubSubSection title="A1 官方 — 模型实验室与基础设施（20）">
              <Table
                headers={["名称", "Feed URL"]}
                compact
                rows={[
                  ["OpenAI Blog", "openai.com/blog/rss/"],
                  ["Anthropic News", "anthropic.com/news/rss.xml"],
                  ["Google DeepMind", "deepmind.google/blog/feed/basic/"],
                  ["Google AI Blog", "blog.google/technology/ai/rss/"],
                  ["Meta AI Blog", "ai.meta.com/blog/rss/"],
                  ["Mistral AI News", "mistral.ai/news/rss.xml"],
                  ["HuggingFace Blog", "huggingface.co/blog/feed.xml"],
                  ["Cohere Blog", "cohere.com/blog/rss"],
                  ["xAI News", "x.ai/news/rss"],
                  ["Stability AI Blog", "stability.ai/news/rss.xml"],
                  ["Together AI Blog", "together.ai/blog/rss.xml"],
                  ["Groq Blog", "groq.com/blog/rss.xml"],
                  ["Cerebras Blog", "cerebras.net/blog/rss.xml"],
                  ["Perplexity Blog", "blog.perplexity.ai/rss"],
                  ["Scale AI Blog", "scale.com/blog/rss.xml"],
                  ["AWS Machine Learning Blog", "aws.amazon.com/blogs/machine-learning/feed/"],
                  ["Microsoft AI Blog", "blogs.microsoft.com/ai/feed/"],
                  ["NVIDIA AI Blog", "blogs.nvidia.com/feed/"],
                  ["Allen Institute AI", "allenai.org/blog/rss.xml"],
                  ["Qwen Blog (Alibaba)", "qwenlm.github.io/feed.xml"],
                ]}
              />
            </SubSubSection>

            <SubSubSection title="A2 官方 — 创作 / 图像 / 视频 / 设计（13）">
              <Table
                headers={["名称", "Feed URL"]}
                compact
                rows={[
                  ["Luma AI Blog", "lumalabs.ai/blog/rss.xml"],
                  ["Runway Blog", "runwayml.com/blog/rss.xml"],
                  ["Runway Research", "research.runwayml.com/feed.xml"],
                  ["Pika Blog", "pika.art/blog/rss.xml"],
                  ["Midjourney Updates", "updates.midjourney.com/rss.xml"],
                  ["Adobe Blog AI", "blog.adobe.com/en/topics/ai-ml/feed"],
                  ["Figma Blog", "figma.com/blog/rss.xml"],
                  ["Canva Newsroom", "canva.com/newsroom/rss.xml"],
                  ["ElevenLabs Blog", "elevenlabs.io/blog/rss.xml"],
                  ["Suno Blog", "suno.com/blog/rss.xml"],
                  ["Udio Blog", "udio.com/blog/rss.xml"],
                  ["Krea AI Blog", "krea.ai/blog/rss.xml"],
                  ["Kling AI Blog", "klingai.com/blog/rss.xml"],
                ]}
              />
            </SubSubSection>

            <SubSubSection title="A3 官方 — 编程 / Agent / 开发者工具（10）">
              <Table
                headers={["名称", "Feed URL"]}
                compact
                rows={[
                  ["Cursor Changelog", "cursor.com/changelog/rss.xml"],
                  ["GitHub Blog AI", "github.blog/ai-and-ml/feed/"],
                  ["Vercel Blog", "vercel.com/blog/rss.xml"],
                  ["LangChain Blog", "blog.langchain.dev/rss/"],
                  ["LlamaIndex Blog", "llamaindex.ai/blog/rss.xml"],
                  ["Replit Blog", "blog.replit.com/rss"],
                  ["Codeium (Windsurf) Blog", "codeium.com/blog/rss.xml"],
                  ["Linear Blog", "linear.app/blog/rss.xml"],
                  ["Notion Blog", "notion.com/blog/rss.xml"],
                  ["Weights & Biases Blog", "wandb.ai/fully-connected/rss.xml"],
                ]}
              />
            </SubSubSection>

            <SubSubSection title="A4 科技媒体 — press（12）">
              <Table
                headers={["名称", "Feed URL"]}
                compact
                rows={[
                  ["TechCrunch AI", "techcrunch.com/category/artificial-intelligence/feed/"],
                  ["VentureBeat AI", "venturebeat.com/ai/feed/"],
                  ["The Verge AI", "theverge.com/ai-artificial-intelligence/rss/index.xml"],
                  ["Ars Technica Technology", "feeds.arstechnica.com/arstechnica/technology-lab"],
                  ["Wired AI", "wired.com/feed/tag/ai/latest/rss"],
                  ["MIT Technology Review", "technologyreview.com/feed/"],
                  ["9to5Mac AI", "9to5mac.com/guides/artificial-intelligence/feed/"],
                  ["The Information", "theinformation.com/feed"],
                  ["CNBC Technology", "cnbc.com/id/19854910/device/rss/rss.html"],
                  ["Fortune Technology", "fortune.com/section/technology/feed/"],
                  ["ZDNet AI", "zdnet.com/topic/artificial-intelligence/rss.xml"],
                  ["IEEE Spectrum AI", "spectrum.ieee.org/feeds/blog/artificial-intelligence.rss"],
                ]}
              />
            </SubSubSection>

            <Aside>
              <strong>RSS 小计（当前 active）</strong> — 官方 42 + 媒体 12 = <strong>54 条 Feed</strong>。
            </Aside>
          </SubSection>

          {/* 4.2 Reddit */}
          <SubSection title="4.2 Reddit（reddit_sources）">
            <Table
              headers={["r/", "模块倾向", "备注"]}
              rows={[
                ["MachineLearning", "model", "论文与研究讨论"],
                ["LocalLLaMA", "model", "开源权重与本地推理"],
                ["singularity", "—", "综合"],
                ["artificial", "—", "综合"],
                ["ChatGPT", "product", ""],
                ["ClaudeAI", "product", ""],
                ["StableDiffusion", "product", "图像"],
                ["midjourney", "product", ""],
                ["aivideo", "product", ""],
                ["AIArt", "product", ""],
                ["ChatGPTPromptEngineering", "product", "工作流/提示"],
              ]}
            />
            <p className="mt-3 text-[14px] text-claude-muted">
              当前关闭（active: false）— <Code>Bing</Code>、<Code>SoftwareEngineering</Code>：保留在 YAML 中但不抓取。
            </p>
          </SubSection>

          {/* 4.3 Hacker News */}
          <SubSection title="4.3 Hacker News（hacker_news）">
            <Table
              headers={["参数", "值"]}
              rows={[
                ["启用", "enabled: true"],
                ["扫描条数", "前 max_stories: 500 条故事"],
                ["最低分数", "min_score: 50"],
                [
                  "匹配方式",
                  "标题命中关键词列表（含 gpt、claude、llm、openai、anthropic、gemini、diffusion、cursor、copilot、agent 等，全文见 tools/sources.yaml 第 440–503 行）",
                ],
              ]}
            />
          </SubSection>

          {/* 4.4 Newsletter / YC / Product Hunt */}
          <SubSection title="4.4 Newsletter、YC、Product Hunt 与 SOP 补充">
            <p className="mb-4 text-claude-body dark:text-white/80">
              自动化抓取以 <strong>4.1–4.3</strong> 为准；下表为 <strong>SKILL 与行业常用信息源</strong>，由编辑或多智能体步骤按需浏览；未接入 RSS 时需手工补。
            </p>

            <SubSubSection title="C1 — Newsletter（英文行业简报，作 Tier 3 / 线索补漏，不替代一手公告）">
              <Table
                headers={["名称", "侧重", "常见入口"]}
                rows={[
                  ["TLDR AI", "日更 headline，覆盖面广", "tldr.tech"],
                  ["Import AI", "周更，偏研究与产业解读", "Substack「Import AI」"],
                  ["The Rundown AI", "综合 AI / 商业", "therundown.ai"],
                  ["Ben's Bites", "产品、创业、小工具", "bensbites.co"],
                  ["Superhuman AI", "工具上手与速递", "读者订阅信/官网"],
                  ["AI Breakfast", "每日简报", "独立 newsletter"],
                  ["AI Valley Newsletter", "工具与创业信号", "newsletter 订阅"],
                  ["Last Week in AI", "周更汇总类", "独立/Substack"],
                  ["AlphaSignal 等", "论文/模型速递", "按需订阅"],
                ]}
              />
              <Note>
                SKILL 中模型 Tier3 固定点名：<strong>Import AI、TLDR AI、The Rundown AI</strong>；产品 Tier3 在上述基础上还含 <strong>Ben&apos;s Bites、Superhuman AI、AI Breakfast、AI Valley</strong> 等，与 TechCrunch / The Verge / WIRED / VentureBeat 等媒体报道叠加使用（Verge、TechCrunch 等已部分覆盖于 <strong>4.1 A4</strong> RSS）。
              </Note>
            </SubSubSection>

            <SubSubSection title="C2 — Y Combinator、Product Hunt、工具聚合">
              <Table
                headers={["类型", "用途", "入口/用法"]}
                rows={[
                  ["Y Combinator", "筛 AI 标签公司、批次名单、官网/changelog", "ycombinator.com/companies（行业筛 AI、阶段筛）"],
                  ["Product Hunt", "当日/当周 AI 类 Launch、评论与热度", "producthunt.com · Topics: Artificial Intelligence"],
                  ["Futurepedia", "工具库、分类检索", "futurepedia.io"],
                  ["There's An AI For That (TAAFT)", "工具目录与趋势", "theresanaiforthat.com"],
                  ["Toolify", "AI 工具榜与分类", "toolify.ai"],
                  ["Indie Hackers", "独立开发者产品叙事", "indiehackers.com"],
                  [
                    "Google Trends / TikTok Creative Center / YouTube Charts / X Trends",
                    "分发与话题热度（不作唯一信源，只作侧证）",
                    "各平台官方站点",
                  ],
                ]}
              />
            </SubSubSection>

            <SubSubSection title="C3 — SKILL 其余补充">
              <ul className="space-y-2">
                <Bullet>
                  <strong>模型</strong>：一手 Release Notes（YAML 已覆盖部分博客）；HF Trending、GitHub Trending、arXiv、benchmark 仓库；Arena/LMSYS、Artificial Analysis、LiveBench 做交叉验证。
                </Bullet>
                <Bullet>
                  <strong>产品</strong>：各产品官方 Changelog（ChatGPT、Claude、Gemini、Perplexity、xAI 等，URL 随产品迭代）。
                </Bullet>
                <Bullet>
                  <strong>社区</strong>：X 上官方号/创始人、Reddit 扩展子版、Towards AI 社区、Hacker News（与 4.3 自动化关键词流互补）。
                </Bullet>
                <Bullet>
                  <strong>初创硬规则</strong>：每期至少 1 条非八大厂产品 — 常从 Product Hunt 日榜 AI、YC 目录、Indie Hackers、r/SideProject、r/startups、Ben&apos;s Bites、TAAFT 中兑现。
                </Bullet>
              </ul>
            </SubSubSection>
          </SubSection>

          {/* 4.5 配图 */}
          <SubSection title="4.5 配图（Unsplash 与 Logo）">
            <Table
              headers={["类型", "来源", "说明"]}
              rows={[
                [
                  "卡片 / 列表主视觉",
                  "Unsplash",
                  "tools/fetch_unsplash_covers.py 调 Search API，按 tags/module 生成英文关键词；图片来自 Unsplash CDN。环境变量：UNSPLASH_ACCESS_KEY。",
                ],
                [
                  "品牌辨识",
                  "Logo",
                  "公司/产品标识以官方 Press Kit、品牌页或通用 Logo 收录服务为准（编辑选用）；用于角标、列表图标或与 Unsplash 配图并存，不替代 SKILL 对「真实产品截图/基准图」的正文要求。",
                ],
                [
                  "备选（控费外）",
                  "OpenAI 图像 API",
                  "tools/generate_cover_images.py 默认 gpt-image-1，仅按需启用；与 Unsplash 二选一或分条策略见 docs/SYSTEM_PROMPTS.md。",
                ],
              ]}
            />
          </SubSection>
        </Section>

        {/* ══════════════════════════════════════
            5 模型配置
        ══════════════════════════════════════ */}
        <Section title="5 模型配置（代码常量）">
          <Table
            headers={["能力", "模型（仓库当前常量）", "文件"]}
            rows={[
              ["Enrichment 主调用", "gpt-4.1", "tools/ai_filter.py"],
              ["Fallback 轻量筛选", "gpt-4.1-mini", "tools/ai_filter.py"],
              ["入库向量", "text-embedding-3-small", "tools/sync_to_db.py、web/lib/embeddings.ts"],
              ["聊天", "gpt-4o-mini", "web/app/api/chat/route.ts"],
              ["个性化精排文案", "gpt-4o-mini", "web/lib/personalization/rerank.ts"],
              ["记忆抽取", "gpt-4o-mini", "web/lib/agent/memory.ts"],
              ["可选生图封面", "gpt-image-1（CLI 默认）", "tools/generate_cover_images.py"],
            ]}
          />
          <Note>
            多智能体 SOP（<Code>.claude/agents/*</Code>）不绑定单一 API 名；若在 <strong>Claude API</strong> 上跑整条链，计价以 Anthropic 控制台为准。
          </Note>
        </Section>

        {/* ══════════════════════════════════════
            6 OpenAI 成本测算
        ══════════════════════════════════════ */}
        <Section title="6 OpenAI 成本测算（P2 入库 + 网站）">
          <p className="mb-4 text-claude-body dark:text-white/80">
            以下假设计费均经 <strong>OpenAI API</strong>，模型与仓库当前常量一致：<Code>gpt-4.1</Code>（入库扩写）、<Code>text-embedding-3-small</Code>（向量）、<Code>gpt-4o-mini</Code>（首页精排、聊天、记忆）。单价以 OpenAI Pricing 为准，下文数字用于量级估算，实施前请用控制台用量校准。
          </p>

          <Table
            headers={["模型", "测算单价（USD / 1M tokens）"]}
            rows={[
              ["GPT-4.1", "输入 $2.00 · 输出 $8.00"],
              ["GPT-4o-mini", "输入 $0.15 · 输出 $0.60"],
              ["text-embedding-3-small", "$0.02（仅输入侧计费）"],
            ]}
          />

          <p className="mt-5 mb-3 font-medium">固定情景参数（单线维持一条「典型产品站」）</p>
          <Table
            headers={["参数", "取值"]}
            rows={[
              ["月刊期数", "4（每周 1 期入库）"],
              ["每期 ai_filter.py 扩写条数", "30；每批 15 条 → 2 次/期 gpt-4.1"],
              ["单次 enrich 调用", "输入约 14k（长 system + 15 条摘要）· 输出约 35k（15 条长 schema）"],
              ["Embedding", "每期 30 条 × ~900 tokens ≈ 27k/期"],
              ["每活跃用户每月", "打开首页 4 次（周更）· 聊天 10 轮 · 记忆抽取 3 次"],
            ]}
          />

          <SubSection title="6.1 基线：维持成本（与用户量无关）">
            <p className="mb-3 text-claude-body dark:text-white/80">
              仅 <strong>P2 管道</strong>：入库扩写 + 向量，不计任何用户请求。
            </p>
            <Table
              headers={["项", "Token 量级/月", "公式（USD）", "结果"]}
              rows={[
                ["GPT-4.1 入库", "入 112k · 出 280k", "112×2/1000 + 280×8/1000", "≈ $2.46"],
                ["Embedding", "入 ≈108k", "108×0.02/1000", "≈ $0.00"],
              ]}
            />
            <Aside>
              <strong>维持基数合计 ≈ $2.5 / 月</strong>（仅 OpenAI 文本与向量；<strong>不含</strong> Unsplash、gpt-image-1、Vercel/域名等）。
            </Aside>
          </SubSection>

          <SubSection title="6.2 边际：每增加 1 名活跃用户（每月）">
            <Table
              headers={["行为", "单用户 token/月", "费用（USD）"]}
              rows={[
                ["首页精排 ×4", "入 20k · 出 8k", "20×0.15/1000 + 8×0.6/1000 ≈ $0.0078"],
                ["聊天 ×10 轮", "入 20k · 出 5k", "20×0.15/1000 + 5×0.6/1000 ≈ $0.0060"],
                ["记忆 ×3", "入 4.5k · 出 1.2k", "≈ $0.0014"],
              ]}
            />
            <Aside>
              <strong>边际合计 ≈ $0.015 / 用户 / 月</strong>（约 1–2 美分；聊天轮次翻倍则该项约线性翻倍）。
              <br />
              <br />
              <strong>总公式（OpenAI 仅、本情景）</strong>：月 OpenAI 文本/向量 ≈ $2.5 + N × $0.015
              <br />
              例：<strong>N = 50</strong> → 2.5 + 0.75 <strong>≈ $3.3 / 月</strong>。
            </Aside>
          </SubSection>

          <SubSection title="6.3 参考：日更入库、更强模型、五十名活跃（月度）">
            <p className="mb-4 text-claude-body dark:text-white/80">
              <strong>结论（预算口径）</strong>：在「<strong>日更入库</strong>、约 <strong>50 名活跃用户</strong>、希望对话与记忆用更强模型」的前提下，只要对<strong>首页精排</strong>做<strong>周更或缓存</strong>（避免每人每天走一遍 gpt-4o 精排），OpenAI 文本与向量可压在约 <strong>¥200–400 / 月</strong>（约 <strong>$28–55 / 月</strong>，按 ¥≈USD×7.2 量级换算，以控制台为准）。
            </p>

            <Table
              headers={["模型", "测算（USD / 1M tokens）"]}
              rows={[
                ["GPT-4.1", "入 $2.00 · 出 $8.00"],
                ["GPT-4o", "入 $2.50 · 出 $10.00"],
                ["GPT-4o-mini", "入 $0.15 · 出 $0.60"],
                ["text-embedding-3-small", "$0.02（仅输入）"],
              ]}
            />

            <p className="mt-6 mb-3 font-medium">推荐方案（落入 ¥200–400）：日更入库 + 首页 mini 或周更 4o + 对话记忆 4o</p>
            <Table
              headers={["分项", "模型与频次", "金额（USD/月）"]}
              rows={[
                ["A. 入库", "gpt-4.1，日更", "≈ $18.48"],
                ["B. Embedding", "text-embedding-3-small", "≈ $0.02"],
                [
                  "C. 首页精排",
                  "gpt-4o-mini，50×30 次/月（日更展示可依赖缓存与 cheap rerank，精排不必日日走贵模型）",
                  "≈ $2.93",
                ],
                ["D. 聊天", "gpt-4o", "≈ $5.63"],
                ["E. 记忆", "gpt-4o", "≈ $1.16"],
              ]}
            />
            <Aside>
              <strong>小计 ≈ $28.2 / 月 → 约 ¥203（@7.2）</strong>，落在区间<strong>偏下</strong>。
              <br /><br />
              若希望<strong>首页文案也用 gpt-4o</strong> 但控制成本：把精排改为<strong>每周约 1 次/人</strong>（其余日期用缓存或仅 cheap rerank），则 C ≈ $6.5，小计 <strong>≈ $31.8 → 约 ¥229</strong>；再叠加「每用户聊天略增、或偶发重跑」等，<strong>上沿可接近 ¥350–400</strong>，仍明显低于「每人每日 gpt-4o 精排」。
            </Aside>

            <p className="mt-6 mb-3 font-medium">对照：未优化（每人每天 gpt-4o 精排）</p>
            <Table
              headers={["分项", "计算依据", "金额（USD/月）"]}
              rows={[
                ["A–B", "同推荐方案", "≈ $18.50"],
                ["C. 首页", "gpt-4o，50×30×（5k 入 + 2k 出）", "≈ $48.75"],
                ["D–E", "gpt-4o 聊天 + 记忆", "≈ $6.79"],
              ]}
            />
            <Note>
              <strong>合计 ≈ $74 / 月（约 ¥530+）</strong> — 账单大头在首页精排，<strong>不建议</strong>作为默认产品形态；与推荐方案差额主要来自首页是否「日更全量走 gpt-4o」。
            </Note>
          </SubSection>

          <SubSection title="6.4 配图与非文本 API（不计入上文 OpenAI 文本）">
            <Table
              headers={["项", "说明"]}
              rows={[
                ["Unsplash", "通常免费层；$0 计入上表。"],
                ["gpt-image-1", "批量 AI 封面时另计，见图像定价页。"],
              ]}
            />
          </SubSection>
        </Section>

        {/* ══════════════════════════════════════
            7 风险与待确认
        ══════════════════════════════════════ */}
        <Section title="7 风险与待确认">
          <Table
            headers={["ID", "风险", "缓解"]}
            rows={[
              ["R1", "Feed 失效或 403", "sources.yaml 单源 active: false；SKILL 人工补源"],
              [
                "R2",
                "日更 × gpt-4o 使首页调用量主导账单",
                "缓存精排结果、降频、或高峰用 mini",
              ],
              ["R3", "标价与汇率变动", "以 OpenAI 控制台 30 天用量为准"],
            ]}
          />
        </Section>

        {/* ══════════════════════════════════════
            8 相关文档索引
        ══════════════════════════════════════ */}
        <Section title="8 相关文档索引">
          <Table
            headers={["文档", "用途"]}
            rows={[
              ["skill/SKILL.md", "SOP 权威"],
              ["tools/sources.yaml", "RSS/Reddit/HN"],
              ["docs/SOURCES.md", "YAML 字段与 tag"],
              ["docs/SYSTEM_PROMPTS.md", "提示词与脚本入口"],
              ["skill/RUNBOOK.md", "逐步检查"],
              ["docs/ZenoNews_Product_Brief.docx", "对外产品简介（运行 python tools/export_product_docx.py 生成）"],
              ["web/app/about/page.tsx", "网站「如何运作」页"],
            ]}
          />
        </Section>

        <FooterNote />
      </div>
    </article>
  );
}

/* ================================================================
   Data fetching
================================================================ */

async function loadStats() {
  try {
    const rows = await sqlClient<
      Array<{ total: number; main: number; latest: string | null }>
    >`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE item_tier = 'main')::int AS main,
        MAX(issue_date) AS latest
      FROM news_items
    `;
    return rows[0] ?? { total: 0, main: 0, latest: null };
  } catch {
    return { total: 0, main: 0, latest: null };
  }
}

/* ================================================================
   UI helpers
================================================================ */

function StatStrip({
  stats,
}: {
  stats: { total: number; main: number; latest: string | null };
}) {
  return (
    <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat label="本周主条目" value={String(stats.main)} unit="条" />
      <Stat label="累计入库" value={String(stats.total)} unit="条" />
      <Stat label="最新一期" value={stats.latest ?? "—"} />
      <Stat label="素材时间窗" value="7 天滚动" />
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="rounded-lg bg-white p-5 shadow-hairline dark:bg-white/[0.04]">
      <p className="text-[12px] font-medium uppercase tracking-uc text-claude-muted">
        {label}
      </p>
      <p className="mt-2 font-display text-[28px] tracking-display text-claude-ink dark:text-white">
        {value}
        {unit && (
          <span className="ml-1 text-[14px] font-normal text-claude-muted">
            {unit}
          </span>
        )}
      </p>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-16">
      <h2 className="font-display text-[28px] tracking-display text-claude-ink dark:text-white sm:text-[32px]">
        {title}
      </h2>
      <div className="mt-5 text-[16px] leading-[1.7] text-claude-body dark:text-white/85">
        {children}
      </div>
    </section>
  );
}

function SubSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-8">
      <h3 className="mb-4 font-display text-[20px] tracking-tight text-claude-ink dark:text-white">
        {title}
      </h3>
      {children}
    </div>
  );
}

function SubSubSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6">
      <h4 className="mb-3 text-[14px] font-semibold uppercase tracking-uc text-claude-muted">
        {title}
      </h4>
      {children}
    </div>
  );
}

function Table({
  headers,
  rows,
  compact = false,
}: {
  headers: string[];
  rows: string[][];
  compact?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-claude-hairline dark:border-white/10">
      <table className="w-full text-[14px]">
        <thead>
          <tr className="border-b border-claude-hairline bg-claude-surface-soft dark:border-white/10 dark:bg-white/[0.04]">
            {headers.map((h) => (
              <th
                key={h}
                className="px-4 py-2.5 text-left font-semibold text-claude-ink dark:text-white"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-claude-hairline last:border-0 dark:border-white/10"
            >
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`px-4 ${compact ? "py-1.5" : "py-3"} align-top text-claude-body dark:text-white/80 ${
                    j === 0
                      ? "font-medium text-claude-ink dark:text-white whitespace-nowrap"
                      : ""
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-[0.55em] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-claude-coral" />
      <span className="flex-1 leading-[1.65]">{children}</span>
    </li>
  );
}

function Aside({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 rounded-lg bg-claude-surface-soft p-5 text-[15px] leading-[1.6] text-claude-body-strong dark:bg-white/[0.04] dark:text-white/85">
      {children}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 border-l-2 border-claude-coral/40 pl-4 text-[14px] leading-[1.6] text-claude-muted dark:text-white/60">
      {children}
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-claude-surface-card px-1.5 py-0.5 font-mono text-[13px] text-claude-body-strong dark:bg-white/10 dark:text-white/90">
      {children}
    </code>
  );
}

function FooterNote() {
  return (
    <div className="mt-20 border-t border-claude-hairline pt-8 text-[14px] text-claude-muted dark:border-white/10">
      <p>相关文件快速索引：</p>
      <ul className="mt-2 space-y-1">
        <li>· 编辑 SOP：<Code>skill/SKILL.md</Code></li>
        <li>· 信源配置：<Code>tools/sources.yaml</Code></li>
        <li>· 个性化重排：<Code>web/lib/personalization/rerank.ts</Code></li>
        <li>· 成本说明：<Code>docs/Newsletter机制说明.md</Code></li>
        <li>· 产品简介：<Code>docs/ZenoNews_Product_Brief.docx</Code></li>
      </ul>
      <p className="mt-6">
        <Link href="/" className="text-claude-coral hover:underline">
          ← 回首页看本周的内容
        </Link>
      </p>
    </div>
  );
}
