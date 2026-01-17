

/**
 * 交易笔记核心Schema定义
 * 基于field-mapper.ts中的FIELD_ALIASES
 */
/**
 * SchemaValidator - 数据验证器 (Zod v2.2)
 * 
 * 负责验证数据是否符合Schema定义 (基于Zod Schema)
 */

import type { TradeRecord } from "../contracts";
import type {
    RecordSchema,
    ValidationError,
    ValidationResult
} from "./types";
import { TradeRecordSchema, FieldAliases } from "./zod-schema";
import { z } from "zod";

// 保持 TRADE_SCHEMA 导出以便其他模块(如 UI 提示)使用
// 但其实最佳实践是 UI 也统一用 Schema。为了兼容旧代码，保留原有的 TRADE_SCHEMA 结构?
// 原有的 FieldSchema 定义在 types.ts 中。
// 我们可以保留 TRADE_SCHEMA 用于 getFieldSchema 的元数据查找能力
// 验证逻辑则完全委托给 Zod

/**
 * 交易笔记核心Schema定义 (Metadata Layer)
 * 仅用于元数据查找 (Aliases, CanonicalName等)
 */
export const TRADE_SCHEMA: RecordSchema = {
    // 必填字段
    date: { type: "date", required: true, canonicalName: "日期/date", aliases: ["date", "日期"] },
    pnl: { type: "number", required: true, canonicalName: "盈亏/net_profit", aliases: ["pnl", "net_profit", "净利润/net_profit", "净利润", "盈亏", "收益"] },
    outcome: { type: "enum", required: true, enum: ["win", "loss", "scratch", "open", "unknown"], canonicalName: "结果/outcome", aliases: ["outcome", "result", "结果/outcome", "结果"] },
    accountType: { type: "enum", required: true, enum: ["Live", "Demo", "Backtest"], canonicalName: "账户类型/account_type", aliases: ["account_type", "accountType", "账户类型/account_type", "账户类型", "账户/account_type", "账户"] },

    // 可选字段
    ticker: { type: "string", required: false, canonicalName: "品种/ticker", aliases: ["ticker", "symbol", "品种/ticker", "品种", "标的", "代码", "合约"] },
    r: { type: "number", required: false, canonicalName: "R值/r_value", aliases: ["r", "R", "r_value", "r值", "R值"] },
    marketCycle: { type: "string", required: false, canonicalName: "市场周期/market_cycle", aliases: ["marketCycleKey", "market_cycle_key", "cycle", "market_cycle", "marketCycle", "市场周期/market_cycle", "市场周期"] },
    setupKey: { type: "string", required: false, canonicalName: "形态/setup", aliases: ["setup", "setupKey", "setup_key", "设置/setup", "设置", "形态/setup", "形态"] },
    setupCategory: { type: "string", required: false, canonicalName: "设置类别/setup_category", aliases: ["setup_category", "setupCategory", "设置类别/setup_category", "设置类别"] },
    patternsObserved: { type: "array", required: false, canonicalName: "观察到的形态/patterns_observed", aliases: ["patterns_observed", "patterns", "pattern", "观察到的形态/patterns_observed", "形态/patterns", "形态"] },
    signalBarQuality: { type: "array", required: false, canonicalName: "信号K质量/signal_bar_quality", aliases: ["signal_bar_quality", "signal", "signalBarQuality", "信号K/signal_bar_quality", "信号K", "信号K质量"] },
    timeframe: { type: "string", required: false, canonicalName: "时间周期/timeframe", aliases: ["tf", "timeframe", "时间周期/timeframe", "时间周期", "周期/tf", "周期"] },
    direction: { type: "string", required: false, canonicalName: "方向/direction", aliases: ["dir", "direction", "方向/direction", "方向/dir", "方向"] },
    strategyName: { type: "string", required: false, canonicalName: "策略名称/strategy_name", aliases: ["strategy_name", "strategyName", "策略名称/strategy_name", "策略名称/strategyName", "策略名称", "策略/strategyName", "策略"] },
    managementPlan: { type: "array", required: false, canonicalName: "管理计划/management_plan", aliases: ["management_plan", "managementPlan", "管理计划/management_plan", "管理计划"] },
    executionQuality: { type: "string", required: false, canonicalName: "执行评价/execution_quality", aliases: ["execution_quality", "executionQuality", "执行评价/execution_quality", "执行评价", "管理错误/management_error", "management_error", "managementError", "管理错误"] },
    cover: { type: "string", required: false, canonicalName: "封面/cover", aliases: ["cover", "封面/cover", "封面", "banner"] },

    // 新增字段
    entryPrice: { type: "number", required: false, canonicalName: "入场/entry_price", aliases: ["entry_price", "entry", "入场", "入场价", "entryPrice"] },
    stopLoss: { type: "number", required: false, canonicalName: "止损/stop_loss", aliases: ["stop_loss", "stop", "止损", "止损价", "stopLoss", "sl"] },
    takeProfit: { type: "number", required: false, canonicalName: "目标位/take_profit", aliases: ["take_profit", "target", "目标位", "目标价", "takeProfit", "tp"] },
    initialRisk: { type: "number", required: false, canonicalName: "初始风险/initial_risk", aliases: ["initial_risk", "risk", "初始风险", "风险", "initialRisk"] },
    alwaysIn: { type: "string", required: false, canonicalName: "总是方向/always_in", aliases: ["always_in", "总是方向", "AI方向", "alwaysIn", "ai"] },
    dayType: { type: "string", required: false, canonicalName: "日内类型/day_type", aliases: ["day_type", "日内类型", "日类型", "dayType"] },
    probability: { type: "string", required: false, canonicalName: "概率/probability", aliases: ["probability", "prob", "概率", "胜率"] },
    confidence: { type: "string", required: false, canonicalName: "信心/confidence", aliases: ["confidence", "信心", "信心度", "确信度"] },
    orderType: { type: "string", required: false, canonicalName: "订单类型/order_type", aliases: ["order_type", "订单类型", "订单", "orderType", "order"] }
};

export class SchemaValidator {
    /**
     * 验证整个记录 (Zod Powered)
     */
    validateRecord(
        record: Record<string, any>,
        // @ts-ignore - unused but kept for interface compatibility
        schema: RecordSchema = TRADE_SCHEMA
    ): ValidationResult {
        // 1. Preprocess: 映射别名到标准字段名
        const canonicalRecord: Record<string, unknown> = {};

        // 逆向映射别名: Value -> Canonical Key
        // 为了性能，可以缓存这个反向映射Map，这里先实时计算
        const aliasToCanonical = new Map<string, string>();
        Object.entries(FieldAliases).forEach(([canonical, aliases]) => {
            aliasToCanonical.set(canonical, canonical); // 自身也是key
            aliases.forEach(alias => aliasToCanonical.set(alias, canonical));
        });

        for (const [key, value] of Object.entries(record)) {
            const canonicalKey = aliasToCanonical.get(key);
            if (canonicalKey) {
                // 如果同一个标准字段被多个别名赋值，覆盖之（以前面的为准还是后面？这里简单覆盖）
                canonicalRecord[canonicalKey] = value;
            } else {
                // 未知字段，保留以便后续可能的处理，或者 Zod 会 strip
                // TradeRecordSchema 是 strict 还是 loose? 默认 stripUnknown?
                // Zod object is strip by default.
                // 但如果我们需要报错未知字段，则需 strict。
                // 暂时只验证已知字段。
                canonicalRecord[key] = value;
            }
        }

        // 2. Safely Parse with Zod
        const result = TradeRecordSchema.safeParse(canonicalRecord);

        if (result.success) {
            return {
                valid: true,
                errors: []
            };
        } else {
            // Map Zod errors to ValidationError
            const errors: ValidationError[] = (result.error as any).errors.map((err: any) => ({
                field: err.path.join('.'),
                message: err.message,
                value: (canonicalRecord as any)[err.path[0]] // Attempt to get value
            }));

            return {
                valid: false,
                errors
            };
        }
    }

    /**
     * 获取字段Schema (Legacy Support)
     */
    getFieldSchema(fieldName: string): any {
        // 1. 首先检查是否是schema key (如 "date")
        if (TRADE_SCHEMA[fieldName]) {
            return TRADE_SCHEMA[fieldName];
        }

        // 2. 然后检查是否是规范名称 (如 "日期/date")
        for (const [_, schema] of Object.entries(TRADE_SCHEMA)) {
            if (schema.canonicalName === fieldName) {
                return schema;
            }
        }

        // 3. 最后检查是否是别名 (如 "日期", "date")
        for (const [_, schema] of Object.entries(TRADE_SCHEMA)) {
            if (schema.aliases?.includes(fieldName)) {
                return schema;
            }
        }

        return undefined;
    }
}
