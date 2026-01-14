import * as React from "react";
import type { TradeRecord } from "../../../core/contracts";
import { glassInsetStyle } from "../../../ui/styles/dashboardPrimitives";

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
    app: any; // Obsidian App实例
}

/**
 * 交易执行填写面板组件
 * 用于快速填写管理计划、订单类型、结果和执行评价等字段
 */
export const ExecutionFillPanel: React.FC<ExecutionFillPanelProps> = ({ trade, app }) => {
    // 辅助函数:填写预设值字段
    const handlePresetFill = async (fieldName: string, value: string) => {
        console.log('=== handlePresetFill START ===');
        console.log('Field:', fieldName);
        console.log('Value:', value);
        console.log('Trade path:', trade.path);

        try {
            const file = app.vault.getAbstractFileByPath(trade.path);
            if (!file) {
                console.error('[ExecutionFill] File not found:', trade.path);
                return;
            }

            console.log('[ExecutionFill] Before processFrontMatter');
            await app.fileManager.processFrontMatter(file, (frontmatter: any) => {
                console.log('[ExecutionFill] Frontmatter before:', JSON.parse(JSON.stringify(frontmatter)));
                frontmatter[fieldName] = value;
                console.log('[ExecutionFill] Frontmatter after:', JSON.parse(JSON.stringify(frontmatter)));
            });

            console.log(`[ExecutionFill] Filled ${fieldName} = ${value}`);

            // 等待一下,看看trade对象的变化
            setTimeout(() => {
                console.log('=== 500ms later ===');
                console.log('outcome:', (trade as any).outcome);
                console.log('executionQuality:', (trade as any).executionQuality);
            }, 500);
        } catch (error) {
            console.error('[ExecutionFill] Error:', error);
        }

        console.log('=== handlePresetFill END ===');
    };

    // 渲染预设值按钮组
    const renderPresetButtons = (
        label: string,
        fieldName: string,
        values: string[],
        currentValue: any
    ) => {
        // 如果已填写,不显示这个字段区块
        if (currentValue) return null;

        return (
            <div style={{ marginBottom: "12px" }}>
                <div style={{
                    fontSize: "12px",
                    marginBottom: "6px",
                    fontWeight: 600,
                    color: "var(--text-muted)"
                }}>
                    {label}:
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {values.map(value => (
                        <button
                            key={value}
                            onClick={() => handlePresetFill(fieldName, value)}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = "var(--interactive-hover)";
                                e.currentTarget.style.borderColor = "var(--interactive-accent)";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = "var(--background-primary)";
                                e.currentTarget.style.borderColor = "var(--background-modifier-border)";
                            }}
                            style={{
                                padding: "6px 10px",
                                background: "var(--background-primary)",
                                borderRadius: "6px",
                                border: "1px solid var(--background-modifier-border)",
                                fontSize: "11px",
                                cursor: "pointer",
                                transition: "all 0.2s",
                                whiteSpace: "nowrap"
                            }}
                        >
                            {value}
                        </button>
                    ))}
                </div>
            </div>
        );
    };

    // 检查字段值
    const managementPlan = (trade as any).managementPlan || (trade as any)["管理计划/management_plan"];
    const orderType = (trade as any).orderType || (trade as any)["订单类型/order_type"];
    const outcome = (trade as any).outcome || (trade as any)["结果/outcome"];
    const executionQuality = (trade as any).executionQuality || (trade as any)["执行评价/execution_quality"];

    // 🔍 调试日志
    console.log('=== ExecutionFillPanel Render ===');
    console.log('Trade path:', trade.path);
    console.log('managementPlan:', managementPlan);
    console.log('orderType:', orderType);
    console.log('outcome:', outcome);
    console.log('executionQuality:', executionQuality);
    console.log('Will show managementPlan?', !managementPlan);
    console.log('Will show orderType?', !orderType);
    console.log('Will show outcome?', !outcome);
    console.log('Will show executionQuality?', !executionQuality);

    // ✅ 修复:不隐藏整个面板,让用户可以继续填写其他字段
    // 原来的代码会在某个字段填写后隐藏整个面板,导致用户无法继续填写

    return (
        <div style={{
            ...glassInsetStyle,
            marginTop: "16px",
            padding: "12px"
        }}>
            <div style={{
                fontSize: "13px",
                marginBottom: "12px",
                fontWeight: 600,
                color: "var(--text-accent)"
            }}>
                📝 交易执行填写
            </div>

            {/* 管理计划 */}
            {renderPresetButtons(
                "管理计划",
                "管理计划/management_plan",
                PRESET_VALUES.management_plan,
                managementPlan
            )}

            {/* 订单类型 */}
            {renderPresetButtons(
                "订单类型",
                "订单类型/order_type",
                PRESET_VALUES.order_type,
                orderType
            )}

            {/* 结果 */}
            {renderPresetButtons(
                "结果",
                "结果/outcome",
                PRESET_VALUES.outcome,
                outcome
            )}

            {/* 执行评价 */}
            {renderPresetButtons(
                "执行评价",
                "执行评价/execution_quality",
                PRESET_VALUES.execution_quality,
                executionQuality
            )}
        </div>
    );
};
