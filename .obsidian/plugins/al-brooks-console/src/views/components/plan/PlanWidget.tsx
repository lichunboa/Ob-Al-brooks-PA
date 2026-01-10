import * as React from "react";
import { DailyPlan } from "../../../types/plan";
import { GlassPanel } from "../../../ui/components/GlassPanel";

interface PlanWidgetProps {
    plan?: DailyPlan;
    onGoToPlan: () => void;
}

export const PlanWidget: React.FC<PlanWidgetProps> = ({
    plan,
    onGoToPlan,
}) => {
    return (
        <GlassPanel className="pa-plan-widget" style={{ padding: "12px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
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
                            fontSize: "12px"
                        }}
                    >
                        Create Plan &gt;
                    </button>
                )}
            </div>

            {plan ? (
                <div style={{ display: "flex", gap: "16px", fontSize: "12px", color: "var(--text-muted)" }}>
                    {plan.focusSymbols.length > 0 && (
                        <div>
                            <span style={{ fontWeight: "bold", color: "var(--text-normal)" }}>Focus:</span> {plan.focusSymbols.join(", ")}
                        </div>
                    )}
                    {plan.strategies.length > 0 && (
                        <div>
                            <span style={{ fontWeight: "bold", color: "var(--text-normal)" }}>Strat:</span> {plan.strategies.join(", ")}
                        </div>
                    )}
                    <div>
                        <span style={{ fontWeight: "bold", color: "var(--text-normal)" }}>Risk:</span> {plan.riskLimit}R
                    </div>
                </div>
            ) : (
                <div style={{ fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic" }}>
                    No plan for today. <span style={{ textDecoration: "underline", cursor: "pointer" }} onClick={onGoToPlan}>Set one now.</span>
                </div>
            )}
        </GlassPanel>
    );
};
