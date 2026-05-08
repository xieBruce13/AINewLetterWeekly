"""
tools/generate_cover_images.py — Generate AI cover images for newsletter items.

The script reads a newsletter run folder, creates one editorial cover image per
record, saves the files under `web/public/generated-covers/YYYY-MM-DD/`, and
updates the run JSON so `tools/sync_to_db.py` will publish the generated image as
`primary_image`.

Usage:
    python tools/generate_cover_images.py newsletter_runs/2026-05-07 --limit 6
    python tools/generate_cover_images.py newsletter_runs/2026-05-07 --dry-run
    python tools/generate_cover_images.py newsletter_runs/2026-05-07 --overwrite

Env:
    OPENAI_API_KEY     Required unless --dry-run is passed
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

try:
    import requests
except ImportError as exc:  # pragma: no cover
    sys.stderr.write("requests is required. pip install requests\n")
    raise exc


REPO_ROOT = Path(__file__).resolve().parent.parent
PUBLIC_COVER_ROOT = REPO_ROOT / "web" / "public" / "generated-covers"

COVER_IMAGE_SYSTEM_PROMPT = """
You are an editorial art director for a Chinese technology newsletter.
Create a single AI-generated cover image that summarizes the news item's meaning,
not the company's logo or a literal webpage screenshot.

Visual rules:
- 16:9 landscape editorial cover, premium technology magazine style.
- Use concrete symbolic objects from the story, abstracted into one clear scene.
- No company logos, no product UI screenshots, no brand marks, no stock-photo hands.
- Absolutely no readable text, fake text, letters, numbers, watermarks, captions,
  labels, charts with numbers, search boxes, speech bubbles with letters, or UI chrome.
- Never write "AI" or any other acronym in the image. Represent intelligence with
  abstract nodes, light paths, lenses, machines, or other textless symbols.
- If a computer, phone, tablet, poster, slate, or sign appears, its surface must be
  blank or purely geometric with no letterforms.
- Do not include sheets of paper, scripts, notebooks, documents, plaques, banners,
  or any rectangular surface that could invite a title or line-like pseudo-text.
- Avoid hype visuals like glowing humanoid robots unless the story is literally about robotics.
- Prefer clean composition, soft depth, warm neutral palette with one coral accent.
- The image should still make sense as a small news-card thumbnail.
""".strip()


RECORD_FILES = (
    "verified_records.json",
    "normalized_records.json",
    "scored_records.json",
    "filtered_records.json",
    "raw_model_records.json",
    "raw_product_records.json",
)


@dataclass
class RecordRef:
    path: Path
    record: dict[str, Any]


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def slugify(value: str) -> str:
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower())
    return re.sub(r"-+", "-", value).strip("-")[:80] or "item"


def record_slug(rec: dict[str, Any], issue_date: str) -> str:
    seed = f"{issue_date}-{rec.get('company', '')}-{rec.get('name', '')}"
    if rec.get("version"):
        seed += f"-{rec['version']}"
    return slugify(seed)


def as_text(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        return "；".join(str(v).strip() for v in value if str(v).strip())
    if isinstance(value, dict):
        parts: list[str] = []
        for key in ("good", "bad"):
            v = value.get(key)
            if isinstance(v, list):
                parts.extend(str(x).strip() for x in v if str(x).strip())
        return "；".join(parts)
    return ""


def image_safe_text(text: str) -> str:
    """Avoid prompting the image model with acronyms it tends to render."""
    if not text:
        return ""
    replacements = {
        "AI+": "intelligent systems + ",
        "AI ": "machine intelligence ",
        " AI": " machine intelligence",
        "AI-": "machine-intelligence-",
        "AI/": "machine intelligence/",
        "(AI)": "(machine intelligence)",
        "A.I.": "machine intelligence",
        "人工智能": "智能系统",
    }
    out = text
    for old, new in replacements.items():
        out = out.replace(old, new)
    return out


def first_text(rec: dict[str, Any], *keys: str) -> str:
    for key in keys:
        text = as_text(rec.get(key))
        if text:
            return image_safe_text(text)
    return ""


def load_record_refs(run_dir: Path) -> tuple[dict[Path, Any], list[RecordRef]]:
    """Load all run JSON files that contain records and return mutable refs."""
    documents: dict[Path, Any] = {}
    refs: list[RecordRef] = []

    def visit(path: Path, value: Any) -> None:
        if isinstance(value, list):
            for item in value:
                if isinstance(item, dict) and item.get("name"):
                    refs.append(RecordRef(path=path, record=item))
                elif isinstance(item, (dict, list)):
                    visit(path, item)
        elif isinstance(value, dict):
            # Keep watchlist / dropped entries untouched unless they are later
            # selected by triage and synced. The cover experiment is for visible
            # feed cards, not internal editorial rejects.
            for key, item in value.items():
                if key in {"dropped", "watchlist"}:
                    continue
                if isinstance(item, (dict, list)):
                    visit(path, item)

    for fname in RECORD_FILES:
        path = run_dir / fname
        if not path.exists():
            continue
        data = read_json(path)
        documents[path] = data
        visit(path, data)

    return documents, refs


def build_cover_prompt(rec: dict[str, Any]) -> str:
    """Build the per-item user prompt sent with COVER_IMAGE_SYSTEM_PROMPT."""
    module = image_safe_text(str(rec.get("module") or "technology"))
    company = image_safe_text(str(rec.get("company") or "Unknown"))
    name = image_safe_text(str(rec.get("name") or rec.get("headline") or "technology news item"))
    headline = first_text(rec, "headline", "summary_zh", "one_line_judgment", "summary")
    core = first_text(
        rec,
        "key_points_zh",
        "real_change_notes",
        "core_positioning",
        "problem_it_solves",
        "workflow_change",
        "selection_impact_notes",
    )
    scenarios = first_text(rec, "scenarios_zh", "new_use_cases", "user_scenarios")
    judgment = first_text(rec, "judgment_zh", "relevance_zh", "relevance_to_us")
    tags = image_safe_text(", ".join(str(t) for t in (rec.get("tags") or [])[:6]))

    return f"""
News item:
- Module: {module}
- Company: {company}
- Product / event: {name}
- Headline: {headline}
- What changed: {core}
- Use cases or affected workflow: {scenarios}
- Editorial judgment: {judgment}
- Tags: {tags}

Create one metaphorical cover image for this specific story. Make the main
visual idea obvious without using text or logos. If the story is about agent
payments, show autonomous transactions and secure rails. If it is about model
inference, show efficient compute flow. If it is about search, show discovery
and decision-making. If it is about creative tools, show the creation workflow.
""".strip()


def generate_image(prompt: str, output_path: Path, *, model: str, size: str, quality: str) -> None:
    from openai import OpenAI

    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    result = client.images.generate(
        model=model,
        prompt=f"{COVER_IMAGE_SYSTEM_PROMPT}\n\n{prompt}",
        size=size,
        quality=quality,
        n=1,
    )
    image = result.data[0]
    output_path.parent.mkdir(parents=True, exist_ok=True)

    b64 = getattr(image, "b64_json", None)
    if b64:
        output_path.write_bytes(base64.b64decode(b64))
        return

    url = getattr(image, "url", None)
    if not url:
        raise RuntimeError("OpenAI image response did not include b64_json or url")
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    output_path.write_bytes(resp.content)


def should_skip(rec: dict[str, Any], *, overwrite: bool) -> bool:
    if overwrite:
        return False
    if rec.get("cover_image_kind") == "ai-generated":
        return True
    primary = rec.get("primary_image")
    return isinstance(primary, str) and primary.startswith("/generated-covers/")


def apply_cover(rec: dict[str, Any], image_url: str, prompt: str) -> None:
    old_urls = rec.get("image_urls") or []
    if not isinstance(old_urls, list):
        old_urls = []
    source_urls = [
        u for u in old_urls
        if isinstance(u, str) and not u.startswith("/generated-covers/")
    ]
    if source_urls and "source_image_urls" not in rec:
        rec["source_image_urls"] = source_urls
    rec["image_urls"] = [image_url] + [u for u in old_urls if u != image_url]
    rec["primary_image"] = image_url
    rec["cover_image_kind"] = "ai-generated"
    rec["cover_image_prompt"] = prompt


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run_dir", help="Path to newsletter_runs/YYYY-MM-DD")
    parser.add_argument("--limit", type=int, default=None, help="Maximum records to generate")
    parser.add_argument("--overwrite", action="store_true", help="Regenerate existing AI covers")
    parser.add_argument("--dry-run", action="store_true", help="Write prompts/manifest only")
    parser.add_argument("--model", default="gpt-image-1")
    parser.add_argument("--size", default="1536x1024")
    parser.add_argument("--quality", default="medium")
    parser.add_argument(
        "--sleep",
        type=float,
        default=0.5,
        help="Seconds to wait between image generations",
    )
    args = parser.parse_args()

    run_dir = Path(args.run_dir)
    if not run_dir.exists():
        raise SystemExit(f"Run dir not found: {run_dir}")
    issue_date = run_dir.name
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", issue_date):
        raise SystemExit(f"Run folder must be named YYYY-MM-DD, got: {issue_date}")
    if not args.dry_run and not os.environ.get("OPENAI_API_KEY"):
        raise SystemExit("OPENAI_API_KEY is required unless --dry-run is passed")

    documents, refs = load_record_refs(run_dir)
    seen: set[int] = set()
    unique_refs: list[RecordRef] = []
    for ref in refs:
        ident = id(ref.record)
        if ident in seen or should_skip(ref.record, overwrite=args.overwrite):
            continue
        seen.add(ident)
        unique_refs.append(ref)
    if args.limit is not None:
        unique_refs = unique_refs[: args.limit]

    manifest: list[dict[str, Any]] = []
    cover_dir = PUBLIC_COVER_ROOT / issue_date
    touched_paths: set[Path] = set()

    print(f"Loaded {len(refs)} record refs; generating {len(unique_refs)} covers.")
    for idx, ref in enumerate(unique_refs, start=1):
        rec = ref.record
        slug = record_slug(rec, issue_date)
        prompt = build_cover_prompt(rec)
        output_path = cover_dir / f"{slug}.png"
        image_url = f"/generated-covers/{issue_date}/{slug}.png"
        print(f"[{idx}/{len(unique_refs)}] {rec.get('company', '')} — {rec.get('name', '')}")

        if not args.dry_run:
            generate_image(
                prompt,
                output_path,
                model=args.model,
                size=args.size,
                quality=args.quality,
            )
            apply_cover(rec, image_url, prompt)
            touched_paths.add(ref.path)
            time.sleep(args.sleep)

        manifest.append(
            {
                "slug": slug,
                "company": rec.get("company"),
                "name": rec.get("name"),
                "image_url": image_url,
                "output_path": str(output_path.relative_to(REPO_ROOT)),
                "prompt": prompt,
                "dry_run": args.dry_run,
            }
        )

    manifest_path = run_dir / "cover_images_manifest.json"
    write_json(manifest_path, manifest)

    if not args.dry_run:
        for path, data in documents.items():
            if path not in touched_paths:
                continue
            write_json(path, data)

    print(f"Wrote manifest: {manifest_path}")
    if args.dry_run:
        print("Dry run only; no images or records were modified.")
    else:
        print(f"Saved images under: {cover_dir}")
        print("Next step: run tools/sync_to_db.py for this run, then redeploy the web app.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
