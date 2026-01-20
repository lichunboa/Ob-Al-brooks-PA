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
    embedded?: boolean; // 是否嵌入到父容器（去除自身边框和背景）
}

/**
 * 交易执行填写面板组件
 * 用于快速填写管理计划、订单类型、结果和执行评价等字段
 */
export const ExecutionFillPanel: React.FC<ExecutionFillPanelProps> = ({ trade, app, enumPresets, suggestedStrategyName, embedded = false }) => {
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
    const filledCount = fieldsToFill.length - emptyFields.length;
    const progressPct = Math.round((filledCount / fieldsToFill.length) * 100);

    // 表格视图：显示所有字段
    return (
        <div style={{
            marginTop: embedded ? "0" : "12px",
            padding: embedded ? "0" : "10px",
            background: embedded ? "transparent" : "rgba(var(--background-secondary-rgb), 0.5)",
            borderRadius: embedded ? "0" : "8px",
            border: embedded ? "none" : "1px solid var(--background-modifier-border)",
            ...(embedded ? {} : glassInsetStyle)
        }}>
            {/* 进度条 */}
            <div style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "10px"
            }}>
                <span style={{ fontSize: "0.85em", fontWeight: 600, color: "var(--text-accent)" }}>
                    📝 执行信息
                </span>
                <div style={{
                    flex: 1,
                    height: "6px",
                    background: "var(--background-modifier-border)",
                    borderRadius: "3px",
                    overflow: "hidden"
                }}>
                    <div style={{
                        width: `${progressPct}%`,
                        height: "100%",
                        background: progressPct === 100 ? "var(--color-green)" : "var(--interactive-accent)",
                        transition: "width 0.3s ease"
                    }} />
                </div>
                <span style={{ fontSize: "0.8em", color: "var(--text-muted)" }}>
                    {filledCount}/{fieldsToFill.length} {progressPct === 100 ? "✅" : ""}
                </span>
            </div>

            {/* 字段表格 */}
            <div style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: "4px 8px",
                fontSize: "0.85em"
            }}>
                {fieldsToFill.map((field, idx) => {
                    const currentVal = field.isNumeric
                        ? getVal(field.fieldName, NUMERIC_FIELDS.find(nf => nf.fieldName === field.fieldName)?.key?.replace(/_([a-z])/g, (g) => g[1].toUpperCase()) || "")
                        : getVal(field.fieldName, getTradeKey(field.fieldName));
                    const isFilled = !field.isEmpty;

                    return (
                        <React.Fragment key={idx}>
                            {/* 字段名 */}
                            <div style={{
                                color: isFilled ? "var(--text-muted)" : "var(--text-accent)",
                                fontWeight: isFilled ? 400 : 500,
                                padding: "4px 0",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px"
                            }}>
                                {isFilled ? "✓" : "○"} {field.label}
                            </div>
                            {/* 字段值/输入 */}
                            <div style={{ padding: "4px 0" }}>
                                {isFilled ? (
                                    // 已填写：显示值
                                    <span style={{ color: "var(--text-normal)" }}>
                                        {String(currentVal)}
                                    </span>
                                ) : field.isStrategy && suggestedStrategyName ? (
                                    // 策略确认按钮
                                    <div style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "8px",
                                        padding: "4px 8px",
                                        background: "rgba(16, 185, 129, 0.1)",
                                        borderRadius: "4px",
                                        border: "1px solid #10B981"
                                    }}>
                                        <span style={{ color: "#10B981", fontWeight: 500, flex: 1 }}>
                                            {suggestedStrategyName}
                                        </span>
                                        <Button
                                            variant="small"
                                            onClick={() => handleFillField(field.fieldName, suggestedStrategyName)}
                                            style={{
                                                padding: "2px 8px",
                                                fontSize: "0.8em",
                                                background: "#10B981",
                                                color: "white",
                                                border: "none"
                                            }}
                                        >
                                            ✓ 确认
                                        </Button>
                                    </div>
                                ) : field.isNumeric ? (
                                    // 未填写数字字段：输入框
                                    <div style={{ display: "flex", gap: "4px" }}>
                                        <input
                                            type="text"
                                            placeholder={field.placeholder}
                                            style={{
                                                flex: 1,
                                                padding: "4px 8px",
                                                border: "1px solid var(--background-modifier-border)",
                                                borderRadius: "4px",
                                                background: "var(--background-primary)",
                                                fontSize: "0.9em"
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                    handleFillField(field.fieldName, e.currentTarget.value);
                                                }
                                            }}
                                        />
                                        <Button
                                            variant="small"
                                            onClick={(e) => {
                                                const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                                                if (input?.value) handleFillField(field.fieldName, input.value);
                                            }}
                                            style={{ padding: "4px 8px", fontSize: "0.85em" }}
                                        >
                                            ✓
                                        </Button>
                                    </div>
                                ) : (
                                    // 未填写选项字段：下拉菜单
                                    <select
                                        style={{
                                            width: "100%",
                                            padding: "6px 8px",
                                            border: "1px solid var(--background-modifier-border)",
                                            borderRadius: "4px",
                                            background: "var(--background-primary)",
                                            fontSize: "0.9em",
                                            cursor: "pointer"
                                        }}
                                        onChange={(e) => {
                                            if (e.target.value) {
                                                handleFillField(field.fieldName, e.target.value);
                                            }
                                        }}
                                        defaultValue=""
                                    >
                                        <option value="" disabled>选择 {field.label}...</option>
                                        {field.values?.map((val, i) => (
                                            <option key={i} value={val}>{val}</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );

};
