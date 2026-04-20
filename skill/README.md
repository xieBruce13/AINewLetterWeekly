# OpenClaw Newsletter Workflow Bundle

This bundle turns a newsletter SOP into a reusable OpenClaw skill for weekly AI model + product editorial briefings.

## What this is NOT

This is not a news aggregator. It is an **editorial judgment system** that:
- collects from tiered sources (official → technical signals → newsletters → community)
- verifies claims against primary evidence
- scores by anchored rubrics with explicit gates
- triages into main / brief / drop tiers
- writes structured output with mandatory information-layer separation

## What is included

| File | Purpose |
|------|---------|
| `newsletter_weekly/SKILL.md` | Workflow instructions: 9-step pipeline from scope lock to editorial QA |
| `newsletter_weekly/rubric.json` | Scoring rubrics with anchored dimensions, gates, thresholds, and diversity rules |
| `newsletter_weekly/record_schemas.json` | Structured record schemas with source tier, confidence, verification status, gate results |
| `newsletter_weekly/output_template.md` | Output scaffold with overview tables, interaction flows, brief/dropped sections, editorial actions |
| `HEARTBEAT.sample.md` | Periodic source-scan tasks with signal persistence protocol |
| `RUNBOOK.md` | Compact step-by-step execution reference + failure mode mitigations |
| `INSTALL.md` | Installation and usage notes |

## Where to put it

Per OpenClaw docs, workspace skills live in `<workspace>/skills/`, and each skill is a directory containing a `SKILL.md` with YAML frontmatter.

```
<workspace>/
  skills/
    newsletter_weekly/
      SKILL.md
      rubric.json
      record_schemas.json
      output_template.md
  HEARTBEAT.md          # optional, copied from HEARTBEAT.sample.md
  newsletter_runs/      # auto-created by the skill
    current_week/
      signals.jsonl     # HEARTBEAT writes here; SKILL reads at Step 0
    YYYY-MM-DD/
      raw_model_records.json
      raw_product_records.json
      scored_records.json
      triage_decisions.json
      newsletter_draft.md
      signals.jsonl     # archived from current_week after each run
```

## Workflow overview

```
Step 0: Scope Lock
    ↓
Step 1: Collect by Source Tier (Tier 1 → 2 → 3, per module)
    ↓
Step 2: Pre-filter Gate Check (is it real? evidence sufficient?)
    ↓
Step 3: Normalize into Records (record_schemas.json)
    ↓
Step 4: Verify / Cross-reference (trace claims to primary URLs)
    ↓
Step 5: Score by Rubric (rubric.json, with justifications)
    ↓
Step 6: Triage — Three-tier Keep (main / brief / drop)
    ↓
Step 7: Write Newsletter (output_template.md)
    ↓
Step 8: Editorial QA (checklist)
    ↓
Step 9: Archive (newsletter_runs/YYYY-MM-DD/)
```

## Scheduling

- **Weekly report:** Use cron / scheduled tasks to trigger the full SKILL workflow.
- **Daily signal scan:** Use HEARTBEAT for lightweight periodic source checks that accumulate signals throughout the week.
- HEARTBEAT and SKILL are complementary, not redundant. HEARTBEAT collects signals; SKILL processes them into a newsletter.
