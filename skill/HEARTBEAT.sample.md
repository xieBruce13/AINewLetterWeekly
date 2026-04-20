tasks:

- name: model-official-scan
  interval: 12h
  prompt: >
    Check official update pages for OpenAI, Anthropic, Google, Meta, Mistral, and xAI.
    Only surface something if there is a real capability, pricing, access, or selection-impact change.
    If a new signal is found, append a JSON record to newsletter_runs/current_week/signals.jsonl
    with fields: timestamp, module (model), name, source_url, source_tier (official), summary, confidence.
    If nothing important changed, reply HEARTBEAT_OK.

- name: model-tech-signal-scan
  interval: 24h
  prompt: >
    Check Hugging Face Trending Papers, Hugging Face Trending Models, GitHub Trending, and Hacker News
    for any model-related technical signals: trending papers, repos, or developer discussions.
    Only flag items that suggest a real capability shift or widespread ecosystem adoption.
    If a signal is found, append to newsletter_runs/current_week/signals.jsonl
    with source_tier set to "technical-signal".
    If nothing notable, reply HEARTBEAT_OK.

- name: model-validation-scan
  interval: 24h
  prompt: >
    Check external validation sources: Artificial Analysis, Arena/LMSYS-style rankings, LiveBench.
    Look for newly scored models or significant ranking changes for any model seen this week.
    If found, append to newsletter_runs/current_week/signals.jsonl
    with source_tier set to "third-party-validation".
    If nothing notable, reply HEARTBEAT_OK.

- name: product-changelog-scan
  interval: 12h
  prompt: >
    Check official changelogs: ChatGPT Release Notes, Claude Release Notes, Gemini Apps Release Notes,
    Perplexity Changelog, xAI developer release notes.
    Only surface real feature launches, access changes, or workflow-affecting updates.
    If found, append to newsletter_runs/current_week/signals.jsonl
    with module set to "product" and source_tier set to "official-changelog".
    If nothing notable, reply HEARTBEAT_OK.

- name: product-launch-scan
  interval: 12h
  prompt: >
    Check Product Hunt (AI topic), major AI newsletters, and credible tech media for AI product launches.
    Prioritize workflow changes, new product forms, and creator/AIGC relevance.
    If found, append to newsletter_runs/current_week/signals.jsonl
    with module set to "product" and source_tier set to "discovery-platform" or "media".
    If nothing notable, reply HEARTBEAT_OK.

- name: community-signal-scan
  interval: 24h
  prompt: >
    Check Reddit (r/artificial, r/singularity, r/LocalLLaMA, product-specific subs), Hacker News,
    and X for early user feedback on any candidate model or product items already collected this week.
    Read newsletter_runs/current_week/signals.jsonl first to see what has been collected.
    Append community reactions as separate records with source_tier "community".
    If nothing notable, reply HEARTBEAT_OK.

# Signal persistence protocol
#
# All heartbeat tasks write to the same file: newsletter_runs/current_week/signals.jsonl
# Format: one JSON object per line, append-only, never overwrite.
# Each record must include: timestamp, module, name, source_url, source_tier, summary, confidence.
#
# When the weekly SKILL runs (Step 0), it reads this file as pre-collected input.
# After the weekly newsletter is finalized, the file is moved to newsletter_runs/YYYY-MM-DD/signals.jsonl
# and a fresh current_week/signals.jsonl is created for the next cycle.

# Alert rules
# - Keep heartbeat output short.
# - Only alert the user when a signal might change this week's newsletter ranking.
# - Distinguish clearly between official facts, external validation, and community temperature.
# - If nothing important changed, reply HEARTBEAT_OK (do not fabricate signals).
