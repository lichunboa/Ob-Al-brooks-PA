import type { ReviewHint, TradeRecord } from "./contracts";
import {
  FIELD_ALIASES,
  getFirstFieldValue,
  normalizeTicker,
  parseNumber,
} from "./field-mapper";

const REVIEW_HINT_FIELD_ALIASES = {
  setup: [
    "setup",
    "setupKey",
    "setup_key",
    "设置/setup",
    "设置",
    "形态/setup",
    "形态",
  ],
  marketCycle: [
    "market_cycle",
    "marketCycle",
    "市场周期/market_cycle",
    "市场周期",
  ],
  tf: ["tf", "timeframe", "周期/tf", "周期", "时间周期"],
  dir: ["dir", "direction", "方向/dir", "方向"],
  patterns: ["patterns", "pattern", "形态/patterns", "形态"],
  strategyName: [
    "strategyName",
    "strategy",
    "策略/strategyName",
    "策略名称/strategyName",
    "策略名称",
  ],
  error: [
    "执行评价/execution_quality",
    "execution_quality",
    "管理错误/management_error",
    "management_error",
    "error",
  ],
  r: ["r", "R", "r_value", "r值", "R值"],
} as const;

function hasValue(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (Array.isArray(v)) return v.length > 0;
  const s = String(v).trim();
  return !!s && s !== "Unknown";
}

function getString(
  fm: Record<string, any> | undefined,
  keys: readonly string[]
): string | undefined {
  if (!fm) return undefined;
  const v = getFirstFieldValue(fm, keys);
  if (typeof v === "string") {
    const s = v.trim();
    return s.length ? s : undefined;
  }
  return undefined;
}

function getStringArray(
  fm: Record<string, any> | undefined,
  keys: readonly string[]
): string[] {
  if (!fm) return [];
  const v = getFirstFieldValue(fm, keys);
  if (Array.isArray(v))
    return v.filter(
      (x): x is string => typeof x === "string" && x.trim().length > 0
    );
  if (typeof v === "string") {
    return v
      .split(/[,，;；/|]/g)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function getTicker(trade: TradeRecord): string | undefined {
  if (typeof trade.ticker === "string" && trade.ticker.trim().length)
    return trade.ticker;
  const fm = (trade.rawFrontmatter ?? {}) as Record<string, any>;
  const raw = getFirstFieldValue(fm, FIELD_ALIASES.ticker);
  return normalizeTicker(raw);
}

export function buildReviewHints(trade: TradeRecord): ReviewHint[] {
  try {
    const hints: ReviewHint[] = [];
    const push = (id: string, zh: string, en: string) =>
      hints.push({ id, zh, en });

    const fm = (trade.rawFrontmatter ?? {}) as Record<string, any>;

    const setup = getString(fm, REVIEW_HINT_FIELD_ALIASES.setup);
    const cycle = getString(fm, REVIEW_HINT_FIELD_ALIASES.marketCycle);
    const tf = getString(fm, REVIEW_HINT_FIELD_ALIASES.tf);
    const dir = getString(fm, REVIEW_HINT_FIELD_ALIASES.dir);
    const ticker = getTicker(trade);
    const patterns = getStringArray(fm, REVIEW_HINT_FIELD_ALIASES.patterns);
    const err = getString(fm, REVIEW_HINT_FIELD_ALIASES.error);
    const r = parseNumber(getFirstFieldValue(fm, REVIEW_HINT_FIELD_ALIASES.r));
    const strategyName = getString(fm, REVIEW_HINT_FIELD_ALIASES.strategyName);

    push(
      "context",
      "一句话复述市场背景（趋势/区间/突破）与当天关键位置（磁体/支撑阻力）。",
      "In one sentence: market context (trend/range/breakout) and key levels (magnet/SR)."
    );

    if (!hasValue(setup)) {
      push(
        "setup_missing",
        "补齐设置类别：这笔更像哪类 setup？（趋势回调/突破/反转/楔形/双顶底/末端旗形…）",
        "Fill setup category: which setup fits best (pullback/breakout/reversal/wedge/DTDB/final flag…)?"
      );
    }

    if (!hasValue(cycle)) {
      push(
        "cycle_missing",
        "补齐市场周期：强趋势/弱趋势/区间/突破模式/通道？用一词标注。",
        "Fill market cycle: strong trend/weak trend/range/breakout mode/channel—label with one term."
      );
    }

    if (!hasValue(strategyName) || strategyName === "Unknown") {
      push(
        "strategy_missing",
        "补齐策略名称：用策略卡的规范名（中文/英文）记录，方便后续统计与复盘检索。",
        "Fill strategy name: use the canonical strategy card name (CN/EN) for consistent stats/search."
      );
    }

    if (patterns.length === 0) {
      push(
        "patterns_missing",
        "补齐观察到的形态：至少写 1 个最关键的形态或信号（如：楔形/双顶底/末端旗形/缺口…）。",
        "Fill observed patterns: record at least one key pattern/signal (wedge/DTDB/final flag/gap…)."
      );
    }

    if (!hasValue(tf)) {
      push(
        "tf_missing",
        "补齐时间周期：这笔的执行周期是什么？（如 5分钟/15分钟/1小时/日线）",
        "Fill timeframe: what execution timeframe (e.g., 5m/15m/1h/daily)?"
      );
    }

    if (!hasValue(ticker)) {
      push(
        "ticker_missing",
        "补齐品种：这笔交易的标的是什么？（SPX/ES/NQ/…）",
        "Fill ticker: what instrument (SPX/ES/NQ/…)?"
      );
    }

    if (!hasValue(dir)) {
      push(
        "dir_missing",
        "补齐方向：做多/做空？为什么顺势/逆势？",
        "Fill direction: long/short? why with-trend or counter-trend?"
      );
    }

    push(
      "entry_logic",
      "写清入场理由：触发点是什么？（信号K、突破/回调到位、二次入场等）",
      "Entry logic: what triggered the entry (signal bar, breakout/pullback, second entry, etc.)?"
    );

    push(
      "risk_mgmt",
      "写清风控：止损放哪、初始风险、是否加仓/减仓、何时移动止损？",
      "Risk management: stop placement, initial risk, scaling in/out, and stop management."
    );

    if (typeof r === "number" && !Number.isNaN(r)) {
      if (r < 0) {
        push(
          "loss_review",
          "亏损复盘：这是计划内亏损还是错误亏损？下一次如何避免同类错误？",
          "Loss review: planned loss or error loss? what will you change next time?"
        );
      } else if (r > 0) {
        push(
          "win_review",
          "盈利复盘：有没有过早止盈/错过加仓/持仓管理可以优化？",
          "Win review: any early exit/missed scale-in/management improvements?"
        );
      }
    }

    if (
      hasValue(err) &&
      String(err).trim() !== "None" &&
      String(err).trim() !== "无"
    ) {
      push(
        "error_review",
        "针对执行评价：具体哪里做得不对？给出 1 条可执行的改进规则。",
        "Execution quality: what exactly went wrong? write 1 actionable improvement rule."
      );
    }

    return hints;
  } catch {
    return [];
  }
}
