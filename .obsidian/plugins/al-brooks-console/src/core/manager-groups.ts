export type ManagerGroupConfig = {
  title: string;
  keywords: readonly string[];
};

export const MANAGER_GROUPS: readonly ManagerGroupConfig[] = [
  {
    title: "⭐ 核心要素 (Core)",
    keywords: [
      "status",
      "状态",
      "date",
      "日期",
      "ticker",
      "品种",
      "profit",
      "pnl",
      "net_profit",
      "利润",
      "净利润",
      "outcome",
      "结果",
      "strategy",
      "策略",
      "setup",
      "设置",
      "设置类别",
      "setup_category",
      "patterns",
      "形态",
      "观察到的形态",
      "patterns_observed",
      "execution_quality",
      "执行评价",
      "probability",
      "概率",
      "management_plan",
      "管理计划",
    ],
  },
  {
    title: "📊 量化数据 (Data)",
    keywords: [
      "price",
      "价格",
      "entry",
      "入场",
      "exit",
      "出场",
      "risk",
      "风险",
      "amount",
      "数量",
      "仓位",
      "r_",
      "rr",
      "r/r",
      "cycle",
      "周期",
      "market_cycle",
      "市场周期",
      "timeframe",
      "时间周期",
      "direction",
      "方向",
      "stop",
      "止损",
      "target",
      "目标",
      "size",
      "qty",
      "quantity",
    ],
  },
  {
    title: "🏷️ 归档信息 (Meta)",
    keywords: [
      "tag",
      "标签",
      "source",
      "来源",
      "alias",
      "别名",
      "type",
      "类型",
      "class",
      "分类",
      "category",
      "categories",
      "类别",
      "time",
      "时间",
      "week",
      "周",
      "note",
      "笔记",
      "id",
      "cover",
      "封面",
    ],
  },
] as const;

export function managerKeyTokens(key: string): string[] {
  const raw = String(key ?? "").trim();
  if (!raw) return [];
  const lower = raw.toLowerCase();
  const tokens = lower
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.trim())
    .filter(Boolean);
  return Array.from(new Set([lower, ...tokens]));
}
