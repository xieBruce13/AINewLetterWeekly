"""sync_to_db.py — push a finished newsletter run into Postgres.

The pipeline (.claude/agents/publisher.md) calls this from inside a run folder:

    cd newsletter_runs/2026-04-19
    python ../../tools/sync_to_db.py .

It reads the JSON artifacts produced by the upstream agents:
  - verified_records.json        (full normalized records — preferred source)
  - normalized_records.json      (fallback)
  - scored_records.json          (for total_score, item_tier)
  - triage_decisions.json        (for item_tier overrides + ranking)
  - newsletter_draft.md          (only inspected to extract the published headline)

…and upserts each MAIN/BRIEF item into the `news_items` table. Items already in
the DB (matched by `slug`) are updated in-place. Embeddings are computed via
OpenAI text-embedding-3-small (1536 dims) — the cheapest workable model.

Usage:
    python tools/sync_to_db.py path/to/newsletter_runs/YYYY-MM-DD
    python tools/sync_to_db.py .                # cwd is a run folder
    python tools/sync_to_db.py --all            # backfill every run folder

Env:
    DATABASE_URL       Postgres connection string (required)
    OPENAI_API_KEY     Required unless --no-embed is passed
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

try:
    import psycopg
    from psycopg.types.json import Json
except ImportError as exc:  # pragma: no cover
    sys.stderr.write(
        "psycopg[binary] is required. Install with: "
        "pip install 'psycopg[binary]>=3.2' requests\n"
    )
    raise

try:
    import requests
except ImportError as exc:  # pragma: no cover
    sys.stderr.write("requests is required. pip install requests\n")
    raise

# Local validator — freshness + URL reachability gates run before any record
# touches Postgres. See tools/validate_records.py for policy.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from validate_records import (  # noqa: E402
    format_report,
    validate_records,
)


REPO_ROOT = Path(__file__).resolve().parent.parent
RUNS_DIR = REPO_ROOT / "newsletter_runs"
EMBED_MODEL = "text-embedding-3-small"
EMBED_DIM = 1536


# ---------------------------------------------------------------------------
# Loading and shaping records
# ---------------------------------------------------------------------------

@dataclass
class FlatRecord:
    """The flat shape we insert into Postgres."""

    slug: str
    module: str
    name: str
    company: str
    version: str | None
    issue_date: str
    item_tier: str
    total_score: int
    source_tier: str | None
    verification_status: str | None
    confidence: str | None
    headline: str
    one_line_judgment: str | None
    relevance_to_us: str | None
    tags: list[str]
    image_urls: list[str]
    primary_image: str | None
    record: dict[str, Any]
    embedding_text: str  # text used to compute the embedding
    # When the actual story happened in the world (not when the issue was
    # published). Pulled from `record.published_date` if present, otherwise
    # falls back to the issue date.
    published_date: str | None


def _read_json(path: Path) -> Any:
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def slugify(value: str) -> str:
    # Strip CJK / punctuation entirely. Slugs are URL identifiers; CJK in
    # the path makes encoding round-trips fragile (Next.js dynamic routes
    # behave inconsistently across browsers + dev/prod). The display
    # `headline`, `name`, etc. preserve the original CJK — only the URL
    # identifier is ASCII-only.
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower())
    return re.sub(r"-+", "-", value).strip("-")[:80] or "item"


def derive_tags(rec: dict[str, Any]) -> list[str]:
    """Heuristically bucket a record into tags the cheap rerank can use.

    Pure free-text inference would be ideal but expensive; this catches the
    common axes our editorial team scores against (see skill/rubric.json).
    """
    blob_parts: list[str] = []
    for key in (
        "name",
        "company",
        "headline",
        "one_line_judgment",
        "relevance_to_us",
        "core_positioning",
        "problem_it_solves",
        "real_change_notes",
        "selection_impact_notes",
        "workflow_change",
        "interaction_pattern",
        "new_product_form",
    ):
        v = rec.get(key)
        if isinstance(v, str):
            blob_parts.append(v)
    blob = " ".join(blob_parts).lower()

    tag_map = {
        "coding": ("coding", "code", "swe-bench", "developer"),
        "agent": ("agent", "agents", "agentic", "tool-use", "tool calling"),
        "long-context": ("long context", "context window", "1m token", "1m context"),
        "reasoning": ("reasoning", "reasoner", "o1", "thinking"),
        "image-gen": ("image", "midjourney", "flux", "diffusion", "图像"),
        "video-gen": ("video", "runway", "luma", "sora", "pika"),
        "voice": ("voice", "tts", "speech", "elevenlabs", "suno"),
        "design": ("design", "figma", "canva", "framer", "ui"),
        "creative-tool": ("creative", "creator", "creation", "aigc", "创作"),
        "workflow": ("workflow", "pipeline", "automation"),
        "multimodal": ("multimodal", "vision", "audio"),
        "open-weight": ("open weight", "open-weight", "open source", "huggingface"),
        "pricing": ("price", "pricing", "$", "free tier", "tier"),
        "browser-agent": ("browser", "computer use", "operator"),
        "knowledge": ("notion", "obsidian", "knowledge"),
    }
    tags: list[str] = []
    for tag, needles in tag_map.items():
        if any(n in blob for n in needles):
            tags.append(tag)

    company = (rec.get("company") or "").lower()
    big_co = {
        "openai",
        "anthropic",
        "google",
        "deepmind",
        "meta",
        "microsoft",
        "adobe",
        "apple",
    }
    if company and not any(c in company for c in big_co):
        tags.append("startup")

    module = rec.get("module")
    if module:
        tags.append(module)

    return sorted(set(tags))


def build_embedding_text(rec: dict[str, Any]) -> str:
    parts = [
        rec.get("name", ""),
        rec.get("company", ""),
        rec.get("one_line_judgment", ""),
        rec.get("relevance_to_us", ""),
        rec.get("core_positioning", ""),
        rec.get("real_change_notes", ""),
        rec.get("selection_impact_notes", ""),
        rec.get("workflow_change", ""),
        " ".join(rec.get("new_use_cases", []) or []),
        " ".join(rec.get("user_scenarios", []) or []),
    ]
    return " | ".join(p for p in parts if isinstance(p, str) and p.strip())


def flatten(rec: dict[str, Any], issue_date: str) -> FlatRecord | None:
    """Turn a verified/normalized record dict into the flat insert shape."""
    name = (rec.get("name") or "").strip()
    company = (rec.get("company") or "").strip()
    if not name:
        return None

    module = rec.get("module")
    if module not in ("model", "product", "operation"):
        # Heuristic fallback for legacy records.
        module = "model" if "official_claims" in rec else "product"
    item_tier = rec.get("item_tier") or "main"
    if item_tier == "dropped":
        return None

    total_score = 0
    score_breakdown = rec.get("score_breakdown") or {}
    if isinstance(score_breakdown, dict) and score_breakdown.get("total") is not None:
        try:
            total_score = int(score_breakdown["total"])
        except (TypeError, ValueError):
            total_score = 0

    headline = (
        rec.get("headline")
        or rec.get("one_line_judgment")
        or (
            f"{company} ships {name}"
            if company
            else name
        )
    )

    image_urls = rec.get("image_urls") or rec.get("raw_image_urls") or []
    if not isinstance(image_urls, list):
        image_urls = []
    primary_image = image_urls[0] if image_urls else None

    slug_seed = f"{issue_date}-{company}-{name}"
    if rec.get("version"):
        slug_seed += f"-{rec['version']}"
    slug = slugify(slug_seed)

    pub_date = rec.get("published_date") or rec.get("story_date")
    if pub_date and not re.match(r"^\d{4}-\d{2}-\d{2}", str(pub_date)):
        pub_date = None

    return FlatRecord(
        slug=slug,
        module=module,
        name=name,
        company=company or "Unknown",
        version=rec.get("version"),
        issue_date=issue_date,
        item_tier=item_tier,
        total_score=total_score,
        source_tier=rec.get("source_tier"),
        verification_status=rec.get("verification_status"),
        confidence=rec.get("confidence"),
        headline=headline,
        one_line_judgment=rec.get("one_line_judgment"),
        relevance_to_us=rec.get("relevance_to_us"),
        tags=derive_tags(rec),
        image_urls=image_urls,
        primary_image=primary_image,
        record=rec,
        embedding_text=build_embedding_text(rec),
        published_date=pub_date,
    )


def load_run_records(run_dir: Path) -> tuple[str, list[FlatRecord]]:
    """Read a run folder and return (issue_date, [FlatRecord, ...])."""
    issue_date = run_dir.name  # YYYY-MM-DD
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", issue_date):
        raise SystemExit(f"Run folder must be named YYYY-MM-DD, got: {issue_date}")

    # Prefer verified > normalized > filtered > raw, in that order, for full
    # editorial fidelity.
    candidates: list[Path] = []
    for fname in (
        "verified_records.json",
        "normalized_records.json",
        "filtered_records.json",
    ):
        p = run_dir / fname
        if p.exists():
            candidates.append(p)
    if not candidates:
        # Fall back to merging the raw model + product files.
        for fname in ("raw_model_records.json", "raw_product_records.json"):
            p = run_dir / fname
            if p.exists():
                candidates.append(p)

    triage = _read_json(run_dir / "triage_decisions.json") or {}

    raw_records: list[dict[str, Any]] = []
    for p in candidates:
        data = _read_json(p)
        if isinstance(data, list):
            raw_records.extend(data)
        elif isinstance(data, dict):
            # Legacy flat keys
            for key in ("model_records", "product_records", "records"):
                v = data.get(key)
                if isinstance(v, list):
                    raw_records.extend(v)
            # New nested format: {"models": [...] or {"main":[], "brief":[]}, "products": [...] or {...}}
            for key in ("models", "products"):
                v = data.get(key)
                if isinstance(v, list):
                    raw_records.extend(v)
                elif isinstance(v, dict):
                    for tier in ("main", "brief", "all"):
                        tv = v.get(tier)
                        if isinstance(tv, list):
                            raw_records.extend(tv)

    # Apply triage decisions if present (overrides item_tier).
    triage_by_name: dict[str, dict[str, Any]] = {}
    if isinstance(triage, list):
        for d in triage:
            if isinstance(d, dict) and d.get("name"):
                triage_by_name[d["name"]] = d
    elif isinstance(triage, dict):
        # Legacy flat format: {"decisions": [...]}
        for d in triage.get("decisions", []) or []:
            if isinstance(d, dict) and d.get("name"):
                triage_by_name[d["name"]] = d
        # New nested format: {"models": {"main": [...], "brief": [...], ...}, "products": {...}}
        for module_key in ("models", "products"):
            module_data = triage.get(module_key)
            if not isinstance(module_data, dict):
                continue
            for tier in ("main", "brief", "dropped"):
                for d in module_data.get(tier) or []:
                    if isinstance(d, dict) and d.get("name"):
                        triage_by_name[d["name"]] = {**d, "item_tier": tier}

    flat: list[FlatRecord] = []
    seen_slugs: set[str] = set()
    for rec in raw_records:
        if not isinstance(rec, dict):
            continue
        if rec.get("name") in triage_by_name:
            rec = {**rec, **triage_by_name[rec["name"]]}
        f = flatten(rec, issue_date)
        if not f:
            continue
        if f.slug in seen_slugs:
            continue
        seen_slugs.add(f.slug)
        flat.append(f)

    return issue_date, flat


# ---------------------------------------------------------------------------
# Embeddings
# ---------------------------------------------------------------------------

def embed_batch(texts: list[str]) -> list[list[float]]:
    """Call OpenAI embeddings. Batches up to 100 inputs per call."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise SystemExit(
            "OPENAI_API_KEY is required for embeddings. Pass --no-embed to skip."
        )
    out: list[list[float]] = []
    for i in range(0, len(texts), 100):
        chunk = texts[i : i + 100]
        resp = requests.post(
            "https://api.openai.com/v1/embeddings",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={"model": EMBED_MODEL, "input": chunk},
            timeout=60,
        )
        if resp.status_code != 200:
            raise SystemExit(
                f"OpenAI embeddings failed: {resp.status_code} {resp.text[:300]}"
            )
        data = resp.json()
        for d in data["data"]:
            out.append(d["embedding"])
    return out


def vector_literal(values: list[float]) -> str:
    """Format a Python list as the pgvector text input."""
    return "[" + ",".join(f"{v:.7f}" for v in values) + "]"


# ---------------------------------------------------------------------------
# Upsert
# ---------------------------------------------------------------------------

UPSERT_SQL = """
INSERT INTO news_items (
  slug, module, name, company, version, issue_date, published_at,
  item_tier, total_score, source_tier, verification_status, confidence,
  headline, one_line_judgment, relevance_to_us,
  tags, image_urls, primary_image, record, embedding,
  updated_at
) VALUES (
  %(slug)s, %(module)s, %(name)s, %(company)s, %(version)s, %(issue_date)s,
  COALESCE(%(published_at)s::timestamptz, now()),
  %(item_tier)s, %(total_score)s, %(source_tier)s, %(verification_status)s, %(confidence)s,
  %(headline)s, %(one_line_judgment)s, %(relevance_to_us)s,
  %(tags)s, %(image_urls)s, %(primary_image)s, %(record)s, %(embedding)s::vector,
  now()
)
ON CONFLICT (slug) DO UPDATE SET
  module              = EXCLUDED.module,
  name                = EXCLUDED.name,
  company             = EXCLUDED.company,
  version             = EXCLUDED.version,
  issue_date          = EXCLUDED.issue_date,
  published_at        = EXCLUDED.published_at,
  item_tier           = EXCLUDED.item_tier,
  total_score         = EXCLUDED.total_score,
  source_tier         = EXCLUDED.source_tier,
  verification_status = EXCLUDED.verification_status,
  confidence          = EXCLUDED.confidence,
  headline            = EXCLUDED.headline,
  one_line_judgment   = EXCLUDED.one_line_judgment,
  relevance_to_us     = EXCLUDED.relevance_to_us,
  tags                = EXCLUDED.tags,
  image_urls          = EXCLUDED.image_urls,
  primary_image       = EXCLUDED.primary_image,
  record              = EXCLUDED.record || (
                          SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
                          FROM jsonb_each(news_items.record)
                          WHERE key LIKE '%_zh'
                        ),
  headline            = CASE
                          WHEN news_items.record->>'summary_zh' IS NOT NULL
                          THEN news_items.headline
                          ELSE EXCLUDED.headline
                        END,
  embedding           = COALESCE(EXCLUDED.embedding, news_items.embedding),
  updated_at          = now();
"""


SUMMARY_DDL_LEGACY = """
CREATE TABLE IF NOT EXISTS issue_summaries (
  issue_date  varchar(16) PRIMARY KEY,
  theme       text NOT NULL,
  bullets     jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
"""

# Migrate older installs where `bullets` was `text[]`.
SUMMARY_DDL_MIGRATE = """
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'issue_summaries'
      AND column_name = 'bullets'
      AND data_type = 'ARRAY'
  ) THEN
    ALTER TABLE issue_summaries
      ALTER COLUMN bullets DROP DEFAULT,
      ALTER COLUMN bullets TYPE jsonb USING (
        COALESCE(
          (SELECT jsonb_agg(jsonb_build_object('text', t)) FROM unnest(bullets) AS t),
          '[]'::jsonb
        )
      ),
      ALTER COLUMN bullets SET DEFAULT '[]'::jsonb;
  END IF;
END $$;
"""

SUMMARY_UPSERT = """
INSERT INTO issue_summaries (issue_date, theme, bullets, updated_at)
VALUES (%(issue_date)s, %(theme)s, %(bullets)s, now())
ON CONFLICT (issue_date) DO UPDATE SET
  theme      = EXCLUDED.theme,
  bullets    = EXCLUDED.bullets,
  updated_at = now();
"""


def upsert_summary(run_dir: Path, issue_date: str) -> bool:
    """Push `weekly_summary.json` (if present) to the issue_summaries table.

    Bullet shape: each bullet is `{ "text": str, "slugs": [str, ...] }`.
    Older flat-string bullets are auto-promoted to the new shape with no
    slugs (rendered un-linked).
    """
    summary_path = run_dir / "weekly_summary.json"
    if not summary_path.exists():
        return False
    data = _read_json(summary_path) or {}
    theme = (data.get("theme") or "").strip()
    raw_bullets = data.get("bullets") or []
    if not isinstance(raw_bullets, list):
        raw_bullets = []

    bullets: list[dict[str, Any]] = []
    for b in raw_bullets:
        if isinstance(b, str) and b.strip():
            bullets.append({"text": b, "slugs": []})
        elif isinstance(b, dict) and b.get("text"):
            bullets.append(
                {
                    "text": str(b["text"]),
                    "slugs": [str(s) for s in (b.get("slugs") or []) if s],
                }
            )

    if not theme and not bullets:
        return False

    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise SystemExit("DATABASE_URL is required.")
    with psycopg.connect(dsn, autocommit=False) as conn:
        with conn.cursor() as cur:
            cur.execute(SUMMARY_DDL_LEGACY)
            cur.execute(SUMMARY_DDL_MIGRATE)
            cur.execute(
                SUMMARY_UPSERT,
                {
                    "issue_date": issue_date,
                    "theme": theme or "本周要点",
                    "bullets": Json(bullets),
                },
            )
        conn.commit()
    return True


def upsert(records: list[FlatRecord], embed: bool = True) -> int:
    if not records:
        return 0
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise SystemExit("DATABASE_URL is required.")

    embeddings: list[str | None]
    if embed:
        print(f"  Computing {len(records)} embeddings via OpenAI...", flush=True)
        vecs = embed_batch([r.embedding_text or r.headline for r in records])
        embeddings = [vector_literal(v) for v in vecs]
    else:
        embeddings = [None] * len(records)

    rows = []
    for r, emb in zip(records, embeddings):
        rows.append(
            {
                "slug": r.slug,
                "module": r.module,
                "name": r.name,
                "company": r.company,
                "version": r.version,
                "issue_date": r.issue_date,
                "item_tier": r.item_tier,
                "total_score": r.total_score,
                "source_tier": r.source_tier,
                "verification_status": r.verification_status,
                "confidence": r.confidence,
                "headline": r.headline,
                "one_line_judgment": r.one_line_judgment,
                "relevance_to_us": r.relevance_to_us,
                "tags": r.tags,
                "image_urls": r.image_urls,
                "primary_image": r.primary_image,
                "record": Json(r.record),
                "embedding": emb,
                "published_at": r.published_date,
            }
        )

    inserted = 0
    with psycopg.connect(dsn, autocommit=False) as conn:
        with conn.cursor() as cur:
            for row in rows:
                cur.execute(UPSERT_SQL, row)
                inserted += 1
        conn.commit()
    return inserted


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def iter_run_dirs(root: Path) -> Iterable[Path]:
    if not root.exists():
        return []
    return sorted(
        d for d in root.iterdir() if d.is_dir() and re.match(r"^\d{4}-\d{2}-\d{2}$", d.name)
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "path",
        nargs="?",
        default=".",
        help="Run folder (YYYY-MM-DD) to sync. Use '.' if cwd is the run folder.",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Sync every run folder under newsletter_runs/. Ignores `path`.",
    )
    parser.add_argument(
        "--no-embed",
        action="store_true",
        help="Skip embeddings (DB rows will have NULL embedding).",
    )
    parser.add_argument(
        "--max-age",
        type=int,
        default=14,
        help="Max age in days for each item's published_date. Default 14.",
    )
    parser.add_argument(
        "--no-validate",
        action="store_true",
        help="Skip the freshness + URL reachability gate. Use with care.",
    )
    parser.add_argument(
        "--allow-stale",
        action="store_true",
        help=(
            "Sync items even if they fail freshness/URL checks "
            "(prints the report but doesn't reject). Default: hard fail."
        ),
    )
    args = parser.parse_args()

    targets: list[Path]
    if args.all:
        targets = list(iter_run_dirs(RUNS_DIR))
        if not targets:
            print(f"No run folders found under {RUNS_DIR}.")
            return 0
    else:
        targets = [Path(args.path).resolve()]

    total = 0
    for run_dir in targets:
        if not run_dir.exists():
            print(f"  ! skipping {run_dir} (does not exist)", file=sys.stderr)
            continue
        print(f"\n>> Syncing {run_dir}")
        try:
            issue_date, records = load_run_records(run_dir)
        except SystemExit as e:
            print(f"  ! {e}", file=sys.stderr)
            continue
        print(f"  Found {len(records)} publishable records (issue {issue_date}).")

        # Validation gate — freshness + URL reachability. Runs before any
        # row hits Postgres. Re-shape FlatRecord -> dict so the validator
        # can reuse the same logic the verifier agent runs.
        if not args.no_validate:
            print(f"  Validating records (max_age={args.max_age}d, URL pings ON)...")
            raw_dicts = [r.record for r in records]
            v = validate_records(
                raw_dicts,
                max_age_days=args.max_age,
                check_urls_flag=True,
            )
            print("  " + format_report(v).replace("\n", "\n  "))
            if v.has_failures():
                if args.allow_stale:
                    print(
                        "  [WARN] --allow-stale set: syncing despite "
                        f"{len(v.failed_records)} failed records."
                    )
                else:
                    failed_names = {
                        (rec.get("name") or "") for rec in v.failed_records
                    }
                    keep = [r for r in records if r.name not in failed_names]
                    skipped = len(records) - len(keep)
                    print(
                        f"  [DROP] Skipping {skipped} records that failed "
                        "validation. Pass --allow-stale to override."
                    )
                    records = keep

        if not records:
            print("  Nothing left to sync after validation; moving on.")
            continue

        n = upsert(records, embed=not args.no_embed)
        print(f"  [OK] Upserted {n} rows.")
        if upsert_summary(run_dir, issue_date):
            print(f"  [OK] Upserted weekly summary for {issue_date}.")
        total += n
        # Slight pause to be polite to the OpenAI API on --all.
        time.sleep(0.2)

    print(f"\nDone. {total} total rows upserted across {len(targets)} run folder(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
