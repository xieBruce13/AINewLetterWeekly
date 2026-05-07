# 自动跑 pipeline — 调度选项

`tools/run_pipeline.py` 把整条多 agent SOP 翻译成一个可独立运行的 Python
脚本。下面三种调度方式按推荐度排序。

---

## 1. GitHub Actions（推荐）

仓库里已经有 `.github/workflows/weekly_pipeline.yml`，每周一 10:00 UTC
（北京时间 18:00、美东时间 06:00）自动触发，跑完后把生成的
`newsletter_runs/<date>/` 提交回仓库。

需要在 repo Settings → Secrets and variables → Actions 里加：

| Secret | 必须 | 用途 |
|---|---|---|
| `OPENAI_API_KEY`    | 是 | Step 1-8 的 LLM 调用（gpt-5-mini / gpt-5）+ Step 9 embeddings，**单 key 全包** |
| `DATABASE_URL`      | 是 | Step 9 把 records 推到 Postgres |
| `TAVILY_API_KEY`    | 否 | Step 1 拉真实 web 搜索结果（grounding） |

> 2026-05-05 的迁移把 Anthropic Claude 全部换成 OpenAI（chat agent / rerank / memory extraction / 全部 pipeline step），从此只需要一个 `OPENAI_API_KEY`。

手动也能触发：Actions 页 → Weekly newsletter pipeline → Run workflow。
可以填 `date` 参数覆写日期。

---

## 2. 服务器 cron（VPS / Render / Fly.io）

挂在自己的服务器上更可控：

```bash
# /etc/cron.d/newsletter-weekly
0 10 * * 1 newsletter cd /opt/newsletter && \
  OPENAI_API_KEY=... DATABASE_URL=... \
  /opt/newsletter/.venv/bin/python tools/run_pipeline.py \
  >> /var/log/newsletter.log 2>&1
```

注意：

- 第一次跑前装依赖：`pip install -r requirements.txt`
- 跑一次 ~20-60 分钟（取决于 LLM token 数与 web search 深度）
- 失败自动重试不靠谱（中途 step 失败要人手 `--start-at N` 续跑）

---

## 3. Windows Task Scheduler（本机自动）

适合「电脑常开 + 不想买服务器」的轻量场景。开 PowerShell：

```powershell
# 一次性创建：每周一早上 9:00 跑
$action = New-ScheduledTaskAction `
  -Execute "py" `
  -Argument "C:\Users\xieb0\OneDrive\Desktop\NewsLetter\tools\run_pipeline.py" `
  -WorkingDirectory "C:\Users\xieb0\OneDrive\Desktop\NewsLetter"

$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 9am

Register-ScheduledTask -TaskName "Newsletter Weekly Pipeline" `
  -Action $action -Trigger $trigger -Description "Run the AI newsletter pipeline"
```

环境变量要存在用户层，否则 Task Scheduler 看不到。在 PowerShell：

```powershell
[System.Environment]::SetEnvironmentVariable("OPENAI_API_KEY", "sk-...", "User")
[System.Environment]::SetEnvironmentVariable("DATABASE_URL", "postgres://...", "User")
```

跑日志可以在脚本前后加重定向：

```powershell
$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument '-Command "py tools/run_pipeline.py *>> newsletter.log"' `
  -WorkingDirectory "C:\Users\xieb0\OneDrive\Desktop\NewsLetter"
```

---

## 手动跑（开发 / 调试）

```powershell
# 走完整流水线（默认日期 = 今天）
$env:DATABASE_URL = "postgres://postgres:postgres@localhost:5433/newsletter"
$env:OPENAI_API_KEY = "sk-..."
py tools/run_pipeline.py

# 只跑特定模块
py tools/run_pipeline.py --modules model

# 想看 LLM prompts 而不真发请求
py tools/run_pipeline.py --dry-run-no-llm

# 从中间某步开始（前面步骤的 JSON 已经存在）
py tools/run_pipeline.py --start-at 5 --stop-at 7

# 不推 DB（写到文件就停）
py tools/run_pipeline.py --dry-run
```

---

## 一次完整跑下来的 token 成本（粗估）

- 每个 module 一次 collector 调用 ≈ 8K input + 6K output  
- Filter / Normalize / Verify / Score / Triage 各一次 ≈ 12K input + 6K output  
- Writer 一次（gpt-5） ≈ 30K input + 12K output  
- QA 一次 ≈ 20K input + 4K output  

按 gpt-5-mini ($0.25 / $2 per 1M tok) + gpt-5 ($2.5 / $10 per 1M tok) 当前定价约 **$0.30-0.50 一期**（不含 web search / embeddings）。Tavily 一期 ~$0.10，OpenAI embedding ~$0.01。

> 这是 2026-05-05 单 key 迁移之后的价格。迁移之前用 Sonnet 4.5 + Opus 4.7
> 跑一期是 $2-4，单步 writer 就要 ~$1.5；现在整条流水线总成本都低于那个数。

---

## 出问题怎么办

| 症状 | 解法 |
|---|---|
| `[FATAL] Missing env var OPENAI_API_KEY` | export / setx 一下，或在 Actions secrets 加 |
| `Validator returned non-zero` | 看上面 report 找哪条 record 的 URL / 日期挂了；要么手改 verified_records.json，要么 `--start-at 4` 让 LLM 重跑 |
| LLM 返回非 JSON | safe_json_load 会自动尝试一次修复；仍失败的话看 stdout 里的前 500 字检查输出格式 |
| sync_to_db 报数据库连不上 | 看 DATABASE_URL，本地 docker postgres 可能在 5433 不是 5432 |
| 整条 pipeline 中断 | 直接 `--start-at <下一步>` 续跑，前面的 artifact 不会被覆盖 |
