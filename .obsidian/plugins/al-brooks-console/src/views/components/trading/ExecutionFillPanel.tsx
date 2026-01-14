import * as React from "react";
import type { TradeRecord } from "../../../core/contracts";

import type { EnumPresets } from "../../../core/enum-presets";
import { InteractiveButton } from "../../../ui/components/InteractiveButton";

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
}

/**
 * 交易执行填写面板组件
 * 用于快速填写管理计划、订单类型、结果和执行评价等字段
 */
export const ExecutionFillPanel: React.FC<ExecutionFillPanelProps> = ({ trade, app, enumPresets }) => {
    // 乐观锁：记录用户已经填写的字段及其值
    // Key: fieldName (e.g., "管理计划/management_plan")
    // Value: filled value
    const [optimisticValues, setOptimisticValues] = React.useState<Map<string, any>>(new Map());

    // 当外部 trade 更新时，我们需要检查乐观锁是否可以释放
    React.useEffect(() => {
        console.log(`[ExecutionFill] Prop Update: ${trade.path}`, trade);
        setOptimisticValues(prev => {
            const next = new Map(prev);
            let changed = false;

            for (const [key, optimisticVal] of prev.entries()) {
                // 如果外部数据已经追上了我们的乐观值，或者有了更新的值，就可以释放锁了
                // 这里简化处理：只要外部数据有值，且不为空，我们就认为同步可能完成了。
                // 但为了防止回滚，最严格的做法是：只有当外部值 == 乐观值时，才移除。
                // 可是考虑到解析转换（比如 string -> number），严格相等可能很难。
                // 退一步：我们保留乐观值，直到用户刷新或重新加载组件？
                // 不，那样会一直无法感知外部修改。

                // 策略：如果 Trade 对象的该字段值与乐观值“大致相等”，则移除乐观锁。
                // 或者，我们根本不移除，直到组件卸载？不，因为用户可能在 Obsidian 别处改了。

                // 现实策略：我们只用 optimisticValues 来覆盖显示。
                // 当 props.trade 传来新值时，如果新值 == 乐观值，则移除乐观条目。
                const serverVal = (trade as any)[getTradeKey(key)];
                // 简单的相等检查 (如果是数字，注意类型)
                // Loose equality check to handle string "100" vs number 100
                if (serverVal == optimisticVal) {
                    console.log(`[ExecutionFill] Sync Complete for ${key}. Server=${serverVal}, Optimistic=${optimisticVal}`);
                    next.delete(key);
                    changed = true;
                } else {
                    console.log(`[ExecutionFill] Sync Pending for ${key}. Server=${serverVal}, Optimistic=${optimisticVal}`);
                }
            }
            return changed ? next : prev;
        });
    }, [trade]);

    // Lifecycle Log
    React.useEffect(() => {
        console.log("[ExecutionFill] MOUNTED");
        return () => console.log("[ExecutionFill] UNMOUNTED");
    }, []);

    // 辅助：从 fieldName 映射到 TradeRecord 的 key
    const getTradeKey = (fieldName: string): string => {
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

        // 1. 设置乐观锁
        const parsedValue = NUMERIC_FIELDS.some(f => f.fieldName === fieldName) ? parseFloat(value) : value;

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
                return;
            }

            await app.fileManager.processFrontMatter(file, (fm: any) => {
                fm[fieldName] = value; // 写入时总是写入 frontmatter key (包含中文)
            });

            console.log(`[ExecutionFill] Filled ${fieldName} = ${value}`);
        } catch (error) {
            console.error('[ExecutionFill] Error:', error);
            // 回滚乐观锁
            setOptimisticValues(prev => {
                const next = new Map(prev);
                next.delete(fieldName);
                return next;
            });
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
    }> = [
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
                label: "结果",
                fieldName: "结果/outcome",
                values: options_outcome,
                isEmpty: isEmpty(outcome)
            },
            {
                label: "执行评价",
                fieldName: "执行评价/execution_quality",
                values: options_quality,
                isEmpty: isEmpty(executionQuality)
            }
        ];

    // 过滤出需要填写的字段
    const emptyFields = fieldsToFill.filter(f => f.isEmpty);

    // Debug logging
    console.log("[ExecutionFill] Debug State:", {
        fields: fieldsToFill.map(f => ({
            label: f.label,
            isEmpty: f.isEmpty,
            val: f.fieldName.includes("numeric") ? "numeric" : getVal(f.fieldName, getTradeKey(f.fieldName))
        })),
        optimisticSize: optimisticValues.size,
        outcomeRaw: (trade as any).outcome,
        outcomeVal: outcome,
        executionQualityVal: executionQuality
    });

    // 如果所有字段都已填写,不显示面板
    if (emptyFields.length === 0) {
        // Show a message or keep it null?
        // Maybe useful to see why it's empty
        return null;
    }

    // 一次只显示第一个未填写的字段
    const nextField = emptyFields[0];

    return (
        <div style={{
            marginTop: "16px",
            padding: "12px",
            background: "var(--background-secondary)",
            borderRadius: "8px",
            border: "1px solid var(--background-modifier-border)",
        }}>
            <div style={{
                fontSize: "12px",
                marginBottom: "8px",
                fontWeight: 600,
                color: "var(--text-accent)"
            }}>
                💡 建议下一步填写: {nextField.label}
            </div>
            <div style={{
                fontSize: "11px",
                opacity: 0.8,
                marginBottom: "8px",
                color: "var(--text-muted)"
            }}>
                还有 {emptyFields.length} 个执行字段待填写
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {nextField.isNumeric ? (
                    <div style={{ display: "flex", gap: "8px" }}>
                        <input
                            type="number"
                            placeholder={nextField.placeholder}
                            style={{
                                flex: 1,
                                padding: "8px",
                                background: "var(--background-primary)",
                                border: "1px solid var(--background-modifier-border)",
                                borderRadius: "6px",
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    handleFillField(nextField.fieldName, e.currentTarget.value);
                                }
                            }}
                        />
                        <button
                            onClick={(e) => {
                                const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                                handleFillField(nextField.fieldName, input.value);
                            }}
                            style={{
                                padding: "6px 12px",
                                background: "var(--interactive-accent)",
                                color: "var(--text-on-accent)",
                                border: "none",
                                borderRadius: "6px",
                                cursor: "pointer",
                                fontWeight: 600
                            }}
                        >
                            确认
                        </button>
                    </div>
                ) : (
                    nextField.values?.map(value => (
                        <button
                            key={value}
                            onClick={() => handleFillField(nextField.fieldName, value)}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = "var(--interactive-hover)";
                                e.currentTarget.style.borderColor = "var(--interactive-accent)";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = "var(--background-primary)";
                                e.currentTarget.style.borderColor = "var(--background-modifier-border)";
                            }}
                            style={{
                                padding: "8px",
                                background: "var(--background-primary)",
                                borderRadius: "6px",
                                border: "1px solid var(--background-modifier-border)",
                                fontSize: "12px",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                cursor: "pointer",
                                transition: "all 0.2s",
                                width: "100%",
                                textAlign: "left",
                            }}
                        >
                            <span style={{ fontWeight: 500 }}>{value}</span>
                        </button>
                    ))
                )}
            </div>
        </div>
    );
};
