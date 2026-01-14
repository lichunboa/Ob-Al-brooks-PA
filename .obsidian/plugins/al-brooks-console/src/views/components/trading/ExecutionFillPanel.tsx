import * as React from "react";
import type { TradeRecord } from "../../../core/contracts";

/**
 * 预设值常量
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
 * ExecutionFillPanel组件Props
 */
export interface ExecutionFillPanelProps {
    trade: TradeRecord;
    app: any;
}

/**
 * 交易执行填写面板组件
 * 用于快速填写管理计划、订单类型、结果和执行评价等字段
 */
export const ExecutionFillPanel: React.FC<ExecutionFillPanelProps> = ({ trade, app }) => {
    // 填写字段函数
    const handleFillField = React.useCallback(async (fieldName: string, value: string) => {
        if (!trade?.path || !app) return;

        try {
            const file = app.vault.getAbstractFileByPath(trade.path);
            if (!file) {
                console.error('[ExecutionFill] File not found:', trade.path);
                return;
            }

            await app.fileManager.processFrontMatter(file, (fm: any) => {
                fm[fieldName] = value;
            });

            console.log(`[ExecutionFill] Filled ${fieldName} = ${value}`);
        } catch (error) {
            console.error('[ExecutionFill] Error:', error);
        }
    }, [trade, app]);

    // 检查字段值 - 使用严格的isEmpty判断
    const isEmpty = (value: any): boolean => {
        if (value === undefined || value === null || value === '') return true;
        if (Array.isArray(value) && value.length === 0) return true;
        return false;
    };

    const managementPlan = (trade as any).managementPlan || (trade as any)["管理计划/management_plan"];
    const orderType = (trade as any).orderType || (trade as any)["订单类型/order_type"];
    const outcome = (trade as any).outcome || (trade as any)["结果/outcome"];
    const executionQuality = (trade as any).executionQuality || (trade as any)["执行评价/execution_quality"];

    // 构建需要填写的字段列表
    const fieldsToFill: Array<{
        label: string;
        fieldName: string;
        values: string[];
        isEmpty: boolean;
    }> = [
            {
                label: "管理计划",
                fieldName: "管理计划/management_plan",
                values: PRESET_VALUES.management_plan,
                isEmpty: isEmpty(managementPlan)
            },
            {
                label: "订单类型",
                fieldName: "订单类型/order_type",
                values: PRESET_VALUES.order_type,
                isEmpty: isEmpty(orderType)
            },
            {
                label: "结果",
                fieldName: "结果/outcome",
                values: PRESET_VALUES.outcome,
                isEmpty: isEmpty(outcome)
            },
            {
                label: "执行评价",
                fieldName: "执行评价/execution_quality",
                values: PRESET_VALUES.execution_quality,
                isEmpty: isEmpty(executionQuality)
            }
        ];

    // 过滤出需要填写的字段
    const emptyFields = fieldsToFill.filter(f => f.isEmpty);

    // 如果所有字段都已填写,不显示面板
    if (emptyFields.length === 0) {
        return null;
    }

    // ✅ 关键改动:一次只显示第一个未填写的字段
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
                {nextField.values.map(value => (
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
                ))}
            </div>
        </div>
    );
};
