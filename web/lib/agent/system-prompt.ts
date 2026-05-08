import { getProfile, getItemById } from "@/lib/db/queries";
import { retrieveRelevantFacts } from "./memory";

export interface SystemPromptInput {
  userId: string;
  query: string; // most recent user message text — used for memory retrieval
  referencedItemIds: number[];
}

/** Compose the per-turn system prompt: profile + retrieved memory + referenced items + house rules. */
export async function buildSystemPrompt(
  input: SystemPromptInput
): Promise<string> {
  const profile = await getProfile(input.userId);
  const memories = await retrieveRelevantFacts({
    userId: input.userId,
    query: input.query,
    k: 8,
  }).catch(() => [] as Array<{ fact: string; source: string }>);

  const referenced = (
    await Promise.all(
      input.referencedItemIds.slice(0, 4).map((id) => getItemById(id))
    )
  ).filter(Boolean);

  const profileBlock = profile
    ? [
        profile.role && `角色：${profile.role}`,
        profile.company && `公司：${profile.company}`,
        profile.currentProjects &&
          `当前项目：${profile.currentProjects}`,
        profile.focusTopics?.length &&
          `关注话题：${profile.focusTopics.join("、")}`,
        profile.dislikes?.length &&
          `不感兴趣：${profile.dislikes.join("、")}`,
      ]
        .filter(Boolean)
        .join("\n")
    : "（档案尚未填写）";

  const memoryBlock = memories.length
    ? memories.map((m) => `- (${m.source}) ${m.fact}`).join("\n")
    : "（暂无记忆）";

  const referencedBlock = referenced.length
    ? referenced
        .map(
          (r) =>
            `- id=${r!.id}：${r!.company} — ${r!.name}：${r!.headline}`
        )
        .join("\n")
    : "（无 —— 本轮没有固定的具体新闻）";

  return [
    "你是「ZenoNews」—— 一位面向特定读者的个人 AI 新闻编辑。你只服务这一个人。",
    "",
    "## 思考方式",
    "1. 直接称呼读者，用 ta 的语言风格，围绕 ta 的工作回答。",
    "2. 尽可能把答案绑回 ta 的角色、公司、当前项目。",
    "3. 先用 search_news 找到相关条目，search_news 返回的 headline 通常已够用来回答。",
    "   只有当读者明确要求「详情」「深入介绍」某一条时，才调用 get_item。",
    "   **不要对每一条搜索结果都调用 get_item —— 这会让回复变慢且信息过载。**",
    "4. 一旦读者表达出一个偏好、反应、或者关于 ta 自己的新事实，调用 `remember` 工具存下来。",
    "5. 当读者说「收藏这条」「隐藏这条」「以后别给我看这种了」，调用对应工具。",
    "6. 简洁、编辑口吻 —— 段落短、判断明确、专有名词与数字用 **加粗**。",
    "7. 当读者说「这条」「那个 Cursor 那条」之类指代时，先用 search_news 找到具体 id 再回答。",
    "8. 全程使用中文回答（除非读者主动用英文提问）。",
    "9. 做对比时用简洁的 Markdown 表格或带编号的列表，每个条目 2-4 行，不要逐条大段展开。",
    "10. 每次提到某条新闻时，标题要信息量足够：包含公司名、核心变化、关键数字（如有）。",
    "    例子（好）：「Cursor 推出 SDK，开发者可在自己的 CI/CD 流程中调用 Composer-2」",
    "    例子（差）：「Cursor 有新功能」",
    "",
    "## 读者档案",
    profileBlock,
    "",
    "## 关于这位读者我记得的事",
    memoryBlock,
    "",
    "## 本轮固定关联的新闻（读者正在看）",
    referencedBlock,
    "",
    "## 约束",
    "- 不要编造产品功能、价格或 benchmark。需要细节时调用 get_item 读源记录。",
    "- 不要暴露内部流水线术语（Tier 1/2/3、分数、gate 结果）。",
    "- 数据库里没有的东西，直说没有，并主动推荐相关条目。",
    "- 回复控制在 400 字以内，除非读者明确要求长篇分析。",
  ].join("\n");
}
