import * as React from "react";
import type { TradeRecord } from "../../../core/contracts";

import type { EnumPresets } from "../../../core/enum-presets";
import { Button } from "../../../ui/components/Button";
// 引入基础设计原语，确保透明风格
import { glassInsetStyle } from "../../../ui/styles/dashboardPrimitives";

/**
 * 预设值常量 (Fallback)
 */
const PRESET_VALUES = {
    management_plan: [
        "一次性下单/不管理 (Set & Forget)",
        "移动止损跟踪 (Trailing)",
        "分批/加减仓 (Scale)",
        "平手/止损离场 (Scratch)"
    ],
    order_type: [
        "突破入场 (Stop Entry)",
        "限价入场 (Limit Entry)",
        "市价入场 (Market Entry)"
    ],
    outcome: [
        "止盈 (Win)",
        "止损 (Loss)",
        "保本/平手 (Scratch)"
    ],
    execution_quality: [
        "🟢 完美执行 (Perfect)",
        "🟡 主动离场/避险 (Valid Scratch)",
        "🔴 恐慌平仓 (Panic Exit)",
        "🔴 追涨杀跌 (FOMO)",
        "🔴 扛单/不止损 (No Stop)",
        "🔴 过度交易 (Overtrading)"
    ]
};

/**
 * 数值字段定义
 */
const NUMERIC_FIELDS = [
    { label: "入场价格", fieldName: "入场/entry_price", key: "entry_price", placeholder: "输入入场价格..." },
    { label: "止损价格", fieldName: "止损/stop_loss", key: "stop_loss", placeholder: "输入止损价格..." },
    { label: "目标价格", fieldName: "目标位/take_profit", key: "take_profit", placeholder: "输入目标价格..." },
    { label: "初始风险(R)", fieldName: "初始风险/initial_risk", key: "initial_risk", placeholder: "输入风险额 (如 100)..." },
    { label: "净利润", fieldName: "净利润/net_profit", key: "net_profit", placeholder: "输入净利润..." }
];

/**
 * ExecutionFillPanel组件Props
 */
export interface ExecutionFillPanelProps {
    trade: TradeRecord;
    app: any;
    enumPresets?: EnumPresets;
    suggestedStrategyName?: string; // Automatically suggested strategy name from engine
}

/**
 * 交易执行填写面板组件
 * 用于快速填写管理计划、订单类型、结果和执行评价等字段
 */
export const ExecutionFillPanel: React.FC<ExecutionFillPanelProps> = ({ trade, app, enumPresets, suggestedStrategyName }) => {
    // 乐观锁：记录用户已经填写的字段及其值
    // Key: fieldName (e.g., "管理计划/management_plan")
    // Value: filled value
    const [optimisticValues, setOptimisticValues] = React.useState<Map<string, any>>(new Map());

    // 当 Trade 路径改变时（即切换了交易），必须清空乐观锁状态，防止上一个交易的状态污染当前交易
    React.useEffect(() => {
        setOptimisticValues(new Map());
    }, [trade.path]);

    // 状态协调：当 trade 属性更新时，检查是否与 optimisticValues 一致
    // 如果一致 (Synced)，则清除乐观状态，回归 Single Source of Truth
    React.useEffect(() => {
        setOptimisticValues(prev => {
            const next = new Map(prev);
            let hasChanges = false;

            for (const [fieldName, optimisticVal] of prev.entries()) {
                const tradeKey = getTradeKey(fieldName);
                const serverVal = (trade as any)[tradeKey];

                // 宽松比较 (Loose equality) 以处理 null/undefined/string/number 差异
                // 1. 如果服务端值已经追上了乐观值，移除乐观锁 (Write Success)
                if (serverVal == optimisticVal) {
                    next.delete(fieldName);
                    hasChanges = true;
                }
            }

            return hasChanges ? next : prev;
        });
    }, [trade]);

    // 辅助：从 fieldName 映射到 TradeRecord 的 key
    const getTradeKey = (fieldName: string): string => {
        // Fix: Map both possible field names to the internal key, prioritizing strategy_name
        if (fieldName === "策略名称/strategy_name" || fieldName === "策略/strategy") return "strategyName";
        if (fieldName.includes("management_plan")) return "managementPlan";
        if (fieldName.includes("order_type")) return "orderType";
        if (fieldName.includes("outcome")) return "outcome";
        if (fieldName.includes("execution_quality")) return "executionQuality";
        if (fieldName.includes("entry_price")) return "entryPrice";
        if (fieldName.includes("stop_loss")) return "stopLoss";
        if (fieldName.includes("take_profit")) return "takeProfit";
        if (fieldName.includes("initial_risk")) return "initialRisk";
        if (fieldName.includes("net_profit")) return "netProfit";
        return fieldName;
    };

    // 填写字段函数
    const handleFillField = React.useCallback(async (fieldName: string, value: string) => {
        if (!trade?.path || !app) return;

        // 1. 设置乐观锁 (Aggressive)
        const isNumeric = NUMERIC_FIELDS.some(f => f.fieldName === fieldName);
        const parsedValue = isNumeric ? parseFloat(value) : value;

        setOptimisticValues(prev => {
            const next = new Map(prev);
            next.set(fieldName, parsedValue);
            return next;
        });

        try {
            // 2. 更新实际文件
            const file = app.vault.getAbstractFileByPath(trade.path);
            if (!file) {
                console.error('[ExecutionFill] File not found:', trade.path);
                return; // Keep optimistic value, maybe user can retry?
            }

            await app.fileManager.processFrontMatter(file, (fm: any) => {
                fm[fieldName] = value; // 写入时总是写入 frontmatter key (包含中文)
            });

            console.log(`[ExecutionFill] Filled ${fieldName} = ${value}`);
        } catch (error) {
            console.error('[ExecutionFill] Error:', error);
            // 这里我们不回滚，因为现在的策略是“信任本地”。
            // 如果报错了，用户可能会再次点击。或者我们可以加个 "Error" 状态。
            // 暂不回滚。
        }
    }, [trade, app]);

    // 检查字段值 - 增强对数字 0 的支持，排除 NaN
    const isEmpty = (value: any): boolean => {
        if (typeof value === "number") {
            // 0 is valid, but NaN is empty
            return Number.isNaN(value);
        }
        if (value === undefined || value === null || value === '') return true;
        if (Array.isArray(value) && value.length === 0) return true;
        // 特殊处理 "open", "unknown" 为空状态（允许用户修改）
        if (typeof value === "string") {
            const lower = value.toLowerCase().trim();
            if (lower === "open" || lower === "unknown" || lower === "ongoing") return true;
        }
        return false;
    };

    // 获取值：优先从乐观锁取，否则从 trade 取
    const getVal = (fieldName: string, tradeKey: string) => {
        if (optimisticValues.has(fieldName)) {
            return optimisticValues.get(fieldName);
        }
        return (trade as any)[tradeKey];
    };

    const strategyName = getVal("策略名称/strategy_name", "strategyName");
    const managementPlan = getVal("管理计划/management_plan", "managementPlan");
    const orderType = getVal("订单类型/order_type", "orderType");
    const outcome = getVal("结果/outcome", "outcome");
    const executionQuality = getVal("执行评价/execution_quality", "executionQuality");

    // 获取动态预设值
    const getOptions = (key: string, fallback: string[]) => {
        if (!enumPresets) return fallback;
        const dynamic = enumPresets.getCanonicalValues(key);
        return dynamic.length > 0 ? dynamic : fallback;
    };

    const options_management = getOptions("管理计划/management_plan", PRESET_VALUES.management_plan);
    const options_order = getOptions("订单类型/order_type", PRESET_VALUES.order_type);
    const options_outcome = getOptions("结果/outcome", PRESET_VALUES.outcome);
    const options_quality = getOptions("执行评价/execution_quality", PRESET_VALUES.execution_quality);

    const fieldsToFill: Array<{
        label: string;
        fieldName: string;
        values?: string[] | readonly string[];
        isNumeric?: boolean;
        placeholder?: string;
        isEmpty: boolean;
        isStrategy?: boolean; // Special flag for strategy auto-fill
    }> = [
            // 0. 策略名称（自动填充）
            {
                label: "策略名称",
                fieldName: "策略名称/strategy_name", // Corrected field name
                values: suggestedStrategyName ? [suggestedStrategyName] : [],
                isEmpty: isEmpty(strategyName) && !!suggestedStrategyName, // Only prompt if empty AND we have a suggestion
                isStrategy: true
            },
            {
                label: "管理计划",
                fieldName: "管理计划/management_plan",
                values: options_management,
                isEmpty: isEmpty(managementPlan)
            },
            {
                label: "订单类型",
                fieldName: "订单类型/order_type",
                values: options_order,
                isEmpty: isEmpty(orderType)
            },
            ...NUMERIC_FIELDS.map(nf => ({
                label: nf.label,
                fieldName: nf.fieldName,
                isNumeric: true,
                placeholder: nf.placeholder,
                // numeric fields use `key` (e.g. entryPrice) not raw fieldname
                isEmpty: isEmpty(getVal(nf.fieldName, nf.key.replace(/_([a-z])/g, (g) => g[1].toUpperCase()))) // snake to camel
            })),
            {
                label: "执行评价",
                fieldName: "执行评价/execution_quality",
                values: options_quality,
                isEmpty: isEmpty(executionQuality)
            },
            {
                label: "结果",
                fieldName: "结果/outcome",
                values: options_outcome,
                isEmpty: isEmpty(outcome)
            }
        ];

    // 过滤出需要填写的字段
    const emptyFields = fieldsToFill.filter(f => f.isEmpty);

    // 如果所有字段都已填写, 显示完成状态而不是 null
    if (emptyFields.length === 0) {
        return (
            <div style={{
                marginTop: "16px",
                padding: "12px 16px",
                background: "rgba(var(--background-secondary-rgb), 0.3)",
                borderRadius: "12px",
                border: "1px solid var(--background-modifier-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                ...glassInsetStyle
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "16px" }}>✅</span>
                    <span style={{
                        fontSize: "13px",
                        fontWeight: 500,
                        color: "var(--text-muted)"
                    }}>
                        执行信息已填写完成
                    </span>
                </div>
                {/* Future: Add 'Edit' button here if needed */}
            </div>
        );
    }

    // 一次只显示第一个未填写的字段
    const nextField = emptyFields[0];

    return (
        <div style={{
            marginTop: "12px",
            padding: "10px",
            background: "rgba(var(--background-secondary-rgb), 0.5)",
            borderRadius: "8px",
            border: "1px solid var(--background-modifier-border)",
            ...glassInsetStyle
        }}>
            <div style={{
                fontSize: "0.85em",
                marginBottom: "6px",
                fontWeight: 600,
                color: "var(--text-accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "6px"
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>💡</span>
                    <span>建议补充执行: {nextField.label}</span>
                </div>
                <span style={{
                    fontSize: "0.8em",
                    color: "var(--text-muted)",
                    fontWeight: 400
                }}>
                    还有 {emptyFields.length} 项
                </span>
            </div>

            {/* 两列网格布局 */}
            <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "4px"
            }}>
                {nextField.isStrategy ? (
                    // 特殊渲染：策略确认 - 占满两列
                    <div style={{
                        gridColumn: "1 / -1",
                        padding: "8px 10px",
                        background: "rgba(var(--interactive-accent-rgb), 0.1)",
                        border: "1px solid var(--interactive-accent)",
                        borderRadius: "6px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "8px"
                    }}>
                        <div style={{ fontSize: "0.85em" }}>
                            检测到匹配策略：<span style={{ color: "var(--text-accent)", fontWeight: 600 }}>{suggestedStrategyName}</span>
                        </div>
                        <Button
                            variant="small"
                            onClick={() => suggestedStrategyName && handleFillField(nextField.fieldName, suggestedStrategyName)}
                        >
                            ✅ 确认
                        </Button>
                    </div>
                ) : nextField.isNumeric ? (
                    // 数值输入 - 占满两列
                    <div style={{ gridColumn: "1 / -1", display: "flex", gap: "6px" }}>
                        <input
                            type="number"
                            placeholder={nextField.placeholder}
                            style={{
                                flex: 1,
                                padding: "6px 10px",
                                background: "var(--background-primary)",
                                border: "1px solid var(--background-modifier-border)",
                                borderRadius: "4px",
                                outline: "none",
                                fontSize: "0.85em"
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    handleFillField(nextField.fieldName, e.currentTarget.value);
                                }
                            }}
                        />
                        <Button
                            variant="small"
                            onClick={(e) => {
                                const wrapper = e.currentTarget.parentElement;
                                const input = wrapper?.querySelector('input');
                                if (input) {
                                    handleFillField(nextField.fieldName, input.value);
                                }
                            }}
                        >
                            确认
                        </Button>
                    </div>
                ) : (
                    // 选项列表 - 两列网格
                    nextField.values?.map(value => (
                        <div
                            key={value}
                            onClick={() => handleFillField(nextField.fieldName, value)}
                            style={{
                                padding: "6px 8px",
                                background: "var(--background-primary)",
                                borderRadius: "4px",
                                border: "1px solid var(--background-modifier-border)",
                                fontSize: "0.8em",
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = "rgba(var(--interactive-accent-rgb), 0.1)";
                                e.currentTarget.style.borderColor = "var(--interactive-accent)";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = "var(--background-primary)";
                                e.currentTarget.style.borderColor = "var(--background-modifier-border)";
                            }}
                        >
                            {value}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
