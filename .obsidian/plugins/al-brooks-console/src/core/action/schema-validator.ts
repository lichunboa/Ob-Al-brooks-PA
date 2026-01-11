/**
 * SchemaValidator - 数据验证器
 * 
 * 负责验证数据是否符合Schema定义
 */

import type { TradeRecord } from "../contracts";
import type {
    FieldSchema,
    RecordSchema,
    ValidationError,
    ValidationResult
} from "./types";

/**
 * 交易笔记核心Schema定义
 * 基于field-mapper.ts中的FIELD_ALIASES
 */
export const TRADE_SCHEMA: RecordSchema = {
    // 必填字段
    date: {
        type: "date",
        required: true,
        canonicalName: "日期/date",
        aliases: ["date", "日期"]
    },
    pnl: {
        type: "number",
        required: true,
        canonicalName: "盈亏/net_profit",
        aliases: ["pnl", "net_profit", "净利润/net_profit", "净利润", "盈亏", "收益"]
    },
    outcome: {
        type: "enum",
        required: true,
        enum: ["win", "loss", "scratch", "open", "unknown"],
        canonicalName: "结果/outcome",
        aliases: ["outcome", "result", "结果/outcome", "结果"]
    },
    accountType: {
        type: "enum",
        required: true,
        enum: ["Live", "Demo", "Backtest"],
        canonicalName: "账户类型/account_type",
        aliases: [
            "account_type",
            "accountType",
            "账户类型/account_type",
            "账户类型",
            "账户/account_type",
            "账户"
        ]
    },

    // 可选字段
    ticker: {
        type: "string",
        required: false,
        canonicalName: "品种/ticker",
        aliases: ["ticker", "symbol", "品种/ticker", "品种", "标的", "代码", "合约"]
    },
    r: {
        type: "number",
        required: false,
        canonicalName: "R值/r_value",
        aliases: ["r", "R", "r_value", "r值", "R值"]
    },
    marketCycle: {
        type: "string",
        required: false,
        canonicalName: "市场周期/market_cycle",
        aliases: [
            "marketCycleKey",
            "market_cycle_key",
            "cycle",
            "market_cycle",
            "marketCycle",
            "市场周期/market_cycle",
            "市场周期"
        ]
    },
    setupKey: {
        type: "string",
        required: false,
        canonicalName: "形态/setup",
        aliases: [
            "setup",
            "setupKey",
            "setup_key",
            "设置/setup",
            "设置",
            "形态/setup",
            "形态"
        ]
    },
    setupCategory: {
        type: "string",
        required: false,
        canonicalName: "设置类别/setup_category",
        aliases: [
            "setup_category",
            "setupCategory",
            "设置类别/setup_category",
            "设置类别"
        ]
    },
    patternsObserved: {
        type: "array",
        required: false,
        canonicalName: "观察到的形态/patterns_observed",
        aliases: [
            "patterns_observed",
            "patterns",
            "pattern",
            "观察到的形态/patterns_observed",
            "形态/patterns",
            "形态"
        ]
    },
    signalBarQuality: {
        type: "array",
        required: false,
        canonicalName: "信号K质量/signal_bar_quality",
        aliases: [
            "signal_bar_quality",
            "signal",
            "signalBarQuality",
            "信号K/signal_bar_quality",
            "信号K",
            "信号K质量"
        ]
    },
    timeframe: {
        type: "string",
        required: false,
        canonicalName: "时间周期/timeframe",
        aliases: [
            "tf",
            "timeframe",
            "时间周期/timeframe",
            "时间周期",
            "周期/tf",
            "周期"
        ]
    },
    direction: {
        type: "string",
        required: false,
        canonicalName: "方向/direction",
        aliases: ["dir", "direction", "方向/direction", "方向/dir", "方向"]
    },
    strategyName: {
        type: "string",
        required: false,
        canonicalName: "策略名称/strategy_name",
        aliases: [
            "strategy_name",
            "strategyName",
            "策略名称/strategy_name",
            "策略名称/strategyName",
            "策略名称",
            "策略/strategyName",
            "策略"
        ]
    },
    managementPlan: {
        type: "array",
        required: false,
        canonicalName: "管理计划/management_plan",
        aliases: [
            "management_plan",
            "managementPlan",
            "管理计划/management_plan",
            "管理计划"
        ]
    },
    executionQuality: {
        type: "string",
        required: false,
        canonicalName: "执行评价/execution_quality",
        aliases: [
            "execution_quality",
            "executionQuality",
            "执行评价/execution_quality",
            "执行评价",
            "管理错误/management_error",
            "management_error",
            "managementError",
            "管理错误"
        ]
    },
    cover: {
        type: "string",
        required: false,
        canonicalName: "封面/cover",
        aliases: ["cover", "封面/cover", "封面", "banner"]
    }
};

export class SchemaValidator {
    /**
     * 验证单个字段
     */
    validateField(
        fieldName: string,
        value: unknown,
        schema: FieldSchema
    ): ValidationError | null {
        // 1. 必填验证
        if (schema.required && (value === undefined || value === null)) {
            return {
                field: fieldName,
                message: `字段 ${fieldName} 是必填的`,
                value
            };
        }

        // 如果值为空且不是必填，则通过验证
        if (value === undefined || value === null) {
            return null;
        }

        // 2. 类型验证
        switch (schema.type) {
            case "string":
                if (typeof value !== "string") {
                    return {
                        field: fieldName,
                        message: `字段 ${fieldName} 必须是字符串`,
                        value
                    };
                }
                // 正则验证
                if (schema.pattern && !schema.pattern.test(value)) {
                    return {
                        field: fieldName,
                        message: `字段 ${fieldName} 格式不正确`,
                        value
                    };
                }
                break;

            case "number":
                if (typeof value !== "number" || !Number.isFinite(value)) {
                    return {
                        field: fieldName,
                        message: `字段 ${fieldName} 必须是有效数字`,
                        value
                    };
                }
                // 最小值验证
                if (schema.min !== undefined && value < schema.min) {
                    return {
                        field: fieldName,
                        message: `字段 ${fieldName} 不能小于 ${schema.min}`,
                        value
                    };
                }
                // 最大值验证
                if (schema.max !== undefined && value > schema.max) {
                    return {
                        field: fieldName,
                        message: `字段 ${fieldName} 不能大于 ${schema.max}`,
                        value
                    };
                }
                break;

            case "enum":
                const stringValue = String(value);
                if (!schema.enum?.includes(stringValue)) {
                    return {
                        field: fieldName,
                        message: `字段 ${fieldName} 必须是以下值之一: ${schema.enum?.join(', ')}`,
                        value
                    };
                }
                break;

            case "array":
                if (!Array.isArray(value)) {
                    return {
                        field: fieldName,
                        message: `字段 ${fieldName} 必须是数组`,
                        value
                    };
                }
                break;

            case "date":
                // 日期验证 - 接受字符串或Date对象
                if (typeof value === "string") {
                    const date = new Date(value);
                    if (isNaN(date.getTime())) {
                        return {
                            field: fieldName,
                            message: `字段 ${fieldName} 必须是有效日期`,
                            value
                        };
                    }
                } else if (!(value instanceof Date)) {
                    return {
                        field: fieldName,
                        message: `字段 ${fieldName} 必须是日期`,
                        value
                    };
                }
                break;

            default:
                // 未知类型
                return {
                    field: fieldName,
                    message: `字段 ${fieldName} 的类型 ${schema.type} 不支持`,
                    value
                };
        }

        return null;
    }

    /**
     * 验证整个记录
     */
    validateRecord(
        record: Partial<TradeRecord>,
        schema: RecordSchema
    ): ValidationResult {
        // TODO: 实现
        return {
            valid: true,
            errors: []
        };
    }

    /**
     * 获取字段Schema
     */
    getFieldSchema(fieldName: string): FieldSchema | undefined {
        // 首先检查是否是规范名称
        if (TRADE_SCHEMA[fieldName]) {
            return TRADE_SCHEMA[fieldName];
        }

        // 然后检查是否是别名
        for (const [canonicalName, schema] of Object.entries(TRADE_SCHEMA)) {
            if (schema.aliases?.includes(fieldName)) {
                return schema;
            }
        }

        return undefined;
    }
}
