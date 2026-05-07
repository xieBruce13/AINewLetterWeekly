# 进度记录 — 截至 2026-05-05

> 给「明天的我」看的。当前 commit 之前的所有改动都已经写到磁盘但**没有 git
> commit**（如果想的话明天先 `git add . && git commit`）。

---

## 这个项目是什么（30 秒回顾）

把原来「跑 .claude pipeline → 出一个静态 PDF」的流程，改成一个**Next.js
Web 应用**：

- 同一份编辑流水线产出的内容
- 按用户的角色 / 公司 / 项目 / 关注话题 **重排 + 重写**
- 每条新闻是一张可点开的卡片，详情页有 TLDR / 应用场景 / 用户反馈 / 引用
- 底部是一个 **AI Agent**，记得用户聊过什么，能针对当前看到的新闻聊
- 完整中文界面，Claude 设计语言

仓库根目录：`C:\Users\xieb0\OneDrive\Desktop\NewsLetter`
Web 目录：`web/`
Pipeline 目录：`tools/` + `.claude/agents/`

---

## 截至今天做完的事（按时间顺序）

### 已经稳定了的（前几次会话）

1. **Next.js 15 web app**，Drizzle + Postgres + pgvector，Claude 设计系统
2. **多模块视图**：模型 / 产品 / 运营 三栏
3. **首页"本周要点"**：`issue_summaries.bullets` jsonb，每条 bullet 可点击跳到对应详情页
4. **详情页**：TLDR、`what_it_is`（"这是什么"）、官方说法、用户场景、用户/市场反馈、quotes、外部验证、社区反应、编辑判断、score 拆分、原始 URL（已经把"与我们的关系/我们要做的事"两段去掉了）
5. **聊天 agent**（Vercel AI SDK + Claude Sonnet），有 memory_facts 提取
6. **个性化 v1**：cheap rerank（pgvector + tag overlap）+ smart rerank（LLM）
7. **内容验证**：`tools/validate_records.py`（14 天新鲜度 + URL ping），sync_to_db.py 集成，verifier agent prompt 里强制
8. **CJK slug → ASCII slug** 解决 Next.js 动态路由 404
9. **中文字体 + 字号优化**（Noto Serif SC / Noto Sans SC，body 17px / 1.75）
10. **隐藏功能去掉**、**"和 Agent 讨论"按钮单行**、**weekly summary 可点击**

### 今天（2026-05-02）做完的（这次会话）

#### A. 真正的 Sign-up / Sign-in（去 Google，china-friendly）

- `db/migrations/0001_password_auth.sql` — `users.password_hash text NULL`，**已经应用**到本地 Postgres
- `web/lib/auth.ts` — 删 Google provider；`password` Credentials provider 用 bcrypt + zod；保留 Resend 作 fallback；新增 `signUpWithPassword()` server-action 工具
- `web/app/signup/{page,form,actions}.tsx` — 注册页：显示名 + 邮箱 + 密码；`useActionState` 把 field-level error 回显
- `web/app/signin/{page,form}.tsx` — 重写为密码登录主路径，链到 /signup，magic link / demo 是兜底
- `web/components/auth-provider.tsx` + `layout.tsx` — `<SessionProvider>` 包根，让客户端 `signIn()` 能用
- `web/components/site-nav.tsx` — 未登录时同时展示「登录」+「注册」

> 端到端测过：bcrypt 写入正确，password provider 接受密码，session cookie
> 设上后能进 /onboarding 和 /。

#### B. Onboarding 流程

- `web/app/onboarding/page.tsx` + `actions.ts` — 三步进度条（注册 → 角色 → 简报）；新增「**先跳过**」→ 调 `skipProfile()` 写一个空 user_profiles row（只填 onboarded_at），避免 home 页把用户死循环回 onboarding；onboarded 老用户进来文案改成"更新一下你的档案"
- 收集字段不变：role / company / current_projects / focus_topics / dislikes
- **没收 API key**，按你说留到之后

#### C. 多 agent pipeline 自跑

- `tools/run_pipeline.py`（~450 行）— 把 `.claude/agents/*.md` 翻成 9 step Python 脚本
  - Step 0 scope lock → 1 collect (per module，可选 Tavily) → 2 filter → 3 normalize → 4 verify (LLM) + 4B local validator → 5 score → 6 triage → 7 write (Opus) → 8 QA → 9 sync_to_db
  - `--start-at N --stop-at M` 可以从任一步续跑
  - 没有 `ANTHROPIC_API_KEY` 直接 FATAL 不假装成功
  - `--dry-run-no-llm` 看 prompt 不调 API
- `.github/workflows/weekly_pipeline.yml` — 每周一 10:00 UTC 自动跑，跑完把 newsletter_runs/<date>/ commit 回仓库
- `docs/PIPELINE_SCHEDULING.md` — 三种调度方式（GitHub Actions / VPS cron / Windows Task Scheduler）+ 成本估算

#### D. 个性化 v2（真正的个性化）

- `web/lib/db/queries.ts` `getCheapRerank` 重写：
  - **Cross-issue lookback** — 从 last 4 issues 拉候选（之前只拉本期），候选池从 7 → 25-30
  - **Recency decay** — 每往回 1 期扣 0.5 分
  - **Memory-fact 语义 boost** — 拉 user top-6 memory_facts 的 embedding，对每个候选 max cosine similarity，× 4 加分（带 SQL 注入防护：vector literal 必须匹配 `^\[-?\d+(\.\d+)?(,...)*\]$`）
  - **Saved-tag history boost** — 用户曾 save 过的 tag 与候选 intersect 加分
  - **Auto-exclude** 用户曾 dismiss 的 item
- `web/lib/personalization/rerank.ts` — 拉 memory_facts 的 embedding 文本表示传给 cheap rerank；没有 OpenAI key 时优雅退化（embedding 为 null 的会被自动滤掉）

#### E. 历史数据积累

- `tools/seed_history.py` — 写入 3 周前真实 AI 新闻数据：
  - 2026-04-11: Claude Sonnet 4.6, Cursor Composer 2, Mistral Codestral 25.04, Vercel AI SDK 5
  - 2026-04-18: Claude Opus 4.7, Lovable 3, Adobe Firefly Skills, Notion Q&A 2.0
  - 2026-04-25: GPT-5.5, Gemini Enterprise Agent Platform, Perplexity Comet 1.0, Stripe Agent Toolkit GA
- 跑 validator 自动剔除了 2 条不合格（Composer 2 太老 36d、VentureBeat URL 429）
- DB 现在有 **27 条 records 横跨 5 期**

#### F. 端到端验证

测试用户：
- **Maya** (`maya@example.com` / `password12345`) — AI 工程师 / RAG / agent / coding
- **Dora** (`dora@example.com` / `password12345`) — 设计师 / image-gen / creative

两人登录后看到完全不同的 feed：
- Maya 看到 cursor-sdk / gemini-agent-platform / paper-compute-agent / langsmith-evaluations
- Dora 看到 adobe-firefly-skills / lovable-3 / figma-make / suno-v5 / chatgpt-pulse

> Cross-issue rerank + tag overlap 在没有 OpenAI key 的情况下也能区分用户。

### 2026-05-05 这次会话补的

#### G. Forgot password / 改密码流程（P0-3）

- `web/app/forgot/page.tsx` — 输邮箱触发 Resend magic-link，redirectTo 指向 `/account/security?reset=1`；没有 `AUTH_RESEND_KEY` 时优雅降级（不假装发了邮件，提示找管理员）
- `web/app/account/security/{page,form,actions}.tsx` — 改密码页 + zod 校验 + bcrypt
  - 密码登录用户改密码 → **必须**输当前密码
  - magic-link 登录回来（session.user.signInProvider === "resend"）→ 跳过当前密码
  - 没现有 password_hash 的用户（demo / 纯 magic-link 老用户）→ 第一次设密码也跳过当前密码
- `web/lib/auth.ts` — JWT/Session 加 `signInProvider` 字段；新增 `updatePassword({ userId, trustedReset, currentPassword?, newPassword, confirmPassword })` 业务函数
- `web/app/signin/form.tsx` — 密码字段右上角加「忘记密码？」链接到 `/forgot`
- `web/components/site-nav.tsx` — 已登录菜单加「帐号」链接到 `/account/security`

#### H. 单 key 迁移：所有 LLM 调用 → OpenAI

把项目从「Anthropic Claude（生成）+ OpenAI（embedding）」两 key 合并到**单 OPENAI_API_KEY**：

- 模型映射：
  - chat agent / smart rerank / memory extractor：`claude-sonnet-4-5` → **`gpt-5-mini`**
  - pipeline step 1-6 / 8（filter / verify / score / triage / qa）：`claude-sonnet-4-5` → **`gpt-5-mini`**
  - pipeline step 7（writer）：`claude-opus-4-7` → **`gpt-5`**
- 改的代码：
  - `web/app/api/chat/route.ts`、`web/lib/personalization/rerank.ts`、`web/lib/agent/memory.ts` — 全部 `@ai-sdk/anthropic` → `@ai-sdk/openai`，env 检查从 `ANTHROPIC_API_KEY` → `OPENAI_API_KEY`
  - `tools/run_pipeline.py` — `import anthropic` → `from openai import OpenAI`；改 `client.chat.completions.create()`；gpt-5 系列不接 `temperature`，做了条件跳过；`max_tokens` → `max_completion_tokens`
  - `web/package.json` — 删 `@ai-sdk/anthropic`（已 npm uninstall）
- 改的配置 / 文档：
  - `requirements.txt` 加 `openai>=1.40`
  - `.github/workflows/weekly_pipeline.yml` 删 ANTHROPIC env，pip install 改用 `-r requirements.txt`
  - `docs/PIPELINE_SCHEDULING.md`、`web/README.md`、`web/.env.example` 全部去掉 ANTHROPIC_API_KEY，注明单 key
- **没改**的：embeddings 本来就是 OpenAI（`text-embedding-3-small`），保持不变
- 成本：从原来 ~$2-4/期 + ~$10/月（Sonnet+Opus）→ 估算 ~$0.30-0.50/期（gpt-5-mini + gpt-5），便宜 7-10 倍

> 还**没真的跑过** run_pipeline.py 验证 gpt-5 输出格式是否兼容 `safe_json_load` 的 fence-strip。下次接到 OPENAI_API_KEY 后第一时间跑一次 `--start-at 1 --stop-at 2 --modules model` 试水。

---

## 当前状态（明天来直接能用的）

### 服务

- **Postgres** Docker 容器：`newsletter-pg`，`localhost:5433`（**注意不是 5432**），DB 名 `newsletter`，user `postgres` / password `postgres`
- **Next.js dev server** 之前在 3002（如果电脑没关，应该还在跑；不在的话 `cd web && npm run dev`）

### DB 内容

- news_items：27 条，5 期（2026-04-11 / 04-18 / 04-25 / 05-01 / 05-02）
- users：至少 maya / dora 两个测试账号（password12345）+ 之前 demo 创建的若干
- user_profiles：maya / dora 都有 profile

### 环境变量（`web/.env.local`）

| 变量 | 现状 | 备注 |
|---|---|---|
| `DATABASE_URL` | 已设 → `postgres://postgres:postgres@localhost:5433/newsletter` | 注意 5433！|
| `NEXTAUTH_SECRET` | 已设 | |
| `OPENAI_API_KEY` | **没设** | 现在是**唯一**的 LLM key — chat agent / rerank / memory extraction / 整条 pipeline / embeddings 都靠它 |
| `AUTH_RESEND_KEY` | **没设** | magic-link 登录 + forgot password 流程兜底；没有也行（密码登录主路径仍可用） |
| `TAVILY_API_KEY` | **没设** | pipeline collector 没 web grounding |
| `DEMO_AUTH` | 默认 enabled (NODE_ENV=development) | dev 演示登录 |

> 2026-05-05 单 key 迁移之后已经**没有 ANTHROPIC_API_KEY 了** — 全切 OpenAI。如果之前你 setx 过这个变量可以删了。

### Git 状态

**所有改动都还没 commit**。新增 / 改动文件大致：

```
A  db/migrations/0001_password_auth.sql
A  docs/PIPELINE_SCHEDULING.md
A  docs/PROGRESS.md  (本文件)
A  .github/workflows/weekly_pipeline.yml
A  tools/run_pipeline.py
A  tools/seed_history.py
A  newsletter_runs/2026-04-11/  (verified_records / triage / weekly_summary)
A  newsletter_runs/2026-04-18/
A  newsletter_runs/2026-04-25/
A  web/app/signup/{page,form,actions}.tsx
A  web/app/signin/form.tsx
A  web/components/auth-provider.tsx
M  web/lib/auth.ts
M  web/lib/db/schema.ts
M  web/lib/db/queries.ts
M  web/lib/personalization/rerank.ts
M  web/app/signin/page.tsx
M  web/app/onboarding/page.tsx
M  web/app/onboarding/actions.ts
M  web/app/layout.tsx
M  web/components/site-nav.tsx
M  web/package.json (bcryptjs + types)
+ Newsletter_Agent_说明书.docx  (untracked，之前的产物)
+ tools/make_agent_doc.py  (untracked)
```

---

## 明天接着做：候选清单（按优先级）

### P0 — 还差但已经规划好的事

1. **配 `OPENAI_API_KEY`，跑一次 `tools/run_pipeline.py` 端到端** —— 单 key 迁移之后还没真跑过；先 `--start-at 1 --stop-at 2 --modules model --dry-run` 试水看 collector → filter 输出格式；如果 fence-strip 不吃 gpt-5 的输出，要 patch `_extract_json_block` / `safe_json_load`
2. **重跑 `tools/sync_to_db.py newsletter_runs/2026-05-02`** 让 embedding 写进去；然后让 maya/dora 重新 sign-in 让 saveProfile 把 profile_embedding 写出来，再看 rerank 是否更准
3. ~~**Forgot password 流程**~~ ✅ 2026-05-05 已做完（`/forgot` + `/account/security` + signInProvider 检测）

### P1 — 体验小坑

4. **`/account` 主页** —— 5/5 已经做了 `/account/security`（改密码），但还没有 `/account` 主页让用户「登出所有设备 / 删除账号 / 看登录历史」。
5. **Sign-up CSRF** —— 检查 `useActionState` + server action 在生产环境（非 localhost）是否需要额外的 CSRF 防护；NextAuth credentials POST 已经有 csrfToken 了，server action 是另一回事
6. **Bcrypt cost** —— 现在 `bcrypt.hash(pw, 10)`，注册时 ~80ms。如果上线想要 12+，注册流要加 loading spinner（已经有了）
7. **首页对未登录用户** —— 现在显示 6 张卡 + 登录 CTA。可以改成展示「登录后看到这条新闻为何对你重要」蒙版效果
8. **Onboarding 跳过后的引导** —— 跳过的用户首页应该出现 banner「补全 profile 看到为你定制的新闻」
9. **Magic-link 改密码后强制 logout 其他 session** —— 当前实现改完密码不踢其他设备下线（注释里也提了）。如果要做"密码改了所有 session 失效"，schema 加 `password_changed_at`，jwt callback 比对一下，过期的踢回 /signin。

### P2 — pipeline 真跑起来才会冒出来的问题

9. **Tavily search topic="news"** 在 Tavily v2 API 里要 paid tier；如果只有 free key，搜不到东西要降级到 `topic="general"` + manual filter
10. **`run_pipeline.py` 的 verifier 步骤** 现在只让 LLM 自己 cross-check claims；如果想做真的「读 reddit / twitter 找 user quote」，需要给它工具（`praw` for Reddit），现在是 LLM 凭训练数据猜。要么把 verifier 改简单（只 cross-check + URL ping，不强制 user quotes），要么补真的 Reddit fetch
11. **Writer step Opus 4.7** 估计每次 ~$1.50。如果想压成本，可以 fallback Sonnet 4.5
12. **GitHub Actions 的 commit-back 步骤** 需要给 workflow `contents: write`，已经在 yml 里设了；但仓库 settings → actions → workflow permissions 可能还需要打开"read and write"

### P3 — 想做但不一定值得

13. **Reddit user quote 抓取** —— verifier agent SOP 里说每条 main item 要 2-4 条 user quote 翻译成中文。现在是 LLM 编的。真做要 PRAW + 翻译。
14. **Email digest 实际发出来** —— `/api/cron/digest` 已经存在，但要 Vercel deploy + Resend domain 验证 + cron secret。本地跑不了。
15. **聊天 agent 的 tool use** —— 现在 agent 能 retrieve memory_facts，但不能 search items / save / dismiss。可以加 `getRelatedItems` / `saveItem` / `dismissItem` 工具
16. **多语言** —— 想加英文版？schema 里已经有 `record` jsonb，理论上可以同时存 zh + en

---

## 快速恢复命令（复制粘贴用）

```powershell
# 1) 确认 Postgres 起着
docker ps --filter name=newsletter-pg

# 2) 起 Next.js dev server
cd C:\Users\xieb0\OneDrive\Desktop\NewsLetter\web
npm run dev   # 通常 3000 → 3001 → 3002，看输出

# 3) 设环境变量（单 key — 2026-05-05 之后只需要 OpenAI）
$env:OPENAI_API_KEY = "sk-..."

# 4) 跑一次 pipeline (单 module 试水)
cd C:\Users\xieb0\OneDrive\Desktop\NewsLetter
$env:DATABASE_URL = "postgres://postgres:postgres@localhost:5433/newsletter"
$env:PYTHONIOENCODING = "utf-8"
py tools/run_pipeline.py --modules model --dry-run

# 5) 重新 seed 历史（如果 DB 被清了）
py tools/seed_history.py --no-embed

# 6) 测试登录（PowerShell）
# Maya: maya@example.com / password12345
# Dora: dora@example.com / password12345
# 浏览器打开 http://localhost:3002/signin
```

---

## 已知小问题 / 备忘

- `web/.next/cache` 偶尔报 `ENOENT rename` 警告 —— OneDrive 在 sync 文件，无害，但偶尔需要 `Remove-Item -Recurse -Force web\.next\cache` 清一下
- Postgres 端口是 **5433** 不是 5432，每次新 shell 要 export `DATABASE_URL`
- `Newsletter_Agent_说明书.docx` 是之前的产物，**不要 commit**，已经在 git status 里 untracked
- 测试账号密码 `password12345` 的 bcrypt hash 在 Maya / Dora 行里是同一个：`$2b$10$8CalfDkxPE1TH4mKLxPga.ghdvROsR3qpYo1W91pWXLo/ZK84WcPm`

---

## 设计原则备忘（避免明天偏轨）

- **Graceful degrade**: 缺 OpenAI 跑得下去，缺 Tavily 跑得下去，缺 Anthropic 直接 FATAL（不让产生垃圾内容）
- **真实数据优先**: validator 永远是最后一道闸，不允许 stale / broken URL 进 DB
- **No proxy content**: 之前用户骂过——现在 demo 数据全是真实 URL + 真实日期
- **中国可用**: 不放 Google OAuth，不依赖必须翻墙的 service；Resend 作为可选不强制
- **不擅自 commit**: 每次都让用户决定何时 commit
