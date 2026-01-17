import { z } from "zod";

// Helper to preprocess alias/coercion
// Note: Logic for aliases is typically handling "input object key mapping" before Zod.
// However, Zod can validate "if input field is one of aliases, map it to canonical".
// But usually, standard practice is:
// 1. Map input object keys to canonical keys.
// 2. Validate canonical object with Zod.
// OR
// 2. Use z.preprocess on individual fields? No, schema defines structure.
// IF our ActionService logic is "Map keys -> Validate", then we just need a Schema for the canonical TradeRecord.

// Let's look at schema-validator.ts logic: "getFieldSchema" checks aliases. "validateRecord" iterates record keys, finds schema, and validates.
// So current logic supports "unknown key that matches an alias" being treated as the canonical key.

// Ideally we keep that behavior or standardize it. 
// "FieldAliases" can be a separate constant map used for preprocessing.

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

// Canonical Schema
export const TradeRecordSchema = z.object({
    // Required
    date: z.preprocess((arg) => {
        if (typeof arg === "string" || arg instanceof Date) return new Date(arg);
        return arg;
    }, z.date()),
    pnl: z.preprocess((val) => Number(val), z.number()),
    outcome: z.enum(["win", "loss", "scratch", "open", "unknown"]),
    accountType: z.enum(["Live", "Demo", "Backtest"]),

    // Optional
    ticker: z.string().optional(),
    r: z.preprocess((val) => val === undefined || val === "" ? undefined : Number(val), z.number().optional()),
    marketCycle: z.string().optional(),
    setupKey: z.string().optional(),
    setupCategory: z.string().optional(),
    patternsObserved: z.array(z.string()).optional(),
    signalBarQuality: z.array(z.string()).optional(),
    timeframe: z.string().optional(),
    direction: z.string().optional(),
    strategyName: z.string().optional(),
    managementPlan: z.array(z.string()).optional(),
    executionQuality: z.string().optional(),
    cover: z.string().optional(),

    // Day 10 extensions
    entryPrice: z.preprocess((val) => val ? Number(val) : undefined, z.number().optional()),
    stopLoss: z.preprocess((val) => val ? Number(val) : undefined, z.number().optional()),
    takeProfit: z.preprocess((val) => val ? Number(val) : undefined, z.number().optional()),
    initialRisk: z.preprocess((val) => val ? Number(val) : undefined, z.number().optional()),
    alwaysIn: z.string().optional(),
    dayType: z.string().optional(),
    probability: z.string().optional(),
    confidence: z.string().optional(),
    orderType: z.string().optional(),
});

export type TradeRecordZod = z.infer<typeof TradeRecordSchema>;
