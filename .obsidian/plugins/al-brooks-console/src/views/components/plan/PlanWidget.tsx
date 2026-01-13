import * as React from "react";
import { DailyPlan, PlanChecklistItem } from "../../../types/plan";
import { GlassPanel } from "../../../ui/components/GlassPanel";

interface PlanWidgetProps {
    plan?: DailyPlan;
    onGoToPlan: () => void;
    onToggleChecklistItem?: (index: number) => Promise<void>;
    onUpdateRiskLimit?: (riskLimit: number) => Promise<void>;
    onOpenTodayNote?: () => void;
}

export const PlanWidget: React.FC<PlanWidgetProps> = ({
    plan,
    onGoToPlan,
    onToggleChecklistItem,
    onUpdateRiskLimit,
    onOpenTodayNote
}) => {
    const [isEditingRisk, setIsEditingRisk] = React.useState(false);
    const [riskValue, setRiskValue] = React.useState(plan?.riskLimit || 3);
    const [isTogglingChecklist, setIsTogglingChecklist] = React.useState(false);

    // 同步riskValue与plan.riskLimit
    React.useEffect(() => {
        if (plan?.riskLimit !== undefined) {
            setRiskValue(plan.riskLimit);
        }
    }, [plan?.riskLimit]);

    const handleToggleChecklist = async (index: number) => {
        if (!onToggleChecklistItem || isTogglingChecklist) return;

        setIsTogglingChecklist(true);
        try {
            await onToggleChecklistItem(index);
        } catch (e) {
            console.error("切换checklist失败:", e);
        } finally {
            setIsTogglingChecklist(false);
        }
    };

    const handleRiskBlur = async () => {
        if (!onUpdateRiskLimit || riskValue === plan?.riskLimit) {
            setIsEditingRisk(false);
            return;
        }

        try {
            await onUpdateRiskLimit(riskValue);
            setIsEditingRisk(false);
        } catch (e) {
            console.error("更新风险限制失败:", e);
            // 恢复原值
            setRiskValue(plan?.riskLimit || 3);
            setIsEditingRisk(false);
        }
    };

    return (
        <GlassPanel className="pa-plan-widget" style={{ padding: "12px 16px" }}>
            {/* 标题栏 */}
            <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: plan ? "12px" : "0"
            }}>
                <div
                    style={{
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        cursor: onOpenTodayNote ? "pointer" : "default",
                        color: onOpenTodayNote ? "var(--interactive-accent)" : "var(--text-normal)"
                    }}
                    onClick={onOpenTodayNote}
                    title={onOpenTodayNote ? "点击打开今日日记" : ""}
                >
                    <span>🗺️</span> Pre-market Plan
                </div>
                {!plan && (
                    <button
                        onClick={onGoToPlan}
                        style={{
                            background: "none",
                            border: "none",
                            color: "var(--interactive-accent)",
                            cursor: "pointer",
                            fontSize: "12px",
                            fontWeight: 500
                        }}
                    >
                        Create Plan &gt;
                    </button>
                )}
            </div>

            {plan ? (
                <>
                    {/* Checklist */}
                    {plan.checklist && plan.checklist.length > 0 && (
                        <div style={{ marginBottom: "12px" }}>
                            {plan.checklist.map((item, idx) => (
                                <div
                                    key={idx}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "8px",
                                        marginBottom: "4px",
                                        fontSize: "13px"
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={item.done}
                                        onChange={() => handleToggleChecklist(idx)}
                                        disabled={!onToggleChecklistItem || isTogglingChecklist}
                                        style={{ cursor: "pointer" }}
                                    />
                                    <span style={{
                                        textDecoration: item.done ? "line-through" : "none",
                                        opacity: item.done ? 0.6 : 1,
                                        color: "var(--text-muted)"
                                    }}>
                                        {item.text}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* 关键指标 */}
                    <div style={{
                        display: "flex",
                        gap: "16px",
                        fontSize: "12px",
                        color: "var(--text-muted)",
                        flexWrap: "wrap"
                    }}>
                        {plan.focusSymbols && plan.focusSymbols.length > 0 && (
                            <div>
                                <span style={{ fontWeight: "bold", color: "var(--text-normal)" }}>Focus:</span>{" "}
                                {plan.focusSymbols.join(", ")}
                            </div>
                        )}
                        {plan.strategies && plan.strategies.length > 0 && (
                            <div>
                                <span style={{ fontWeight: "bold", color: "var(--text-normal)" }}>Strat:</span>{" "}
                                {plan.strategies.join(", ")}
                            </div>
                        )}
                        <div>
                            <span style={{ fontWeight: "bold", color: "var(--text-normal)" }}>Risk:</span>{" "}
                            {isEditingRisk ? (
                                <input
                                    type="number"
                                    step="0.5"
                                    value={riskValue}
                                    onChange={(e) => setRiskValue(Number(e.target.value))}
                                    onBlur={handleRiskBlur}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            handleRiskBlur();
                                        } else if (e.key === "Escape") {
                                            setRiskValue(plan?.riskLimit || 3);
                                            setIsEditingRisk(false);
                                        }
                                    }}
                                    autoFocus
                                    style={{
                                        width: "60px",
                                        padding: "2px 4px",
                                        background: "var(--background-primary)",
                                        border: "1px solid var(--interactive-accent)",
                                        borderRadius: "3px",
                                        color: "var(--text-normal)"
                                    }}
                                />
                            ) : (
                                <span
                                    onClick={() => onUpdateRiskLimit && setIsEditingRisk(true)}
                                    style={{
                                        cursor: onUpdateRiskLimit ? "pointer" : "default",
                                        textDecoration: onUpdateRiskLimit ? "underline" : "none",
                                        textDecorationStyle: "dotted"
                                    }}
                                    title={onUpdateRiskLimit ? "点击编辑风险限制" : ""}
                                >
                                    {plan.riskLimit}R
                                </span>
                            )}
                        </div>
                        {plan.maxTrades && (
                            <div>
                                <span style={{ fontWeight: "bold", color: "var(--text-normal)" }}>Max:</span>{" "}
                                {plan.maxTrades} trades
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <div style={{ fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic" }}>
                    No plan for today.{" "}
                    <span
                        style={{ textDecoration: "underline", cursor: "pointer", color: "var(--interactive-accent)" }}
                        onClick={onGoToPlan}
                    >
                        Set one now.
                    </span>
                </div>
            )}
        </GlassPanel>
    );
};
