"""
inject_zh.py — Parse newsletter_draft.md and inject Chinese content into the DB.

Usage:
    py tools/inject_zh.py newsletter_runs/2026-05-06/newsletter_draft.md

Reads the markdown, extracts per-item Chinese content, and UPSERTs the
following fields into news_items.record (jsonb merge) and news_items.headline:

  summary_zh        — 总结 row from the detail table
  key_points_zh     — 模型能力 / 产品重点
  scenarios_zh      — 新场景
  business_model_zh — 商业模式
  feedback_zh       — 用户反馈
  official_zh       — 官方声明
  community_zh      — 社区反馈
  judgment_zh       — 编辑判断
  quotes_zh         — block-quote strings following the section
  headline          — same as summary_zh (updated in the headline column)
"""
from __future__ import annotations
import os, re, sys, json
import psycopg2
from psycopg2.extras import Json

DB_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:fTjaIachqVRFfVXIXbkoGtsyjtEVcfZY@shuttle.proxy.rlwy.net:35509/railway",
)

# ---------------------------------------------------------------------------
# Markdown parser
# ---------------------------------------------------------------------------

SECTION_RE = re.compile(r"^###\s+(?:[MPB]+\d+(?:-Brief)?|Brief\d*)[｜|]\s*(.+)$", re.MULTILINE)
BRIEF_ROW_RE = re.compile(r"^\|\s*\*\*(.+?)\*\*(?:\（[^）]+）)?\s*\|\s*(.+?)\s*\|$")
TABLE_ROW_RE = re.compile(r"^\|\s*(.+?)\s*\|\s*(.+?)\s*\|$")
QUOTE_RE = re.compile(r"^>\s*「?(.+?)」?\s*—\s*(.+)$", re.MULTILINE)
GRID_RE = re.compile(r"^##\s+简讯", re.MULTILINE)


def clean(s: str) -> str:
    """Strip markdown bold markers and collapse whitespace."""
    s = re.sub(r"\*\*", "", s)
    s = s.strip()
    return s


def parse_detail_table(block: str) -> dict[str, str]:
    """Parse the 2-column detail table (模块 | 具体详情)."""
    result: dict[str, str] = {}
    for line in block.splitlines():
        m = TABLE_ROW_RE.match(line.strip())
        if not m:
            continue
        key = clean(m.group(1))
        val = clean(m.group(2))
        if key in ("模块", "---", "------"):
            continue
        result[key] = val
    return result


def parse_2x2_table(block: str) -> dict[str, str]:
    """Parse the 2x2 信息分层 table (官方声明 | 外部验证 / 社区反馈 | 编辑判断)."""
    result: dict[str, str] = {}
    rows = [l.strip() for l in block.splitlines() if l.strip().startswith("|")]
    if len(rows) < 3:
        return result
    # row 0: headers, row 1: sep, row 2: values
    headers = [clean(h) for h in rows[0].split("|") if h.strip()]
    if len(rows) >= 3:
        vals = [clean(v) for v in rows[2].split("|") if v.strip()]
        for h, v in zip(headers, vals):
            if h and v:
                result[h] = v
    return result


def parse_quotes(block: str) -> list[str]:
    quotes = []
    for m in QUOTE_RE.finditer(block):
        text = clean(m.group(1))
        attr = clean(m.group(2))
        if text:
            quotes.append(f"「{text}」— {attr}")
    return quotes


def parse_section(section_name: str, section_body: str) -> dict:
    """Turn a main-item section body into a structured Chinese dict."""
    data: dict[str, object] = {"name_raw": section_name}

    detail = parse_detail_table(section_body)
    for zh_key, field in [
        ("总结", "summary_zh"),
        ("模型能力", "key_points_zh"),
        ("产品重点", "key_points_zh"),
        ("新场景", "scenarios_zh"),
        ("商业模式", "business_model_zh"),
        ("用户反馈", "feedback_zh"),
        ("与我们的关系", "relevance_zh"),
    ]:
        if zh_key in detail:
            data[field] = detail[zh_key]

    two_by_two = parse_2x2_table(section_body)
    for zh_key, field in [
        ("官方声明", "official_zh"),
        ("社区反馈", "community_zh"),
        ("编辑判断", "judgment_zh"),
        ("外部验证", "external_zh"),
    ]:
        if zh_key in two_by_two:
            data[field] = clean(two_by_two[zh_key])

    quotes = parse_quotes(section_body)
    if quotes:
        data["quotes_zh"] = quotes

    return data


def parse_brief_table(block: str) -> list[dict]:
    """Parse the 简讯 summary table (名称 | 一句话)."""
    items = []
    for line in block.splitlines():
        m = BRIEF_ROW_RE.match(line.strip())
        if m:
            raw_name = clean(m.group(1))
            summary = clean(m.group(2))
            # Strip parenthetical "(company, date)" from name
            name = re.sub(r"（[^）]+）$", "", raw_name).strip()
            items.append({"name_raw": name, "summary_zh": summary})
    return items


def parse_draft(path: str) -> list[dict]:
    """Parse the full newsletter draft into a list of item dicts."""
    with open(path, encoding="utf-8") as f:
        text = f.read()

    items: list[dict] = []

    # Split on section headers
    parts = SECTION_RE.split(text)
    # parts[0] = preamble, then alternating: name, body
    i = 1
    while i < len(parts) - 1:
        section_name = parts[i].strip()
        section_body = parts[i + 1]
        item = parse_section(section_name, section_body)
        item["name_raw"] = section_name
        items.append(item)
        i += 2

    # Also parse the brief table
    brief_m = GRID_RE.search(text)
    if brief_m:
        brief_block = text[brief_m.end():]
        for b in parse_brief_table(brief_block):
            items.append(b)

    return items


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

def slugify(s: str) -> str:
    s = s.lower()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s_]+", "-", s)
    s = re.sub(r"-+", "-", s)
    return s.strip("-")


def name_variants(raw: str) -> list[str]:
    """Generate name substrings/variants to help fuzzy-match."""
    raw = clean(raw)
    variants = [raw]
    # Strip common prefixes like "GPT-5.5 Instant" → "GPT-5.5 Instant", "GPT-5.5"
    # Strip parentheticals: "Airbyte Agents — Context Store + MCP" → "Airbyte Agents"
    short = re.split(r"\s+[—–-]\s+|\s+\+\s+", raw)[0].strip()
    if short != raw:
        variants.append(short)
    # Remove version suffix
    no_version = re.sub(r"\s+[\d.]+\w*$", "", raw).strip()
    if no_version not in variants:
        variants.append(no_version)
    return variants


def find_matching_slug(cur, raw_name: str, issue_date: str) -> list[str]:
    """Find DB slugs that best match the given raw_name for an issue."""
    # Try: slug LIKE '%{slugified_name}%' within the issue
    for variant in name_variants(raw_name):
        slug_frag = slugify(variant)
        cur.execute(
            "SELECT slug FROM news_items WHERE issue_date=%s AND slug LIKE %s",
            (issue_date, f"%{slug_frag}%"),
        )
        rows = cur.fetchall()
        if rows:
            return [r[0] for r in rows]
    # Fall back: name column fuzzy
    for variant in name_variants(raw_name):
        cur.execute(
            "SELECT slug FROM news_items WHERE issue_date=%s AND LOWER(name) LIKE %s",
            (issue_date, f"%{variant.lower()[:30]}%"),
        )
        rows = cur.fetchall()
        if rows:
            return [r[0] for r in rows]
    return []


def inject(items: list[dict], issue_date: str) -> int:
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cur = conn.cursor()
    updated = 0

    for item in items:
        raw_name = item.get("name_raw", "")
        slugs = find_matching_slug(cur, raw_name, issue_date)
        if not slugs:
            print(f"  [SKIP] No DB match for: {raw_name}")
            continue

        # Build the zh payload (exclude name_raw)
        zh_patch = {k: v for k, v in item.items() if k != "name_raw" and v}

        # headline comes from summary_zh
        headline_zh = item.get("summary_zh", "")

        for slug in slugs:
            # Merge zh fields into existing record jsonb
            cur.execute(
                """
                UPDATE news_items
                SET record   = record || %s::jsonb,
                    headline = CASE WHEN %s <> '' THEN %s ELSE headline END,
                    updated_at = now()
                WHERE slug = %s
                """,
                (json.dumps(zh_patch, ensure_ascii=False), headline_zh, headline_zh, slug),
            )
            print(f"  [OK] {slug}")
            updated += 1

    cur.close()
    conn.close()
    return updated


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    draft_path = sys.argv[1] if len(sys.argv) > 1 else "newsletter_runs/2026-05-06/newsletter_draft.md"
    # Derive issue_date from parent folder name
    issue_date = os.path.basename(os.path.dirname(os.path.abspath(draft_path)))
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", issue_date):
        issue_date = "2026-05-06"

    print(f"Parsing {draft_path} (issue: {issue_date}) …")
    items = parse_draft(draft_path)
    print(f"  Found {len(items)} items in draft")
    print()
    n = inject(items, issue_date)
    print(f"\nDone. Updated {n} DB row(s).")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
