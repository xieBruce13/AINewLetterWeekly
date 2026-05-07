"""run_pipeline.py — autonomous newsletter pipeline runner.

Translates the multi-agent SOP in `.claude/agents/*.md` into a Python
script that can run unattended (cron / GitHub Actions / Windows Task
Scheduler), without needing a human in Claude Code or Cursor to dispatch
each agent. The translation is intentionally lossy:

  - Each `.claude/agents/<name>.md` agent prompt becomes a single
    OpenAI Chat Completions call (system + user message). The agent that
    originally delegated to subagents is collapsed into one chained call
    sequence here. We trade fine-grained subagent isolation for the
    ability to run end-to-end without an IDE harness.

  - Single-key migration (2026-05-05): every LLM call now goes through
    OpenAI (`gpt-5-mini` for steps 1-6/8, `gpt-5` for the writer) instead
    of Anthropic Claude. Embeddings already used OpenAI, so the pipeline
    needs only one API key (`OPENAI_API_KEY`).

  - The `WebSearch` and `WebFetch` tools the agents had inside Claude
    Code are stubbed out with a simple Tavily API call (or omitted with
    a warning when no key is set). This is the biggest fidelity loss —
    a real production runner would want to plug in proper search +
    fetch tooling.

  - The `Bash` tool is gone. The runner shells out to local subprocess
    for the publisher's `validate_records.py` + `sync_to_db.py` calls,
    not via the LLM.

What the runner does:

  Step 0  Scope lock — write run_header.md from defaults + CLI args.
  Step 1  Collector — single LLM call per module (model + product),
          asking for raw candidates with raw_urls. Optional Tavily
          search if TAVILY_API_KEY is set.
  Step 2  Filter — LLM applies gates from skill/rubric.json.
  Step 3  Normalizer — LLM expands to full schema.
  Step 4  Verifier — LLM cross-checks claims, then we run
          tools/validate_records.py to enforce URL+freshness gates.
  Step 5  Scorer — LLM applies rubric.
  Step 6  Triage — LLM picks main / brief / drop.
  Step 7  Writer — LLM composes newsletter_draft.md.
  Step 8  QA — LLM runs SOP checklist, returns PASS or revisions.
  Step 9  Publisher — call tools/sync_to_db.py to push to live DB.

Required env:
  OPENAI_API_KEY       — for every LLM call AND for Step 9 embeddings.
                          (The runner *will* refuse to start without this;
                          document the failure clearly rather than
                          producing junk.)
  DATABASE_URL         — for Step 9 sync.
  TAVILY_API_KEY       — optional (Step 1 web search).

CLI:
  python tools/run_pipeline.py
  python tools/run_pipeline.py --date 2026-05-09 --modules model,product
  python tools/run_pipeline.py --dry-run            # write artifacts, skip sync
  python tools/run_pipeline.py --skip-collect       # rerun from filter onwards
                                                     (uses existing raw_*.json)

The runner is OPINIONATED about file layout — it strictly reads/writes
the artifact filenames the orchestrator agent expects, so you can
hand-edit any intermediate JSON and resume from any step with --start-at.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys
import textwrap
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

REPO_ROOT = Path(__file__).resolve().parent.parent
RUNS_DIR = REPO_ROOT / "newsletter_runs"
AGENTS_DIR = REPO_ROOT / ".claude" / "agents"
SKILL_DIR = REPO_ROOT / "skill"

# --------------------------------------------------------------------------
# LLM client — OpenAI SDK
# --------------------------------------------------------------------------

# Default model for steps 1-6 and 8. gpt-5-mini gives us roughly Sonnet-4.5
# quality for structured-JSON tasks (filter / score / triage / verify) at
# ~$0.25 / $2 per 1M input/output tokens — about 10× cheaper than Sonnet.
DEFAULT_MODEL = "gpt-4o-mini"
WRITER_MODEL = "gpt-4o"


def _require_key(name: str) -> str:
    val = os.environ.get(name)
    if not val:
        sys.stderr.write(
            f"\n[FATAL] Missing env var {name}.\n"
            "  This runner needs an OpenAI API key to call any of the\n"
            "  pipeline agents. Set it in your shell or .env then re-run:\n"
            f"    $env:{name} = '...'   # PowerShell\n"
            f"    export {name}=...      # bash\n\n"
            "  If you want to see the runner's structure without an API key,\n"
            "  pass --dry-run-no-llm to print the prompts instead of calling.\n\n"
        )
        raise SystemExit(2)
    return val


def call_llm(
    system: str,
    user: str,
    *,
    model: str = DEFAULT_MODEL,
    max_tokens: int = 8192,
    temperature: float = 0.3,
    expect_json: bool = False,
    dry_run: bool = False,
) -> str:
    """Call OpenAI Chat Completions with one system prompt + one user message.

    `expect_json=True` adds a strong instruction to wrap the response in
    a single JSON code block, then strips the fences before returning.
    We deliberately do NOT use OpenAI's `response_format=json_object`
    mode here, because several pipeline steps return a JSON ARRAY at
    the top level (collect / filter / normalize / score / triage) and
    json_object mode would force them into `{...}` instead. The fence-
    stripping path handles both arrays and objects.

    On failure we DON'T retry silently — pipeline runs are expensive,
    we want loud errors.
    """
    if dry_run:
        return f"[DRY-RUN] would call {model}\nsystem:\n{system[:200]}...\nuser:\n{user[:200]}..."

    _require_key("OPENAI_API_KEY")
    try:
        from openai import OpenAI
    except ImportError:
        sys.stderr.write(
            "[FATAL] openai SDK not installed. Run:\n"
            "    pip install 'openai>=1.40'\n"
        )
        raise SystemExit(2)

    client = OpenAI()
    if expect_json:
        user += (
            "\n\n---\n"
            "Reply with a single JSON value — no prose before or after.\n"
            "If you must wrap it, use ```json ... ``` fences. Do not add commentary."
        )

    request_kwargs: dict[str, Any] = {
        "model": model,
        "max_completion_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    request_kwargs["temperature"] = temperature

    resp = client.chat.completions.create(**request_kwargs)
    text = resp.choices[0].message.content or ""
    if expect_json:
        return _extract_json_block(text)
    return text


def _extract_json_block(text: str) -> str:
    m = re.search(r"```json\s*(.+?)\s*```", text, re.DOTALL)
    if m:
        return m.group(1).strip()
    # Fallback: hope the whole response is parseable JSON.
    return text.strip()


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

@dataclass
class RunContext:
    issue_date: str
    run_dir: Path
    modules: list[str]
    focus_topics: list[str] = field(default_factory=list)
    must_include: list[str] = field(default_factory=list)
    exclude_topics: list[str] = field(default_factory=list)
    audience: str = "general"
    top_n_per_module: int = 4
    dry_run: bool = False
    dry_run_no_llm: bool = False


def load_agent_prompt(name: str) -> str:
    """Read an agent's system prompt from .claude/agents/<name>.md.

    The first frontmatter block (`---\n...\n---`) is stripped — that's
    Claude Code metadata, not part of the LLM system prompt.
    """
    p = AGENTS_DIR / f"{name}.md"
    if not p.exists():
        raise FileNotFoundError(f"Agent prompt not found: {p}")
    raw = p.read_text(encoding="utf-8")
    # Strip frontmatter
    raw = re.sub(r"\A---\n.*?\n---\n", "", raw, count=1, flags=re.DOTALL)
    return raw.strip()


def load_skill_doc(name: str) -> str:
    p = SKILL_DIR / name
    if not p.exists():
        return ""
    return p.read_text(encoding="utf-8")


def write_artifact(ctx: RunContext, name: str, data: Any) -> Path:
    p = ctx.run_dir / name
    if isinstance(data, (dict, list)):
        p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    else:
        p.write_text(str(data), encoding="utf-8")
    return p


def read_artifact(ctx: RunContext, name: str) -> Any:
    p = ctx.run_dir / name
    if not p.exists():
        return None
    txt = p.read_text(encoding="utf-8")
    if name.endswith(".json"):
        return json.loads(txt)
    return txt


def step_banner(n: int, name: str):
    print(f"\n========== Step {n}: {name} ==========", flush=True)


def safe_json_load(text: str) -> Any:
    """Parse JSON returned by the LLM, with one auto-repair attempt for
    common issues (trailing commas, leading prose). Raises on hard failure."""
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Attempt: drop everything before first `[` or `{`
        for i, ch in enumerate(text):
            if ch in "[{":
                try:
                    return json.loads(text[i:])
                except json.JSONDecodeError:
                    pass
        raise


# --------------------------------------------------------------------------
# Step 0 — scope lock
# --------------------------------------------------------------------------

def step_0_scope_lock(ctx: RunContext) -> None:
    step_banner(0, "Scope lock")
    header = textwrap.dedent(
        f"""\
        # Run header — {ctx.issue_date}

        - **Time window:** {ctx.issue_date} (past 7 days)
        - **Modules:** {', '.join(ctx.modules)}
        - **Top N per module:** {ctx.top_n_per_module}
        - **Audience:** {ctx.audience}
        - **Focus topics:** {', '.join(ctx.focus_topics) if ctx.focus_topics else '(none — all topics)'}
        - **Must include:** {', '.join(ctx.must_include) if ctx.must_include else '(none)'}
        - **Exclude topics:** {', '.join(ctx.exclude_topics) if ctx.exclude_topics else '(none)'}
        - **Output:** structured JSON + Markdown draft → Postgres sync
        - **Language:** Chinese (LLM prompts in English, output in Chinese)
        """
    )
    write_artifact(ctx, "run_header.md", header)
    print("  [OK] run_header.md")


# --------------------------------------------------------------------------
# Step 1 — collector  (one LLM call per module, plus optional Tavily)
# --------------------------------------------------------------------------

def step_1_collect(ctx: RunContext) -> None:
    step_banner(1, "Collect raw candidates")
    sys_prompt = load_agent_prompt("collector")
    skill = load_skill_doc("SKILL.md")
    today = dt.date.fromisoformat(ctx.issue_date)
    window_start = today - dt.timedelta(days=7)

    # Optional: Tavily web-search results to ground the LLM. This is the
    # biggest deviation from the original .claude/agents/collector.md
    # which used Claude Code's WebSearch tool. Without Tavily, we just
    # rely on the LLM's training-cutoff awareness — accuracy drops.
    grounding = ""
    if os.environ.get("TAVILY_API_KEY"):
        grounding = _tavily_grounding(ctx, window_start, today)
    else:
        print(
            "  [WARN] TAVILY_API_KEY not set — collector runs without "
            "fresh web search grounding. Verifier will still URL-ping.",
            flush=True,
        )

    for module in ctx.modules:
        user = textwrap.dedent(
            f"""\
            # Run header
            {(ctx.run_dir / 'run_header.md').read_text(encoding='utf-8')}

            # SOP excerpt (skill/SKILL.md)
            (Use this as authoritative — every record's verification will run
            against the gates here.)
            {skill[:8000]}

            # Module to collect
            **{module}**

            # Time window
            {window_start.isoformat()} → {ctx.issue_date}

            {grounding}

            # Output
            Return a JSON array of raw candidate records. Each record needs:
              name, company, source_tier, raw_urls (≥ 1 real URL),
              published_date (within the window), summary (1-2 sentences),
              tags (3-6 short slugs).
            Aim for 8-15 candidates — downstream filters will trim.
            """
        )
        if ctx.dry_run_no_llm:
            print(f"  [dry-run-no-llm] would collect {module} candidates")
            continue
        text = call_llm(
            sys_prompt,
            user,
            expect_json=True,
            max_tokens=12000,
            dry_run=ctx.dry_run_no_llm,
        )
        try:
            records = safe_json_load(text)
        except json.JSONDecodeError as e:
            print(f"  [ERROR] {module} collector returned non-JSON: {e}")
            print(text[:500])
            raise
        write_artifact(ctx, f"raw_{module}_records.json", records)
        print(f"  [OK] {module}: {len(records)} candidates")


def _tavily_grounding(ctx: RunContext, start: dt.date, end: dt.date) -> str:
    """Lightweight Tavily search to surface a few seed URLs per module."""
    try:
        import requests
    except ImportError:
        return ""
    key = os.environ["TAVILY_API_KEY"]
    queries = [
        f"AI model release {start} {end}",
        f"AI product launch {start} {end}",
        f"agent infrastructure announcement {start} {end}",
    ]
    blocks = []
    for q in queries:
        try:
            r = requests.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": key,
                    "query": q,
                    "max_results": 5,
                    "topic": "news",
                    "days": 8,
                },
                timeout=20,
            )
            if r.ok:
                results = r.json().get("results", [])
                lines = [
                    f"- {x.get('title','?')} — {x.get('url','')}"
                    for x in results
                ]
                blocks.append(f"## Search: {q}\n" + "\n".join(lines))
        except Exception as e:
            print(f"  [warn] Tavily query failed: {e}")
    if not blocks:
        return ""
    return "# Fresh web search grounding (Tavily)\n\n" + "\n\n".join(blocks) + "\n"


# --------------------------------------------------------------------------
# Steps 2-7 — generic LLM-passthrough
# --------------------------------------------------------------------------

GENERIC_STEPS: list[dict[str, Any]] = [
    {
        "n": 2,
        "name": "Filter",
        "agent": "filter",
        "input_files": ["raw_model_records.json", "raw_product_records.json"],
        "output_file": "filtered_records.json",
        "expect_json": True,
    },
    {
        "n": 3,
        "name": "Normalize",
        "agent": "normalizer",
        "input_files": ["filtered_records.json"],
        "output_file": "normalized_records.json",
        "expect_json": True,
    },
    {
        "n": 4,
        "name": "Verify (LLM cross-check)",
        "agent": "verifier",
        "input_files": ["normalized_records.json"],
        "output_file": "verified_records.json",
        "expect_json": True,
    },
    {
        "n": 5,
        "name": "Score",
        "agent": "scorer",
        "input_files": ["verified_records.json"],
        "output_file": "scored_records.json",
        "expect_json": True,
    },
    {
        "n": 6,
        "name": "Triage",
        "agent": "triage-editor",
        "input_files": ["scored_records.json"],
        "output_file": "triage_decisions.json",
        "expect_json": True,
    },
    {
        "n": 7,
        "name": "Write draft",
        "agent": "writer",
        "input_files": ["verified_records.json", "triage_decisions.json"],
        "output_file": "newsletter_draft.md",
        "expect_json": False,
        "model": WRITER_MODEL,
        "max_tokens": 16000,
    },
    {
        "n": 8,
        "name": "QA",
        "agent": "qa-reviewer",
        "input_files": ["newsletter_draft.md"],
        "output_file": "qa_report.md",
        "expect_json": False,
    },
]


def step_generic(ctx: RunContext, spec: dict[str, Any]) -> None:
    step_banner(spec["n"], spec["name"])
    sys_prompt = load_agent_prompt(spec["agent"])
    inputs = []
    for fname in spec["input_files"]:
        p = ctx.run_dir / fname
        if not p.exists():
            print(f"  [WARN] missing input {fname} — skipping step")
            return
        inputs.append(f"## {fname}\n```\n{p.read_text(encoding='utf-8')[:30000]}\n```")
    user = (
        f"# Run header\n{(ctx.run_dir / 'run_header.md').read_text(encoding='utf-8')}\n\n"
        + "\n\n".join(inputs)
        + f"\n\n# Task\nProduce `{spec['output_file']}` per your role. "
        + ("Output JSON only." if spec["expect_json"] else "Output Markdown.")
    )
    text = call_llm(
        sys_prompt,
        user,
        expect_json=spec["expect_json"],
        model=spec.get("model", DEFAULT_MODEL),
        max_tokens=spec.get("max_tokens", 8192),
        dry_run=ctx.dry_run_no_llm,
    )
    if spec["expect_json"]:
        data = safe_json_load(text)
        write_artifact(ctx, spec["output_file"], data)
        size = len(data) if isinstance(data, list) else "—"
        print(f"  [OK] {spec['output_file']} ({size} records)")
    else:
        write_artifact(ctx, spec["output_file"], text)
        print(f"  [OK] {spec['output_file']} ({len(text)} chars)")


# --------------------------------------------------------------------------
# Step 4B — local validator (real URL pings + freshness)
# --------------------------------------------------------------------------

def step_4b_validator(ctx: RunContext) -> None:
    step_banner(4, "Validator (local URL+freshness gate)")
    cmd = [
        sys.executable,
        str(REPO_ROOT / "tools" / "validate_records.py"),
        str(ctx.run_dir),
        "--max-age",
        "14",
    ]
    print("  Running:", " ".join(cmd))
    rc = subprocess.call(cmd)
    if rc != 0:
        print(
            "  [WARN] Validator returned non-zero. Inspect the report above\n"
            "  and either fix the verified_records.json by hand, or rerun the\n"
            "  verifier (--start-at 4) so the LLM has another shot. Continuing\n"
            "  the pipeline anyway — sync_to_db will re-validate as a final gate."
        )


# --------------------------------------------------------------------------
# Step 9 — publisher (sync to DB)
# --------------------------------------------------------------------------

def step_9_publish(ctx: RunContext) -> None:
    step_banner(9, "Publish (sync to Postgres)")
    if ctx.dry_run:
        print("  [DRY-RUN] skipping sync_to_db.py")
        return
    cmd = [
        sys.executable,
        str(REPO_ROOT / "tools" / "sync_to_db.py"),
        str(ctx.run_dir),
    ]
    if not os.environ.get("OPENAI_API_KEY"):
        print("  [WARN] OPENAI_API_KEY not set — passing --no-embed")
        cmd.append("--no-embed")
    print("  Running:", " ".join(cmd))
    rc = subprocess.call(cmd)
    if rc != 0:
        sys.stderr.write(f"sync_to_db failed (rc={rc}). Run output above.\n")
        raise SystemExit(rc)


# --------------------------------------------------------------------------
# Driver
# --------------------------------------------------------------------------

STEP_NAMES = {
    0: "scope",
    1: "collect",
    2: "filter",
    3: "normalize",
    4: "verify",
    5: "score",
    6: "triage",
    7: "write",
    8: "qa",
    9: "publish",
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--date",
        default=dt.date.today().isoformat(),
        help="Issue date (YYYY-MM-DD). Default: today.",
    )
    parser.add_argument(
        "--modules",
        default="model,product",
        help="Comma-separated module list. Default: model,product",
    )
    parser.add_argument("--focus-topics", default="")
    parser.add_argument("--exclude-topics", default="")
    parser.add_argument("--must-include", default="")
    parser.add_argument("--audience", default="general")
    parser.add_argument("--top-n-per-module", type=int, default=4)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run all LLM steps and write artifacts, but DO NOT sync to DB.",
    )
    parser.add_argument(
        "--dry-run-no-llm",
        action="store_true",
        help="Skip every LLM call; print the prompts. Useful for offline review.",
    )
    parser.add_argument(
        "--start-at",
        type=int,
        default=0,
        help="Start at step N (0-9). Earlier artifacts must already exist.",
    )
    parser.add_argument(
        "--stop-at",
        type=int,
        default=9,
        help="Stop after step N (0-9). Default: 9 (full pipeline).",
    )
    args = parser.parse_args()

    issue_date = args.date
    run_dir = RUNS_DIR / issue_date
    run_dir.mkdir(parents=True, exist_ok=True)

    ctx = RunContext(
        issue_date=issue_date,
        run_dir=run_dir,
        modules=[m.strip() for m in args.modules.split(",") if m.strip()],
        focus_topics=[t.strip() for t in args.focus_topics.split(",") if t.strip()],
        exclude_topics=[t.strip() for t in args.exclude_topics.split(",") if t.strip()],
        must_include=[t.strip() for t in args.must_include.split(",") if t.strip()],
        audience=args.audience,
        top_n_per_module=args.top_n_per_module,
        dry_run=args.dry_run,
        dry_run_no_llm=args.dry_run_no_llm,
    )

    print(f"Pipeline run for {issue_date} → {run_dir}")
    print(f"Modules: {ctx.modules}")
    print(f"Steps {args.start_at}..{args.stop_at}")

    started = time.time()

    if args.start_at <= 0 <= args.stop_at:
        step_0_scope_lock(ctx)
    if args.start_at <= 1 <= args.stop_at:
        step_1_collect(ctx)
    for spec in GENERIC_STEPS:
        n = spec["n"]
        if not (args.start_at <= n <= args.stop_at):
            continue
        step_generic(ctx, spec)
        if n == 4:
            # Run the local URL-ping gate immediately after the LLM verifier
            # so the publisher never sees stale data.
            step_4b_validator(ctx)

    if args.start_at <= 9 <= args.stop_at:
        step_9_publish(ctx)

    elapsed = time.time() - started
    print(f"\nDone. Total elapsed: {elapsed:.1f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
