import * as React from "react";
import { DailyPlan } from "../../../types/plan";
import { GlassPanel } from "../../../ui/components/GlassPanel";
import { Button } from "../../../ui/components/Button";

interface PlanWidgetProps {
    plan?: DailyPlan;
    onGoToPlan: () => void;
    onSavePlan: (plan: DailyPlan) => Promise<void>;
    onToggleChecklistItem?: (index: number) => Promise<void>;
    onUpdateRiskLimit?: (riskLimit: number) => Promise<void>;
    onOpenTodayNote?: () => void;
}

export const PlanWidget: React.FC<PlanWidgetProps> = ({
    plan,
    onSavePlan,
    onToggleChecklistItem,
    onUpdateRiskLimit,
    onOpenTodayNote
}) => {
    // --- Read Mode State (Inline Actions) ---
    const [isEditingRisk, setIsEditingRisk] = React.useState(false);
    const [riskValue, setRiskValue] = React.useState(plan?.riskLimit || 3);
    const [isTogglingChecklist, setIsTogglingChecklist] = React.useState(false);

    // Sync riskValue
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
                {plan ? (
                    <Button
                        onClick={onOpenTodayNote}
                        variant="text"
                        style={{
                            color: "var(--text-muted)",
                            fontSize: "12px",
                            padding: "4px"
                        }}
                        title="Edit Plan (Open Note)"
                    >
                        ✏️
                    </Button>
                ) : (
                    <Button
                        onClick={onOpenTodayNote}
                        variant="text"
                        style={{
                            color: "var(--interactive-accent)",
                            fontSize: "12px",
                            fontWeight: 500
                        }}
                    >
                        Create Plan &gt;
                    </Button>
                )}
            </div>

            {
                plan ? (
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
                            flexWrap: "wrap",
                            marginBottom: "8px"
                        }}>
                            {plan.focusSymbols && plan.focusSymbols.length > 0 && (
                                <div>
                                    <span style={{ fontWeight: "bold", color: "var(--text-normal)" }}>Focus:</span>{" "}
                                    {Array.isArray(plan.focusSymbols) ? plan.focusSymbols.join(", ") : plan.focusSymbols}
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
                        </div>

                        {plan.strategies && plan.strategies.length > 0 && (
                            <div style={{ marginBottom: "8px" }}>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                    {plan.strategies.map(s => (
                                        <span key={s} style={{
                                            padding: "2px 8px",
                                            background: "var(--interactive-accent)",
                                            color: "var(--text-on-accent)",
                                            borderRadius: "4px",
                                            fontSize: "11px",
                                            fontWeight: 500
                                        }}>
                                            {s}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {/* Always show Notes Summary if present */}
                        {plan.notes && (
                            <div style={{ width: "100%", marginTop: "8px", fontStyle: "italic", borderLeft: "2px solid var(--text-muted)", paddingLeft: "8px", fontSize: "12px", color: "var(--text-muted)" }}>
                                {plan.notes}
                            </div>
                        )}
                    </>
                ) : (
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic" }}>
                        No plan for today.{" "}
                        <span
                            style={{ textDecoration: "underline", cursor: "pointer", color: "var(--interactive-accent)" }}
                            onClick={onOpenTodayNote}
                        >
                            Open Day Planner.
                        </span>
                    </div>
                )
            }
        </GlassPanel >
    );
};
