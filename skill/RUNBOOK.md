# Runbook — Newsletter Weekly Workflow

This is the compact, reproducible workflow reference. It describes what each step does and what to check at each stage.

## Pre-run

- If `newsletter_runs/current_week/signals.jsonl` exists, read it for pre-collected HEARTBEAT signals.
- Confirm scope: time window, modules, top N, audience, focus topics, must-include, language.

## Step-by-step

### Step 0: Scope Lock
- Write a run header with all parameters.
- State defaults explicitly if user didn't specify.

### Step 1: Collect by Source Tier
- **Models:** Tier 1 (official) → Tier 2 (HF/GitHub/HN/arXiv) → Tier 3 (newsletters). Cross-check with validation sources (Arena, Artificial Analysis, LiveBench).
- **Products:** Tier 1 (official changelogs) → Tier 2 (PH/discovery + distribution signals) → Tier 3 (newsletters/media) + community.
- Always go in tier order. Do not skip to Tier 3 before Tier 1.

### Step 2: Pre-filter (Gate Check)
- Models: Is it a model event? Has Tier 1/2 source? Minimum evidence met?
- Products: User can perceive today? Evidence beyond a single source?
- Gate failures → drop or watchlist. Do not waste scoring effort on non-qualifying items.

### Step 3: Normalize into Records
- Fill all `record_schemas.json` fields.
- Tag `source_tier`, `confidence`, `verification_status`, `gate_results`.
- Keep official / third-party / community clearly separated within each record.

### Step 4: Verify / Cross-reference
- For each record: can every official claim be traced to a specific URL?
- Are there external benchmarks or community reproductions?
- Mark unverifiable claims. Update `verification_status` and `confidence`.

### Step 5: Score by Rubric
- Apply `rubric.json` dimensions. Each score must have a 1-sentence justification.
- Models: real_capability_change + selection_impact + evidence_quality + ecosystem_echo + durability + hype_penalty (range: -3 to 10).
- Products: user_visibility + access_barrier_change + workflow_change + distribution_change + user_reaction + relevance + evidence_quality + hype_penalty (range: -3 to 16).

### Step 6: Triage (Three-tier)
- Models: ≥7 → main, 5–6 → brief, <5 → drop.
- Products: ≥10 → main, 7–9 → brief, <7 → drop.
- Apply diversity rule: max N-1 entries from same company in top N.
- Apply editorial override: if both editorial gates fail, demote regardless of score.
- Record all triage decisions and reasons.

### Step 7: Write
- Follow `output_template.md` strictly.
- Top-down: week summary → method → module summary → overview table → main entries → brief table → dropped table → editorial judgment → sources.
- Use tables for: module overview, capability changes, interaction logic, 信息分层.
- Each product gets a specific interaction flow, not a generic placeholder.

### Step 8: Editorial QA
Run the checklist in SKILL.md Step 8. Fix any "no" before publishing.

## Post-run

- Save all artifacts to `newsletter_runs/YYYY-MM-DD/`.
- Move `current_week/signals.jsonl` to the dated folder.
- Create a fresh `current_week/signals.jsonl` for the next cycle.

## Failure modes to watch for

| Risk | Mitigation |
|------|-----------|
| Tier 1 sources empty this week | Write "no major official updates" — do not backfill with Tier 3 speculation |
| PH/Reddit hype inflates weak products | Gate check + anchored hype_penalty + require evidence beyond single source |
| External benchmark missing for new model | Mark confidence as "low", flag in 信息分层 table, note in risk_caveat |
| Fewer than 3 qualifying main items | Allow 2 main + note "lighter week" in summary — do not force weak items into main |
| One company dominates top N | Diversity rule: demote weakest, promote next-best from different company |
| Concept product with no public access | Gate: max tier = brief |
| Skill runs with no HEARTBEAT pre-scan | Acceptable — Step 1 collection covers it; HEARTBEAT just gives a head start |
