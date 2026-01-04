import type { ReviewHint, TradeRecord } from "./contracts";

function hasValue(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (Array.isArray(v)) return v.length > 0;
  const s = String(v).trim();
  return !!s && s !== "Unknown";
}

export function buildReviewHints(trade: TradeRecord): ReviewHint[] {
  try {
    const hints: ReviewHint[] = [];
    const push = (id: string, zh: string, en: string) =>
      hints.push({ id, zh, en });

    // 保持与 legacy Dataview 版本一致（scripts/core/pa-loaders.js）：
    // - 仅包含：setup_missing / cycle_missing / tf_missing / loss_review
    // - 使用索引层已归一化的 TradeRecord 字段（不依赖 rawFrontmatter 结构）
    // legacy(v5) 对齐：setup_missing 检查 trade.setup（插件侧为 setupKey）。
    // 为兼容历史数据，也允许 setupCategory 视作已填。
    if (!hasValue(trade.setupKey) && !hasValue(trade.setupCategory)) {
      push("setup_missing", "补齐设置类别", "Fill setup category");
    }

    if (!hasValue(trade.marketCycle)) {
      push("cycle_missing", "补齐市场周期", "Fill market cycle");
    }

    if (!hasValue(trade.timeframe)) {
      push("tf_missing", "补齐时间周期", "Fill timeframe");
    }

    const pnl =
      typeof trade.pnl === "number" && Number.isFinite(trade.pnl)
        ? trade.pnl
        : undefined;
    if (typeof pnl === "number" && pnl < 0) {
      push("loss_review", "亏损复盘：计划内还是失误？", "Loss review");
    }

    return hints;
  } catch {
    return [];
  }
}
