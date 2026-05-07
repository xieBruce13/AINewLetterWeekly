# AI Newsletter — Source Registry

All news sources are defined in **`tools/sources.yaml`**. Edit that file to
add, remove, or temporarily disable any source. No Python changes are needed.

This document explains the structure and lists every active source.

---

## How sources flow through the pipeline

```
tools/sources.yaml
      │
      ▼
tools/scraper.py         ← loads YAML, fetches all active feeds
  raw_scraped.json       (200–400 items/week, no filtering)
      │
      ▼
tools/rule_filter.py     ← ZERO AI calls; deterministic
  filtered_scraped.json  (top ~80 items, ranked, module-classified)
      │
      ▼
tools/ai_filter.py       ← AI enrichment only (1 call per 15 items)
  raw_{model,product}_records.json  (top 30 fully-structured records)
      │
      ▼
tools/sync_to_db.py      ← upserts into Postgres, computes embeddings
```

### What rule_filter.py does without AI

| Step | Logic |
|------|-------|
| **Relevance gate** | Drop items with no AI keyword in title+summary (community tier only; official/press assumed relevant) |
| **Module classify** | `model` / `product` / `operation` from source hint + keyword counts |
| **Importance score** | 0–10: source tier (+3 official, +1 press) + social signals (HN/Reddit score) + keyword matches |
| **Deduplication** | Drop near-duplicate titles on the same domain (≥75% word overlap) |
| **Tag extraction** | Structured tags (coding, agent, image-gen, video-gen, voice, …) from keyword map |

AI then sees only pre-ranked, pre-classified items and only needs to
**enrich** (write the headline, judgment, scenarios, etc.) — not decide
what is relevant.

---

## Source tiers

| Tier | Meaning | Importance bonus |
|------|---------|-----------------|
| `official` | Company's own blog or release notes | +3 pts |
| `press` | Journalism / aggregator coverage | +1 pt |
| `community` | Forums, social signals (HN, Reddit) | 0 pts (uses score instead) |

---

## RSS/Atom feeds

### Official — AI Model Labs

| Name | URL | Module | Tags |
|------|-----|--------|------|
| OpenAI Blog | `openai.com/blog/rss/` | model | openai, gpt, llm |
| Anthropic News | `anthropic.com/news/rss.xml` | model | anthropic, claude |
| Google DeepMind | `deepmind.google/blog/feed/basic/` | model | google, deepmind, gemini |
| Google AI Blog | `blog.google/technology/ai/rss/` | model | google, ai, gemini |
| Meta AI Blog | `ai.meta.com/blog/rss/` | model | meta, llama |
| Mistral AI News | `mistral.ai/news/rss.xml` | model | mistral, open-weight |
| HuggingFace Blog | `huggingface.co/blog/feed.xml` | model | huggingface, open-weight |
| Cohere Blog | `cohere.com/blog/rss` | model | cohere, enterprise |
| xAI News | `x.ai/news/rss` | model | xai, grok |
| Stability AI Blog | `stability.ai/news/rss.xml` | model | stability, image-gen |
| Together AI Blog | `together.ai/blog/rss.xml` | model | together, inference |
| Groq Blog | `groq.com/blog/rss.xml` | model | groq, hardware |
| Cerebras Blog | `cerebras.net/blog/rss.xml` | model | cerebras, hardware |
| Perplexity Blog | `blog.perplexity.ai/rss` | product | perplexity, search |
| Scale AI Blog | `scale.com/blog/rss.xml` | operation | data, rlhf, eval |
| AWS Machine Learning Blog | `aws.amazon.com/blogs/machine-learning/feed/` | operation | aws, mlops |
| Microsoft AI Blog | `blogs.microsoft.com/ai/feed/` | model | microsoft, copilot |
| NVIDIA AI Blog | `blogs.nvidia.com/feed/` | operation | nvidia, gpu, training |
| Allen Institute AI | `allenai.org/blog/rss.xml` | model | research, open-weight |
| Qwen Blog (Alibaba) | `qwenlm.github.io/feed.xml` | model | qwen, open-weight, chinese |

### Official — Creative / Image / Video / Audio tools

| Name | URL | Module | Tags |
|------|-----|--------|------|
| Luma AI Blog | `lumalabs.ai/blog/rss.xml` | product | luma, video-gen, 3d |
| Runway Blog | `runwayml.com/blog/rss.xml` | product | runway, video-gen |
| Runway Research | `research.runwayml.com/feed.xml` | product | runway, research |
| Pika Blog | `pika.art/blog/rss.xml` | product | pika, video-gen |
| Midjourney Updates | `updates.midjourney.com/rss.xml` | product | midjourney, image-gen |
| Adobe Blog AI | `blog.adobe.com/en/topics/ai-ml/feed` | product | adobe, firefly, design |
| Figma Blog | `figma.com/blog/rss.xml` | product | figma, design |
| Canva Newsroom | `canva.com/newsroom/rss.xml` | product | canva, design |
| ElevenLabs Blog | `elevenlabs.io/blog/rss.xml` | product | elevenlabs, voice, tts |
| Suno Blog | `suno.com/blog/rss.xml` | product | suno, music-gen |
| Udio Blog | `udio.com/blog/rss.xml` | product | udio, music-gen |
| Krea AI Blog | `krea.ai/blog/rss.xml` | product | krea, image-gen |
| Kling AI Blog | `klingai.com/blog/rss.xml` | product | kling, video-gen |

### Official — Coding / Agent / Developer tools

| Name | URL | Module | Tags |
|------|-----|--------|------|
| Cursor Changelog | `cursor.com/changelog/rss.xml` | product | cursor, coding, agent |
| GitHub Blog AI | `github.blog/ai-and-ml/feed/` | product | github, copilot, coding |
| Vercel Blog | `vercel.com/blog/rss.xml` | product | vercel, nextjs, deployment |
| LangChain Blog | `blog.langchain.dev/rss/` | product | langchain, agent, rag |
| LlamaIndex Blog | `llamaindex.ai/blog/rss.xml` | product | llamaindex, rag, agent |
| Replit Blog | `blog.replit.com/rss` | product | replit, coding, agent |
| Codeium (Windsurf) Blog | `codeium.com/blog/rss.xml` | product | windsurf, coding, agent |
| Linear Blog | `linear.app/blog/rss.xml` | product | linear, developer-tools |
| Notion Blog | `notion.com/blog/rss.xml` | product | notion, knowledge, ai |
| Weights & Biases Blog | `wandb.ai/fully-connected/rss.xml` | operation | wandb, mlops, evaluation |

### Press

| Name | URL | Tags |
|------|-----|------|
| TechCrunch AI | `techcrunch.com/category/artificial-intelligence/feed/` | news, startup, funding |
| VentureBeat AI | `venturebeat.com/ai/feed/` | news, enterprise, research |
| The Verge AI | `theverge.com/ai-artificial-intelligence/rss/index.xml` | news, consumer |
| Ars Technica Technology | `feeds.arstechnica.com/arstechnica/technology-lab` | deep-dive, research |
| Wired AI | `wired.com/feed/tag/ai/latest/rss` | news, policy |
| MIT Technology Review AI | `technologyreview.com/feed/` | research, policy |
| 9to5Mac AI | `9to5mac.com/guides/artificial-intelligence/feed/` | news, apple |
| The Information AI | `theinformation.com/feed` | exclusive, enterprise |
| CNBC Technology | `cnbc.com/id/19854910/device/rss/rss.html` | news, business |
| Fortune AI | `fortune.com/section/technology/feed/` | business, enterprise |
| ZDNet AI | `zdnet.com/topic/artificial-intelligence/rss.xml` | enterprise, product |
| IEEE Spectrum AI | `spectrum.ieee.org/feeds/blog/artificial-intelligence.rss` | research, hardware |

---

## Reddit communities

| Subreddit | Module hint | Tags |
|-----------|------------|------|
| r/MachineLearning | model | research, papers, technical |
| r/LocalLLaMA | model | open-weight, inference, community |
| r/singularity | — | news, futurism |
| r/artificial | — | news, general |
| r/ChatGPT | product | openai, consumer |
| r/ClaudeAI | product | anthropic, consumer |
| r/StableDiffusion | product | image-gen, open-weight |
| r/midjourney | product | image-gen, creative-tool |
| r/aivideo | product | video-gen |
| r/AIArt | product | image-gen |
| r/ChatGPTPromptEngineering | product | workflow, prompting |

---

## Hacker News

Items are pulled from the **top stories** list (configurable; default top 500).
Only stories matching AI-related keywords in their title AND with a score ≥ 50
are included.

Keyword list is maintained in `sources.yaml` under `hacker_news.keywords`.

---

## Tag taxonomy

Tags are assigned deterministically by `rule_filter.py` and can be used for
personalized recommendations.

| Tag | Trigger signals |
|-----|----------------|
| `coding` | coding, code, swe-bench, developer, ide, copilot |
| `agent` | agent, agentic, tool-use, tool calling, mcp |
| `long-context` | long context, context window, 200k, 128k, 1m token |
| `reasoning` | reasoning, thinking, chain-of-thought |
| `image-gen` | image gen, text-to-image, midjourney, flux, diffusion |
| `video-gen` | video gen, text-to-video, runway, luma, sora, pika, kling |
| `voice` | voice, tts, text-to-speech, elevenlabs, suno |
| `design` | design, figma, canva, ui ux |
| `creative-tool` | creative, creator, aigc |
| `workflow` | workflow, pipeline, automation |
| `multimodal` | multimodal, vision, audio, omni |
| `open-weight` | open weight, open source model, huggingface |
| `pricing` | price, pricing, $, free tier, enterprise |
| `benchmark` | benchmark, mmlu, humaneval, swe-bench, leaderboard |
| `funding` | funding, series a/b/c, raises, valuation, ipo |
| `safety` | safety, alignment, guardrail, bias |
| `browser-agent` | browser, computer use, operator, web agent |
| `research` | paper, arxiv, study |
| `startup` | company not in big-8 list |

---

## Adding a new source

1. Open `tools/sources.yaml`
2. Add an entry under the appropriate section:

```yaml
- name: My New Source
  url: https://example.com/blog/rss.xml
  tier: official          # official | press | community
  module: product         # model | product | operation | null
  tags: [my-tag, another]
  notes: Optional comment for editors
```

3. That's it — the next pipeline run will include the new feed.

To **temporarily disable** a source without deleting it:

```yaml
- name: My Source
  url: ...
  active: false
```

---

## Improving personalization via tags

The `matched_tags` field on each news item (set by `rule_filter.py`) is stored
in the `tags[]` column of `news_items`. User profiles have a `focus_topics[]`
array. The recommendation engine scores items partly by tag overlap.

To improve personalization coverage:
- Extend the `TAG_MAP` in `rule_filter.py` with new keyword groups
- Or add more descriptive `tags:` entries to feeds in `sources.yaml`
  (those `source_tags` are visible to downstream steps)
