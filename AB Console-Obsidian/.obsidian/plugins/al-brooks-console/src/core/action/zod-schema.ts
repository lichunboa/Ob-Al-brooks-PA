
import { z } from "zod";
import type { EnumPresets } from "../enum-presets";

// Helper to preprocess alias/coercion
// Note: Logic for aliases is typically handling "input object key mapping" before Zod.
// However, Zod can validate "if input field is one of aliases, map it to canonical".
// But usually, standard practice is:
// 1. Map input object keys to canonical keys.
// 2. Validate canonical object with Zod.

export const FieldAliases: Record<string, string[]> = {
    date: ["date", "日期"],
    pnl: ["pnl", "net_profit", "净利润/net_profit", "净利润", "盈亏", "收益"],
    outcome: ["outcome", "result", "结果/outcome", "结果"],
    accountType: ["account_type", "accountType", "账户类型/account_type", "账户类型", "账户/account_type", "账户"],
    ticker: ["ticker", "symbol", "品种/ticker", "品种", "标的", "代码", "合约"],
    r: ["r", "R", "r_value", "r值", "R值"],
    marketCycle: ["marketCycleKey", "market_cycle_key", "cycle", "market_cycle", "marketCycle", "市场周期/market_cycle", "市场周期"],
    setupKey: ["setup", "setupKey", "setup_key", "设置/setup", "设置", "形态/setup", "形态"],
    setupCategory: ["setup_category", "setupCategory", "设置类别/setup_category", "设置类别"],
    patternsObserved: ["patterns_observed", "patterns", "pattern", "观察到的形态/patterns_observed", "形态/patterns", "形态"],
    signalBarQuality: ["signal_bar_quality", "signal", "signalBarQuality", "信号K/signal_bar_quality", "信号K", "信号K质量"],
    timeframe: ["tf", "timeframe", "时间周期/timeframe", "时间周期", "周期/tf", "周期"],
    direction: ["dir", "direction", "方向/direction", "方向/dir", "方向"],
    strategyName: ["strategy_name", "strategyName", "策略名称/strategy_name", "策略名称/strategyName", "策略名称", "策略/strategyName", "策略"],
    managementPlan: ["management_plan", "managementPlan", "管理计划/management_plan", "管理计划"],
    executionQuality: ["execution_quality", "executionQuality", "执行评价/execution_quality", "执行评价", "管理错误/management_error", "management_error", "managementError", "管理错误"],
    cover: ["cover", "封面/cover", "封面", "banner"],
    entryPrice: ["entry_price", "entry", "入场", "入场价", "entryPrice"],
    stopLoss: ["stop_loss", "stop", "止损", "止损价", "stopLoss", "sl"],
    takeProfit: ["take_profit", "target", "目标位", "目标价", "takeProfit", "tp"],
    initialRisk: ["initial_risk", "risk", "初始风险", "风险", "initialRisk"],
    alwaysIn: ["always_in", "总是方向", "AI方向", "alwaysIn", "ai"],
    dayType: ["day_type", "日内类型", "日类型", "dayType"],
    probability: ["probability", "prob", "概率", "胜率"],
    confidence: ["confidence", "信心", "信心度", "确信度"],
    orderType: ["order_type", "订单类型", "订单", "orderType", "order"]
};

// Helper: safe enum from string array
function createEnum(values: readonly string[] | undefined, fallback: readonly string[] = []): z.ZodTypeAny {
    const list = values && values.length > 0 ? values : fallback;
    if (list.length === 0) return z.string();
    // Zod requires non-empty array for enum
    return z.enum(list as [string, ...string[]]);
}

/**
 * Creates a Zod schema for TradeRecord, optionally using dynamic presets.
 */
export function createTradeRecordSchema(presets?: EnumPresets) {
    const getValues = (key: string) => {
        if (!presets) return [];
        return presets.getCanonicalValues(key) || [];
    };

    return z.object({
        // Required
        date: z.preprocess((arg) => {
            if (typeof arg === "string" || arg instanceof Date) return new Date(arg);
            return arg;
        }, z.date()),
        pnl: z.preprocess((val) => Number(val), z.number()),
        outcome: createEnum(getValues("outcome"), ["win", "loss", "scratch", "open", "unknown"]),
        accountType: createEnum(getValues("account_type"), ["Live", "Demo", "Backtest"]),

        // Optional
        ticker: z.string().optional(),
        r: z.preprocess((val) => val === undefined || val === "" ? undefined : Number(val), z.number().optional()),

        marketCycle: createEnum(getValues("market_cycle")).optional(),
        setupKey: createEnum(getValues("setup")).optional(),
        setupCategory: createEnum(getValues("setup_category")).optional(),

        patternsObserved: z.array(z.string()).optional(), // Hard to strictly validate array elements against enum with Zod cleanly without custom refine
        signalBarQuality: z.array(z.string()).optional(),

        timeframe: createEnum(getValues("timeframe")).optional(),
        direction: createEnum(getValues("direction")).optional(),
        strategyName: z.string().optional(),
        managementPlan: z.array(z.string()).optional(),
        executionQuality: createEnum(getValues("execution_quality")).optional(),
        cover: z.string().optional(),

        // Day 10 extensions
        entryPrice: z.preprocess((val) => val ? Number(val) : undefined, z.number().optional()),
        stopLoss: z.preprocess((val) => val ? Number(val) : undefined, z.number().optional()),
        takeProfit: z.preprocess((val) => val ? Number(val) : undefined, z.number().optional()),
        initialRisk: z.preprocess((val) => val ? Number(val) : undefined, z.number().optional()),

        alwaysIn: createEnum(getValues("always_in")).optional(),
        dayType: createEnum(getValues("day_type")).optional(),
        probability: createEnum(getValues("probability")).optional(),
        confidence: createEnum(getValues("confidence")).optional(),
        orderType: createEnum(getValues("order_type")).optional(),
    });
}

// Canonical Service Schema (Static Fallback)
export const TradeRecordSchema = createTradeRecordSchema();

export type TradeRecordZod = z.infer<typeof TradeRecordSchema>;
