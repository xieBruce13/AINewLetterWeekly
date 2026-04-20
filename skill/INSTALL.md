# Install

## 1) Copy the skill folder

Copy `newsletter_weekly/` into your OpenClaw workspace:

```bash
mkdir -p <workspace>/skills
cp -R newsletter_weekly <workspace>/skills/
```

OpenClaw docs: a skill is a directory containing `SKILL.md` with YAML frontmatter; workspace skills live in `<workspace>/skills/`.

## 2) Set up the run directory

Create the signal accumulation folder:

```bash
mkdir -p <workspace>/newsletter_runs/current_week
```

This is where HEARTBEAT tasks write daily signals, and where the SKILL reads them at Step 0.

## 3) Reload skills

Start a new session or restart the gateway:

```bash
/new
# or
openclaw gateway restart
openclaw skills list
```

## 4) Optional: enable periodic monitoring

Copy `HEARTBEAT.sample.md` to `<workspace>/HEARTBEAT.md` to enable daily source-check scans:

```bash
cp HEARTBEAT.sample.md <workspace>/HEARTBEAT.md
```

HEARTBEAT tasks will append signals to `newsletter_runs/current_week/signals.jsonl` throughout the week.

## 5) Recommended usage prompts

Full run:
- `按 newsletter SOP 跑一版这周模型和产品新闻`
- `做一版过去 7 天 AI 产品与模型周报，按我们既定结构`

Module-specific:
- `只跑产品模块，保留 top 5，重点看 workflow 变化`
- `只跑模型模块，强调选型影响和外部验证`

With overrides:
- `把 Recall、Adobe、Chrome Skills 设为 must include`
- `这周额外看一下 Midjourney 和 Flux 的更新`

## 6) Scheduling recommendation

| Task | Method | Frequency |
|------|--------|-----------|
| Daily signal collection | HEARTBEAT | Every 12-24h (configured in HEARTBEAT.md) |
| Weekly newsletter generation | Cron / Scheduled Task / manual prompt | Once per week |
| Post-run archive | Automatic (SKILL Step 9) | After each newsletter run |

## 7) Understanding the output

The newsletter output follows `output_template.md` and includes:

1. **本周结论** — week-level executive summary
2. **模型模块** — overview table + expanded entries
3. **产品模块** — overview table + expanded entries
4. **简讯** — brief mentions (scored but below main threshold)
5. **本周排除项** — dropped items with reasons
6. **编辑部判断** — editorial trend analysis + project actions + next week watch list
7. **参考来源** — all sources grouped by module and tier
