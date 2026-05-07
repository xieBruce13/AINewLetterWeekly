"""
tools/rule_filter.py — Deterministic pre-filter for raw scraped items.

NO AI CALLS. Reads raw_scraped.json, applies rule-based logic to:

  1. Relevance check  — drop items with no AI signal in title+summary
  2. Module classify  — model / product / operation from keywords + source hint
  3. Importance score — 0–10 from tier + social signals + keyword weights
  4. Deduplication    — drop near-duplicate titles (same domain + 80% word overlap)
  5. Tag extraction   — structured tags from keyword matching

Output: filtered_scraped.json — a ranked subset ready for AI enrichment.

The idea is that this step handles ~80% of what the old AI batch-filter did,
so the subsequent ai_filter.py only needs to *enrich* (not decide relevance),
reducing AI token cost by ~70%.

Usage:
    python tools/rule_filter.py \
        --input  newsletter_runs/YYYY-MM-DD/raw_scraped.json \
        --output newsletter_runs/YYYY-MM-DD/filtered_scraped.json \
        --top 60

Exit codes: 0 = success, 1 = error, 2 = zero items after filtering (warn only).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

# ---------------------------------------------------------------------------
# Keyword tables
# ---------------------------------------------------------------------------

# Items whose title contains any of these strings are definitely AI-relevant.
# (All comparisons are lowercase.)
AI_RELEVANCE_KEYWORDS: list[str] = [
    # Model / lab names
    "gpt", "claude", "gemini", "llama", "mistral", "deepseek", "qwen", "grok",
    "cohere", "stability", "llm", "large language model",
    # Generic AI terms
    "artificial intelligence", "machine learning", "deep learning", "neural network",
    "transformer", "diffusion model", "foundation model", "generative ai",
    "ai model", "ai agent", "ai tool", "ai feature", "ai update", "ai release",
    # Capability areas
    "text-to-image", "text-to-video", "text-to-speech", "image generation",
    "video generation", "voice cloning", "multimodal", "reasoning",
    "context window", "embedding", "vector", "rag", "retrieval",
    "fine-tun", "quantiz", "inference", "benchmark", "eval",
    # Products / company signals
    "openai", "anthropic", "deepmind", "hugging face", "huggingface",
    "midjourney", "stable diffusion", "runway", "luma", "pika", "kling",
    "elevenlabs", "suno", "udio", "cursor", "copilot", "github copilot",
    "perplexity", "character.ai", "together", "groq", "cerebras",
    "adobe firefly", "canva ai", "figma ai", "notion ai",
    # Agent / workflow terms
    "agentic", " agent ", "tool use", "tool calling", "mcp ", "function calling",
    "open-weight", "open weight", "open source model",
]

# Module classification keyword sets
MODEL_KEYWORDS: list[str] = [
    "model release", "model update", "model launch", "new model",
    "base model", "pretrained", "pretraining", "training run",
    "parameter", "billion parameter", "benchmark", "mmlu", "humaneval",
    "swe-bench", "context length", "context window",
    "llm", "large language model", "foundation model",
    "gpt-", "claude-", "gemini-", "llama-", "mistral-", "deepseek-", "qwen-",
    "o1", "o3", "o4", "reasoning model",
    "fine-tun", "rlhf", "dpo", "quantiz", "open-weight", "open weight",
]

PRODUCT_KEYWORDS: list[str] = [
    "launch", "launches", "releases", "ships", "introduces", "announces",
    "available", "now available", "general availability", "ga ",
    "feature", "update", "upgrade", "new version", "v2", "v3",
    "app", "tool", "product", "platform", "api", "sdk", "plugin", "extension",
    "pricing", "free tier", "subscription", "enterprise plan",
    "image gen", "video gen", "voice", "audio", "music",
    "design tool", "coding tool", "writing tool", "creative",
    "integration", "workflow", "automation",
]

OPERATION_KEYWORDS: list[str] = [
    "infrastructure", "mlops", "deployment", "serving", "hosting",
    "inference cost", "latency", "throughput", "scalability",
    "monitoring", "observability", "experiment tracking",
    "kubernetes", "docker", "cloud", "gpu cluster",
    "data pipeline", "dataset", "annotation", "labeling",
    "evaluation framework", "eval harness", "safety evaluation",
]

# Keywords that raise importance score
HIGH_IMPORTANCE_SIGNALS: list[str] = [
    "gpt-5", "gpt-4", "claude 4", "claude 3", "gemini 2", "llama 4", "llama 3",
    "deepseek v3", "qwen3", "o3", "o4",
    "major release", "major update", "breakthrough",
    "state of the art", "sota", "new record", "surpasses",
    "open source", "open-source", "open weight",
    "free", "free tier", "general availability",
    "raises", "funding", "series a", "series b", "series c", "billion",
    "acquisition", "acquires", "partnership",
    "ipo", "valuation",
]

# Well-known company names to extract as structured metadata
KNOWN_COMPANIES: dict[str, str] = {
    "openai": "OpenAI",
    "anthropic": "Anthropic",
    "google": "Google",
    "deepmind": "DeepMind",
    "meta": "Meta",
    "microsoft": "Microsoft",
    "amazon": "Amazon",
    "apple": "Apple",
    "nvidia": "NVIDIA",
    "mistral": "Mistral AI",
    "hugging face": "HuggingFace",
    "huggingface": "HuggingFace",
    "stability ai": "Stability AI",
    "midjourney": "Midjourney",
    "runway": "Runway",
    "luma": "Luma AI",
    "pika": "Pika",
    "elevenlabs": "ElevenLabs",
    "suno": "Suno",
    "udio": "Udio",
    "cursor": "Cursor",
    "figma": "Figma",
    "canva": "Canva",
    "adobe": "Adobe",
    "vercel": "Vercel",
    "replit": "Replit",
    "perplexity": "Perplexity",
    "cohere": "Cohere",
    "xai": "xAI",
    "groq": "Groq",
    "together": "Together AI",
    "cerebras": "Cerebras",
    "scale ai": "Scale AI",
    "character.ai": "Character.AI",
    "langchain": "LangChain",
    "llamaindex": "LlamaIndex",
    "weights & biases": "Weights & Biases",
    "wandb": "Weights & Biases",
    "kling": "Kling",
    "deepseek": "DeepSeek",
    "alibaba": "Alibaba",
    "qwen": "Qwen",
    "baidu": "Baidu",
}

# Tag extraction map: tag → list of keyword triggers
TAG_MAP: dict[str, list[str]] = {
    "coding":       ["coding", "code", "swe-bench", "developer", "ide", "copilot"],
    "agent":        ["agent", "agentic", "tool-use", "tool calling", "mcp"],
    "long-context": ["long context", "context window", "1m token", "1m context", "200k", "128k"],
    "reasoning":    ["reasoning", "reasoner", "thinking", "chain-of-thought", "cot"],
    "image-gen":    ["image gen", "text-to-image", "midjourney", "flux", "diffusion", "firefly", "imagen"],
    "video-gen":    ["video gen", "text-to-video", "runway", "luma", "sora", "pika", "kling", "veo"],
    "voice":        ["voice", "tts", "text-to-speech", "speech", "elevenlabs", "suno"],
    "design":       ["design", "figma", "canva", "framer", "ui ux"],
    "creative-tool":["creative", "creator", "creation", "aigc"],
    "workflow":     ["workflow", "pipeline", "automation"],
    "multimodal":   ["multimodal", "vision", "audio", "omni"],
    "open-weight":  ["open weight", "open-weight", "open source model", "weights", "huggingface"],
    "pricing":      ["price", "pricing", "$", "free tier", "subscription", "enterprise"],
    "benchmark":    ["benchmark", "mmlu", "humaneval", "swe-bench", "leaderboard", "evals"],
    "funding":      ["funding", "series a", "series b", "series c", "raises", "valuation", "ipo"],
    "safety":       ["safety", "alignment", "guardrail", "bias", "responsible ai"],
    "browser-agent":["browser", "computer use", "operator", "web agent"],
    "research":     ["paper", "research", "arxiv", "study", "experiment"],
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _lower(text: Any) -> str:
    return (str(text) if text else "").lower()


def _blob(item: dict) -> str:
    """Concatenated lowercase text blob for keyword matching."""
    return " ".join([
        _lower(item.get("title")),
        _lower(item.get("summary")),
    ])


def is_ai_relevant(item: dict) -> bool:
    """Return True if the item has any AI signal in title or summary."""
    blob = _blob(item)
    # Items from official/press tier are assumed AI-relevant by source selection
    if item.get("tier") in ("official", "press"):
        return True
    return any(kw in blob for kw in AI_RELEVANCE_KEYWORDS)


def classify_module(item: dict) -> str:
    """Classify as model / product / operation using source hint + keywords."""
    hint = item.get("module_hint")
    if hint in ("model", "product", "operation"):
        return hint

    blob = _blob(item)
    model_hits = sum(1 for kw in MODEL_KEYWORDS if kw in blob)
    product_hits = sum(1 for kw in PRODUCT_KEYWORDS if kw in blob)
    operation_hits = sum(1 for kw in OPERATION_KEYWORDS if kw in blob)

    # Source hint can still tip the balance when counts are close
    if hint == "model":
        model_hits += 2
    elif hint == "product":
        product_hits += 2

    if model_hits >= product_hits and model_hits >= operation_hits and model_hits > 0:
        return "model"
    if operation_hits > product_hits and operation_hits > model_hits:
        return "operation"
    return "product"  # default fallback


def score_importance(item: dict) -> int:
    """Return an integer 0–10 importance estimate without any AI calls."""
    score = 0

    # Source tier base
    tier = item.get("tier", "community")
    if tier == "official":
        score += 3
    elif tier == "press":
        score += 1

    # Social signals
    hn_score = item.get("hn_score", 0) or 0
    if hn_score >= 500:
        score += 3
    elif hn_score >= 200:
        score += 2
    elif hn_score >= 50:
        score += 1

    reddit_score = item.get("reddit_score", 0) or 0
    if reddit_score >= 1000:
        score += 3
    elif reddit_score >= 300:
        score += 2
    elif reddit_score >= 100:
        score += 1

    # High-importance keyword signals
    blob = _blob(item)
    hi_hits = sum(1 for kw in HIGH_IMPORTANCE_SIGNALS if kw in blob)
    score += min(hi_hits, 2)

    # Model keywords boost (model releases tend to be high value)
    model_hits = sum(1 for kw in MODEL_KEYWORDS[:10] if kw in blob)
    if model_hits >= 2:
        score += 1

    return min(score, 10)


def extract_company(item: dict) -> str | None:
    """Heuristically identify the company name from title / source."""
    blob = _blob(item)
    for needle, canonical in KNOWN_COMPANIES.items():
        if needle in blob:
            return canonical
    return None


def extract_tags(item: dict, module: str) -> list[str]:
    """Build a tag list from keyword matching + module."""
    blob = _blob(item)
    tags: list[str] = []
    for tag, needles in TAG_MAP.items():
        if any(n in blob for n in needles):
            tags.append(tag)
    tags.append(module)
    company = extract_company(item)
    big_cos = {
        "OpenAI", "Anthropic", "Google", "DeepMind", "Meta",
        "Microsoft", "Amazon", "Apple", "NVIDIA",
    }
    if company and company not in big_cos:
        tags.append("startup")
    return sorted(set(tags))


def _domain(url: str) -> str:
    try:
        return urlparse(url).netloc.lower().lstrip("www.")
    except Exception:
        return ""


def _title_words(title: str) -> frozenset[str]:
    """Return meaningful lowercase words from a title for overlap check."""
    stop = {"a", "an", "the", "and", "or", "is", "in", "on", "at", "to",
            "of", "for", "with", "new", "how", "why", "what", "its"}
    words = re.findall(r"[a-z0-9]{3,}", title.lower())
    return frozenset(w for w in words if w not in stop)


def deduplicate(items: list[dict]) -> list[dict]:
    """
    Remove near-duplicate items.

    Two items are duplicates when they share the same domain AND their
    title word-sets overlap by >= 75%. We keep the higher-scored item.
    """
    kept: list[dict] = []
    # Group by domain to limit the O(n²) comparison space
    by_domain: dict[str, list[int]] = defaultdict(list)
    for i, item in enumerate(items):
        by_domain[_domain(item.get("url", ""))].append(i)

    dropped: set[int] = set()
    for domain_indices in by_domain.values():
        for i in range(len(domain_indices)):
            idx_i = domain_indices[i]
            if idx_i in dropped:
                continue
            words_i = _title_words(items[idx_i].get("title", ""))
            for j in range(i + 1, len(domain_indices)):
                idx_j = domain_indices[j]
                if idx_j in dropped:
                    continue
                words_j = _title_words(items[idx_j].get("title", ""))
                if not words_i or not words_j:
                    continue
                overlap = len(words_i & words_j) / min(len(words_i), len(words_j))
                if overlap >= 0.75:
                    # Keep higher importance; tie-break: keep earlier (higher-tier)
                    score_i = items[idx_i].get("importance_score", 0)
                    score_j = items[idx_j].get("importance_score", 0)
                    drop_idx = idx_j if score_i >= score_j else idx_i
                    dropped.add(drop_idx)

    for i, item in enumerate(items):
        if i not in dropped:
            kept.append(item)
    return kept


# ---------------------------------------------------------------------------
# Main filter function
# ---------------------------------------------------------------------------

def filter_items(
    items: list[dict],
    top_n: int = 60,
    min_importance: int = 2,
) -> list[dict]:
    """
    Apply the full rule-based pipeline and return ranked filtered items.

    Each output item gets extra fields added:
      module           — classified module
      importance_score — 0-10 estimate
      matched_company  — canonical company name if detected
      matched_tags     — list of keyword-matched tags
      rule_filtered    — True (marks this as having passed rule gate)
    """
    filtered: list[dict] = []

    for item in items:
        if not item.get("title"):
            continue
        if not is_ai_relevant(item):
            continue
        module = classify_module(item)
        importance = score_importance(item)
        if importance < min_importance:
            continue
        company = extract_company(item)
        tags = extract_tags(item, module)

        enriched = dict(item)
        enriched["module"] = module
        enriched["importance_score"] = importance
        enriched["matched_company"] = company
        enriched["matched_tags"] = tags
        enriched["rule_filtered"] = True
        filtered.append(enriched)

    # Deduplicate before ranking
    filtered = deduplicate(filtered)

    # Sort by importance desc, then by tier (official first), then recency
    tier_order = {"official": 0, "press": 1, "community": 2}
    filtered.sort(
        key=lambda x: (
            -x["importance_score"],
            tier_order.get(x.get("tier", "community"), 9),
        )
    )

    return filtered[:top_n]


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input",  required=True,  help="Path to raw_scraped.json")
    parser.add_argument("--output", required=True,  help="Path to write filtered_scraped.json")
    parser.add_argument("--top",    type=int, default=60,
                        help="Max items to pass downstream (default: 60)")
    parser.add_argument("--min-importance", type=int, default=2,
                        help="Drop items scoring below this threshold (default: 2)")
    parser.add_argument("--stats",  action="store_true",
                        help="Print per-module breakdown to stderr")
    args = parser.parse_args()

    input_path  = Path(args.input)
    output_path = Path(args.output)

    if not input_path.exists():
        print(f"Error: input file not found: {input_path}", file=sys.stderr)
        return 1

    with input_path.open("r", encoding="utf-8") as fh:
        raw = json.load(fh)

    items: list[dict] = raw.get("items", raw) if isinstance(raw, dict) else raw
    print(f"rule_filter: {len(items)} raw items loaded", file=sys.stderr)

    filtered = filter_items(items, top_n=args.top, min_importance=args.min_importance)
    print(
        f"rule_filter: {len(filtered)} items after filter "
        f"(dropped {len(items) - len(filtered)})",
        file=sys.stderr,
    )

    if args.stats:
        by_module: dict[str, int] = defaultdict(int)
        by_tier: dict[str, int] = defaultdict(int)
        score_dist: dict[str, int] = defaultdict(int)
        for item in filtered:
            by_module[item.get("module", "?")] += 1
            by_tier[item.get("tier", "?")] += 1
            bucket = f"{item['importance_score']}"
            score_dist[bucket] += 1
        print("  by module:    " + json.dumps(dict(by_module)), file=sys.stderr)
        print("  by tier:      " + json.dumps(dict(by_tier)), file=sys.stderr)
        print("  by score:     " + json.dumps(dict(sorted(score_dist.items(), reverse=True))), file=sys.stderr)

    output: dict = {
        "filtered_at": datetime.now(timezone.utc).isoformat(),
        "source_count": len(items),
        "filtered_count": len(filtered),
        "top_n": args.top,
        "min_importance": args.min_importance,
        "items": filtered,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as fh:
        json.dump(output, fh, ensure_ascii=False, indent=2)
    print(f"rule_filter: written to {output_path}", file=sys.stderr)

    return 0 if filtered else 2


if __name__ == "__main__":
    raise SystemExit(main())
