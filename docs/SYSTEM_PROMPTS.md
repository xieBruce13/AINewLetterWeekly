# System Prompt 位置说明

这份文档记录「AI 周报」里主要内容生成提示词的位置，方便后续改口吻、筛选标准、封面图风格和网站聊天行为。

## 网站聊天与个性化

- 网站内聊天助手 system prompt：`web/lib/agent/system-prompt.ts`
  - 影响用户在网站里点「聊这条」或进入聊天页时，AI 如何结合用户档案、记忆和当前新闻回答。
  - 主要可改：回答语气、中文约束、是否调用新闻检索、何时记忆用户偏好、回复长度。

- 记忆抽取模型提示词：`web/lib/agent/memory.ts`
  - 影响系统从用户对话里抽取哪些长期偏好或事实。
  - 主要可改：什么算「值得记住」、不应该记住哪些内容。

- 首页个性化重排/推荐逻辑：`web/lib/db/queries.ts`
  - 这里更多是 SQL + rerank 逻辑，不是完整 system prompt。
  - 影响首页为登录用户排序新闻、生成推荐理由时使用哪些字段。

## AI 生成新闻封面图

- 封面图生成 system prompt：`tools/generate_cover_images.py`
  - 常量：`COVER_IMAGE_SYSTEM_PROMPT`
  - 影响所有 AI 生成新闻封面的统一视觉方向。
  - 当前原则：用新闻含义生成编辑插画，不用公司 logo，不用产品截图，不生成可读文字。

- 单条新闻封面图 user prompt：`tools/generate_cover_images.py`
  - 函数：`build_cover_prompt()`
  - 影响每条新闻送给图片模型的具体信息：公司、产品/事件、标题、能力变化、使用场景、编辑判断、标签。

- 运行方式：

```bash
python tools/generate_cover_images.py newsletter_runs/2026-05-07 --limit 6
```

脚本会把图片保存到 `web/public/generated-covers/YYYY-MM-DD/`，并把 run JSON 里的 `image_urls[0]` 和 `primary_image` 改成 `/generated-covers/...`。之后运行 `tools/sync_to_db.py` 会把新封面同步到数据库。因为图片是 Next.js 静态资源，线上站点要重新部署后才能访问这些新文件。

## 周报流水线 Agent 提示词

这些文件是每一步 agent 的角色说明，也就是对应步骤的「系统提示词」：

- 总调度：`.claude/agents/orchestrator.md`
  - 负责 scope lock、按顺序派发 collector/filter/normalizer/verifier/scorer/triage/writer/qa/publisher。

- 信息收集：`.claude/agents/collector.md`
  - 影响从哪些来源收集候选新闻，以及 raw record 如何初步成形。

- 筛选：`.claude/agents/filter.md`
  - 影响哪些候选可以进入周报，哪些进入 watchlist 或 dropped。

- 结构化：`.claude/agents/normalizer.md`
  - 影响 raw record 如何扩展成 `skill/record_schemas.json` 里的结构化字段。

- 事实核验：`.claude/agents/verifier.md`
  - 影响官方声明、第三方验证、社区反馈如何交叉核验，也影响 Reddit 用户引用的抓取要求。

- 评分：`.claude/agents/scorer.md`
  - 影响每条新闻按哪些维度打分，以及分数理由怎么写。

- 选题编排：`.claude/agents/triage-editor.md`
  - 影响 main / brief / drop 的最终分配、题材多样性和初创公司 inclusion。

- 正文写作：`.claude/agents/writer.md`
  - 影响 `newsletter_draft.md` 的结构、中文写作风格、每条 main entry 的表格字段、引用翻译、图片插入规则。

- QA 审稿：`.claude/agents/qa-reviewer.md`
  - 影响出刊前检查项，包括是否有真实产品图、信息分层表、引用、格式等。

- 发布：`.claude/agents/publisher.md`
  - 影响图片下载、HTML 生成、数据库同步和发布验收标准。

## 共享规则与模板

- 总 SOP：`skill/SKILL.md`
  - 周报流水线的权威流程说明。改流程顺序、交付物、默认范围时优先改这里。

- 评分规则：`skill/rubric.json`
  - 影响 scorer 如何给模型、产品、运营类新闻打分。

- 记录结构：`skill/record_schemas.json`
  - 影响 normalized / verified / scored records 应该有哪些字段。

- 输出模板：`skill/output_template.md`
  - 影响最终 `newsletter_draft.md` 的章节结构。

- 设计规范：`skill/DESIGN.md`
  - 影响 PDF/HTML 周报的视觉规则。若改出刊 HTML 的样式，应同步检查 `tools/convert_to_pdf.py`。

## 其他硬编码提示词

- 抓取结果转 raw record：`tools/scraped_to_raw.py`
  - 函数：`call_llm()` 附近的 `system` / `user` 字符串。
  - 影响从 `raw_scraped.json` 中挑选哪些新闻进入 `raw_model_records.json` / `raw_product_records.json`。

- 数据库 embedding 文本拼接：`tools/sync_to_db.py`
  - 函数：`build_embedding_text()`
  - 这不是 system prompt，但会影响搜索、个性化推荐和相似度召回的语义输入。
