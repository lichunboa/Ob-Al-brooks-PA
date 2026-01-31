import * as React from "react";
import { InteractiveButton } from "../../../ui/components/InteractiveButton";
import { V5_COLORS } from "../../../ui/tokens";

/**
 * 学习计划接口
 */
export interface LearningPlan {
    id: string;
    title: string;
    strategies: string[];    // 策略名称列表
    targetDate?: string;     // 目标日期 YYYY-MM-DD
    createdAt: string;
    progress: number;        // 0-100
    status: 'active' | 'completed' | 'paused';
}

/**
 * LearningPlanPanel Props
 */
export interface LearningPlanPanelProps {
    plans: LearningPlan[];
    onCreatePlan?: () => void;
    onOpenStrategy?: (strategyName: string) => void;
    onCompletePlan?: (planId: string) => void;
}

/**
 * 学习计划面板组件
 * 显示当前学习计划和进度
 */
export const LearningPlanPanel: React.FC<LearningPlanPanelProps> = ({
    plans,
    onCreatePlan,
    onOpenStrategy,
    onCompletePlan,
}) => {
    const activePlans = plans.filter(p => p.status === 'active');

    if (activePlans.length === 0 && !onCreatePlan) {
        return null;
    }

    return (
        <div style={{
            border: "1px solid var(--background-modifier-border)",
            borderRadius: "10px",
            padding: "12px",
            marginBottom: "16px",
            background: "var(--background-primary)",
        }}>
            <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "10px",
            }}>
                <div style={{ fontWeight: 600 }}>
                    📋 学习计划{" "}
                    <span style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>
                        (Learning Plan)
                    </span>
                </div>
                {onCreatePlan && (
                    <InteractiveButton
                        className="pa-btn--small"
                        onClick={onCreatePlan}
                    >
                        + 新建
                    </InteractiveButton>
                )}
            </div>

            {activePlans.length === 0 ? (
                <div style={{
                    padding: "20px",
                    textAlign: "center",
                    color: "var(--text-faint)",
                    fontSize: "0.9em",
                }}>
                    暂无学习计划
                    <div style={{ marginTop: "8px" }}>
                        点击"+ 新建"创建本周学习计划
                    </div>
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {activePlans.map(plan => (
                        <div
                            key={plan.id}
                            style={{
                                padding: "12px",
                                background: "rgba(var(--mono-rgb-100), 0.03)",
                                border: "1px solid var(--background-modifier-border)",
                                borderRadius: "8px",
                            }}
                        >
                            <div style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: "8px",
                            }}>
                                <div style={{ fontWeight: 600, fontSize: "0.9em" }}>
                                    {plan.title}
                                </div>
                                <div style={{
                                    fontSize: "0.75em",
                                    color: plan.progress >= 100 ? V5_COLORS.win : "var(--text-muted)",
                                    fontWeight: 600,
                                }}>
                                    {plan.progress}%
                                </div>
                            </div>

                            {/* 进度条 */}
                            <div style={{
                                height: "6px",
                                background: "rgba(128,128,128,0.2)",
                                borderRadius: "3px",
                                marginBottom: "8px",
                                overflow: "hidden",
                            }}>
                                <div style={{
                                    width: `${plan.progress}%`,
                                    height: "100%",
                                    background: plan.progress >= 100 ? V5_COLORS.win : V5_COLORS.back,
                                    borderRadius: "3px",
                                    transition: "width 0.3s ease",
                                }} />
                            </div>

                            {/* 策略列表 */}
                            <div style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "4px",
                            }}>
                                {plan.strategies.map(s => (
                                    <div
                                        key={s}
                                        onClick={() => onOpenStrategy?.(s)}
                                        style={{
                                            padding: "3px 8px",
                                            background: "rgba(96, 165, 250, 0.1)",
                                            borderRadius: "4px",
                                            fontSize: "0.75em",
                                            color: V5_COLORS.back,
                                            cursor: "pointer",
                                            transition: "background 0.15s",
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = "rgba(96, 165, 250, 0.2)";
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = "rgba(96, 165, 250, 0.1)";
                                        }}
                                    >
                                        {s}
                                    </div>
                                ))}
                            </div>

                            {/* 完成按钮 */}
                            {plan.progress >= 100 && onCompletePlan && (
                                <div style={{ marginTop: "8px", textAlign: "right" }}>
                                    <InteractiveButton
                                        className="pa-btn--small"
                                        onClick={() => onCompletePlan(plan.id)}
                                        style={{
                                            background: V5_COLORS.win,
                                            color: "white",
                                        }}
                                    >
                                        ✓ 标记完成
                                    </InteractiveButton>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
