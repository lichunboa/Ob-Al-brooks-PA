import * as React from "react";
import { DailyPlan } from "../../types/plan";
import { SectionHeader } from "../../ui/components/SectionHeader";
import { GlassPanel } from "../../ui/components/GlassPanel";
import { glassPanelStyle, glassCardStyle, buttonStyle } from "../../ui/styles/dashboardPrimitives";

const titleStyle: React.CSSProperties = {
    fontSize: "1.2em",
    fontWeight: "600",
    marginBottom: "10px",
    color: "var(--text-normal)",
};

interface PlanTabProps {
    tradingPlans: DailyPlan[];
    onSavePlan: (plan: DailyPlan) => Promise<void>;
}

export const PlanTab: React.FC<PlanTabProps> = ({
    tradingPlans,
    onSavePlan,
}) => {
    const [date, setDate] = React.useState<string>(new Date().toISOString().split("T")[0]);
    const [plan, setPlan] = React.useState<DailyPlan | undefined>(undefined);

    // Form state
    const [focusSymbols, setFocusSymbols] = React.useState<string>("");
    const [strategies, setStrategies] = React.useState<string>("");
    const [riskLimit, setRiskLimit] = React.useState<number>(1);
    const [notes, setNotes] = React.useState<string>("");

    const [isDirty, setIsDirty] = React.useState(false);

    // Sync when date changes or plans update
    React.useEffect(() => {
        const existing = tradingPlans.find(p => p.date === date);
        setPlan(existing);

        if (existing) {
            setFocusSymbols(existing.focusSymbols.join(", "));
            setStrategies(existing.strategies.join(", "));
            setRiskLimit(existing.riskLimit);
            setNotes(existing.notes);
            setIsDirty(false);
        } else {
            // Defaults
            setFocusSymbols("");
            setStrategies("");
            setRiskLimit(1);
            setNotes("");
            setIsDirty(false);
        }
    }, [date, tradingPlans]);

    const handleSave = async () => {
        const newPlan: DailyPlan = {
            date,
            focusSymbols: focusSymbols.split(",").map(s => s.trim()).filter(Boolean),
            strategies: strategies.split(",").map(s => s.trim()).filter(Boolean),
            riskLimit,
            maxTrades: 5, // 默认值
            notes,
            checklist: [ // 默认检查清单
                { text: "咖啡/水", done: false },
                { text: "手机静音", done: false },
                { text: "只做高胜率架构", done: false }
            ]
        };
        await onSavePlan(newPlan);
        setIsDirty(false);
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--size-4-4)", height: "100%" }}>
            <SectionHeader title="Pre-market Plan" icon="map" />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "var(--size-4-4)", flex: 1, minHeight: 0 }}>
                {/* Left: Date Picker / Summary */}
                <GlassPanel>
                    <h3 style={{ ...titleStyle as any, marginBottom: "20px" }}>Select Date</h3>
                    <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        style={{
                            background: "var(--background-modifier-form-field)",
                            border: "1px solid var(--background-modifier-border)",
                            padding: "8px",
                            borderRadius: "6px",
                            color: "var(--text-normal)",
                            width: "100%"
                        }}
                    />
                </GlassPanel>

                {/* Right: Plan Form */}
                <GlassPanel style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <h3 style={{ ...titleStyle as any, margin: 0 }}>Plan for {date}</h3>
                        <button
                            className="pa-btn pa-btn--lift"
                            disabled={!isDirty}
                            onClick={handleSave}
                        >
                            Save Plan
                        </button>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                        <div>
                            <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", color: "var(--text-muted)" }}>
                                Focus Symbols (comma separated)
                            </label>
                            <input
                                type="text"
                                value={focusSymbols}
                                onChange={(e) => { setFocusSymbols(e.target.value); setIsDirty(true); }}
                                placeholder="e.g. BTCUSDT, ETHUSDT"
                                style={{ width: "100%" }}
                            />
                        </div>
                        <div>
                            <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", color: "var(--text-muted)" }}>
                                Target Strategies (comma separated)
                            </label>
                            <input
                                type="text"
                                value={strategies}
                                onChange={(e) => { setStrategies(e.target.value); setIsDirty(true); }}
                                placeholder="e.g. Trend Pullback, Wedge"
                                style={{ width: "100%" }}
                            />
                        </div>
                    </div>

                    <div>
                        <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", color: "var(--text-muted)" }}>
                            Risk Limit (R)
                        </label>
                        <input
                            type="number"
                            step="0.5"
                            value={riskLimit}
                            onChange={(e) => { setRiskLimit(Number(e.target.value)); setIsDirty(true); }}
                            style={{ width: "100px" }}
                        />
                    </div>

                    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                        <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", color: "var(--text-muted)" }}>
                            Pre-market Notes / Hypotheses
                        </label>
                        <textarea
                            value={notes}
                            onChange={(e) => { setNotes(e.target.value); setIsDirty(true); }}
                            style={{
                                flex: 1,
                                width: "100%",
                                resize: "none",
                                background: "var(--background-primary)",
                                border: "1px solid var(--background-modifier-border)",
                                borderRadius: "4px",
                                padding: "8px",
                                fontFamily: "var(--font-monospace)",
                                fontSize: "13px"
                            }}
                            placeholder="Market context analysis, key levels, support/resistance..."
                        />
                    </div>
                </GlassPanel>
            </div>
        </div>
    );
};
