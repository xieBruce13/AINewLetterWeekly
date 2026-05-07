/**
 * Module registry. There are exactly three modules: model, product, operation.
 *
 * "operation" was historically marked as future/undefined in skill/SKILL.md;
 * here we activate it as the third module covering AI infra/ops/eval/agent
 * tooling — anything you need to run AI in production rather than build the
 * model or ship the end-user product.
 */
export type Module = "model" | "product" | "operation";

export const MODULES: Module[] = ["model", "product", "operation"];

export const MODULE_LABEL_ZH: Record<Module, string> = {
  model: "模型",
  product: "产品",
  operation: "运营",
};

export const MODULE_LABEL_EN: Record<Module, string> = {
  model: "Model",
  product: "Product",
  operation: "Operation",
};

export const MODULE_BLURB: Record<Module, string> = {
  model: "底座模型与能力跳跃 — 偏技术口径，关注选型影响。",
  product: "终端产品与工作流变化 — 用户今天就能感知到的改变。",
  operation: "AI 基础设施 / 评测 / 部署 / 成本 — 把模型跑到生产的工具链。",
};

export function isModule(s: string | null | undefined): s is Module {
  return s === "model" || s === "product" || s === "operation";
}

export function moduleLabel(m: string): string {
  if (m === "model" || m === "product" || m === "operation")
    return MODULE_LABEL_ZH[m];
  return m;
}

export const TIER_LABEL_ZH: Record<string, string> = {
  main: "主条目",
  brief: "简讯",
};
