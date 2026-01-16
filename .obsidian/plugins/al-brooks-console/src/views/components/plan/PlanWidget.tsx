import * as React from "react";
import { DailyPlan, PlanChecklistItem } from "../../../types/plan";
import { GlassPanel } from "../../../ui/components/GlassPanel";

import { matchStrategiesV2 } from "../../../core/strategy-matcher-v2";
import { StrategyIndex } from "../../../core/strategy-index";
import type { App } from "obsidian";
import type { TradeRecord } from "../../../core/contracts";

const defaultMarketCycles = [
    "Bull Trend",
    "Bull Channel",
    "Trading Range",
    "Bear Channel",
    "Bear Trend",
    "Breakout Mode"
];

interface PlanWidgetProps {
    plan?: DailyPlan;
    onGoToPlan: () => void;
    onSavePlan: (plan: DailyPlan) => Promise<void>;
    onToggleChecklistItem?: (index: number) => Promise<void>;
    onUpdateRiskLimit?: (riskLimit: number) => Promise<void>;
    onOpenTodayNote?: () => void;
    enumPresets?: any;
    strategyIndex?: StrategyIndex;
    app?: App;
    targetTrade?: TradeRecord | null;
}

export const PlanWidget: React.FC<PlanWidgetProps> = ({
    plan,
    onGoToPlan,
    onSavePlan,
    onToggleChecklistItem,
    onUpdateRiskLimit,
    onOpenTodayNote,
    enumPresets,
    strategyIndex,
    app,
    targetTrade
}) => {
    const [isEditing, setIsEditing] = React.useState(!plan);

    // Form State
    const [focusSymbols, setFocusSymbols] = React.useState<string>("");
    const [strategies, setStrategies] = React.useState<string>("");
    const [riskLimit, setRiskLimit] = React.useState<number>(1);
    const [notes, setNotes] = React.useState<string>("");

    // New Fields
    const [marketCycle, setMarketCycle] = React.useState<string>("");
    const [focusTimeframes, setFocusTimeframes] = React.useState<string>("");
    const [dayType, setDayType] = React.useState<string>("");
    const [alwaysIn, setAlwaysIn] = React.useState<string>("");

    // Initialize form when entering edit mode or when plan changes
    React.useEffect(() => {
        if (plan) {
            setFocusSymbols(plan.focusSymbols?.join(", ") || "");
            setStrategies(plan.strategies?.join(", ") || "");
            setRiskLimit(plan.riskLimit ?? 1);
            setNotes(plan.notes || "");
            setMarketCycle(plan.marketCycle || "");
            setFocusTimeframes(plan.focusTimeframes?.join(", ") || "");
            setDayType(plan.dayType || "");
            setAlwaysIn(plan.alwaysIn || "");
        } else {
            // Defaults for new plan
            setFocusSymbols("ES");
            setStrategies("");
            setRiskLimit(1);
            setNotes("");
            setMarketCycle("");
            setFocusTimeframes("");
            setDayType("");
            setAlwaysIn("");
        }
    }, [plan, isEditing]);

    /**
     * Maps internal state keys to frontmatter keys defined in 属性值预设.md
     */
    const FRONTMATTER_KEYS: Record<string, string> = {
        "marketCycle": "市场周期/market_cycle",
        "dayType": "日内类型/day_type",
        "alwaysIn": "总是方向/always_in",
        "focusTimeframes": "时间周期/timeframe"
        // Note: focusSymbols (ticker) is array in plan but often string in note. 
        // For simplicity we handle basic fields first.
    };

    /**
     * Unified handler to update State, Plan, and Active Note
     */
    const handleAttributeChange = async (key: string, value: string) => {
        // 1. Update Local State
        switch (key) {
            case "marketCycle": setMarketCycle(value); break;
            case "dayType": setDayType(value); break;
            case "alwaysIn": setAlwaysIn(value); break;
            case "focusTimeframes": setFocusTimeframes(value); break;
        }

        // 2. Auto-save to Plan (if we are in edit mode, usually we hit save explicitly, but for consistency if we want instant update we could.
        // However, the existing pattern is "Save" button. 
        // BUT, the request implies 'setting context' which usually implies immediate effect on the active note.
        // Let's allow immediate write to note, but keep plan save explicit or strictly coupled? 
        // The prompt says "write to active note...". I will write to note immediately.

        if (app && targetTrade && FRONTMATTER_KEYS[key]) {
            const file = app.vault.getAbstractFileByPath(targetTrade.path);
            if (file) {
                await app.fileManager.processFrontMatter(file as any, (fm: any) => {
                    fm[FRONTMATTER_KEYS[key]] = value;
                });
            }
        }
    };

    const handleSave = async () => {
        const date = plan?.date || new Date().toISOString().split("T")[0];
        const newPlan: DailyPlan = {
            date,
            focusSymbols: focusSymbols.split(/[,\uff0c]/).map(s => s.trim()).filter(Boolean),
            strategies: strategies.split(/[,\uff0c]/).map(s => s.trim()).filter(Boolean),
            riskLimit,
            maxTrades: plan?.maxTrades || 5,
            notes,
            // New Fields
            marketCycle: marketCycle || undefined,
            focusTimeframes: focusTimeframes ? [focusTimeframes] : [], // store as single string in array for compat
            dayType: dayType || undefined,
            alwaysIn: alwaysIn || undefined,

            checklist: plan?.checklist || [
                { text: "咖啡/水", done: false },
                { text: "手机静音", done: false },
                { text: "只做高胜率架构", done: false }
            ]
        };
        await onSavePlan(newPlan);
        setIsEditing(false);
    };

    // Get Options from EnumPresets (Single Source of Truth)
    const getOptions = (key: string) => {
        if (enumPresets) {
            const values = enumPresets.getCanonicalValues(key);
            if (values && values.length > 0) return values;
        }
        return [];
    }

    const marketCycleOptions = React.useMemo(() => getOptions("市场周期/market_cycle") || defaultMarketCycles, [enumPresets]);
    const dayTypeOptions = React.useMemo(() => getOptions("日内类型/day_type"), [enumPresets]);
    const alwaysInOptions = React.useMemo(() => getOptions("总是方向/always_in"), [enumPresets]);

    // --- Read Mode State (Must be declared before any return) ---
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

    // --- Shared Logic ---
    // Calculate recommendations based on the plan's market cycle (Read Mode) or the form's market cycle (Edit Mode)
    const activeCycle = isEditing ? marketCycle : plan?.marketCycle;

    // Recommendations State
    const [recommendations, setRecommendations] = React.useState<any[]>([]);

    // Update recommendations when Market Cycle changes
    React.useEffect(() => {
        if (!activeCycle || !strategyIndex) {
            setRecommendations([]);
            return;
        }

        // Use logic similar to OpenTradeAssistant
        const results = matchStrategiesV2(strategyIndex, {
            marketCycle: activeCycle,
            includeHistoricalPerf: true,
            limit: 5
        }, []);

        setRecommendations(results);
    }, [activeCycle, strategyIndex]);

    const handleAddStrategy = (strategyName: string) => {
        const current = strategies.split(/[,\uff0c]/).map(s => s.trim()).filter(Boolean);
        if (!current.includes(strategyName)) {
            const newValue = [...current, strategyName].join(", ");
            setStrategies(newValue);
        }
    };

    // Quick Add for Read Mode
    const handleQuickAddStrategy = async (strategyName: string) => {
        if (!plan) return;
        const currentStrategies = plan.strategies || [];
        if (currentStrategies.includes(strategyName)) return;

        const newStrategies = [...currentStrategies, strategyName];
        const newPlan = { ...plan, strategies: newStrategies };
        await onSavePlan(newPlan);
    };

    // --- Render Content ---
    if (isEditing) {
        return (
            <GlassPanel className="pa-plan-widget" style={{ padding: "12px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <div style={{ fontWeight: 600 }}>{plan ? "✏️ Edit Plan" : "📝 New Plan"}</div>
                    <div style={{ display: "flex", gap: "8px" }}>
                        <button
                            onClick={() => setIsEditing(false)}
                            style={{
                                background: "transparent",
                                border: "1px solid var(--background-modifier-border)",
                                borderRadius: "4px",
                                cursor: "pointer",
                                opacity: 0.7
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            style={{
                                background: "var(--interactive-accent)",
                                color: "var(--text-on-accent)",
                                border: "none",
                                borderRadius: "4px",
                                cursor: "pointer",
                                fontWeight: 600
                            }}
                        >
                            Save
                        </button>
                    </div>
                </div>

                {/* 1. Market Context (Driver) */}
                <div style={{ marginBottom: "12px", borderBottom: "1px solid var(--background-modifier-border)", paddingBottom: "12px" }}>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-accent)", marginBottom: "8px" }}>1. Define Market Context</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                        <div>
                            <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>Market Cycle</label>
                            <select
                                value={marketCycle}
                                onChange={(e) => setMarketCycle(e.target.value)}
                                style={{ width: "100%", background: "var(--background-primary)", border: "1px solid var(--background-modifier-border)", padding: "4px" }}
                            >
                                <option value="">- Select -</option>
                                {marketCycleOptions.map((opt: string) => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>Focus Timeframes</label>
                            <input
                                type="text"
                                value={focusTimeframes}
                                onChange={(e) => setFocusTimeframes(e.target.value)}
                                placeholder="M5, H1, H4"
                                style={{ width: "100%", background: "var(--background-primary)", border: "1px solid var(--background-modifier-border)", padding: "4px" }}
                            />
                        </div>
                    </div>
                </div>

                {/* 2. Strategy Selection (Smart Recommendations) */}
                {marketCycle && (
                    <div style={{ marginBottom: "12px", borderBottom: "1px solid var(--background-modifier-border)", paddingBottom: "12px" }}>
                        <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-accent)", marginBottom: "8px" }}>2. Select Strategies</div>

                        {/* Recommendations */}
                        {recommendations.length > 0 && (
                            <div style={{ marginBottom: "8px" }}>
                                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>Recommended for {marketCycle}:</div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                    {recommendations.map(rec => (
                                        <button
                                            key={rec.card.path}
                                            onClick={() => handleAddStrategy(rec.card.canonicalName)}
                                            style={{
                                                padding: "4px 8px",
                                                background: "var(--background-secondary)",
                                                border: "1px solid var(--interactive-accent)",
                                                borderRadius: "4px",
                                                fontSize: "11px",
                                                cursor: "pointer",
                                                color: "var(--text-normal)",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "4px"
                                            }}
                                            title={rec.reason}
                                        >
                                            <span>+ {rec.card.canonicalName}</span>
                                            {/* Show Score or confident marker if high score? */}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div style={{ marginTop: "8px" }}>
                            <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>Selected Strategies</label>
                            <input
                                type="text"
                                value={strategies}
                                onChange={(e) => setStrategies(e.target.value)}
                                placeholder="Trend Pullback, Wedge..."
                                style={{ width: "100%", background: "var(--background-primary)", border: "1px solid var(--background-modifier-border)", padding: "4px" }}
                            />
                        </div>
                    </div>
                )}

                {/* 3. Details & Risk */}
                <div>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-accent)", marginBottom: "8px" }}>{marketCycle ? "3. Finalize Plan" : "2. Finalize Plan"}</div>

                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "12px", marginBottom: "12px" }}>
                        <div>
                            <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>Focus Symbols</label>
                            <input
                                type="text"
                                value={focusSymbols}
                                onChange={(e) => setFocusSymbols(e.target.value)}
                                placeholder="BTC, ETH"
                                style={{ width: "100%", background: "var(--background-primary)", border: "1px solid var(--background-modifier-border)", padding: "4px" }}
                            />
                        </div>
                        <div>
                            <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>Risk Limit (R)</label>
                            <input
                                type="number"
                                step="0.5"
                                value={riskLimit}
                                onChange={(e) => setRiskLimit(Number(e.target.value))}
                                style={{ width: "100%", background: "var(--background-primary)", border: "1px solid var(--background-modifier-border)", padding: "4px" }}
                            />
                        </div>
                    </div>

                    <div>
                        <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>Notes</label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={2}
                            placeholder="Context analysis..."
                            style={{ width: "100%", background: "var(--background-primary)", border: "1px solid var(--background-modifier-border)", padding: "4px", resize: "vertical" }}
                        />
                    </div>
                </div>
            </GlassPanel>
        );
    }

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
                    <button
                        onClick={() => setIsEditing(true)}
                        style={{
                            background: "none",
                            border: "none",
                            color: "var(--text-muted)",
                            cursor: "pointer",
                            fontSize: "12px",
                            padding: "4px"
                        }}
                        title="Edit Plan"
                    >
                        ✏️
                    </button>
                ) : (
                    <button
                        onClick={() => setIsEditing(true)}
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
                        {plan.marketCycle && (
                            <div>
                                <span style={{ fontWeight: "bold", color: "var(--text-normal)" }}>Cycle:</span>{" "}
                                {plan.marketCycle}
                            </div>
                        )}
                        {plan.focusTimeframes && plan.focusTimeframes.length > 0 && (
                            <div>
                                <span style={{ fontWeight: "bold", color: "var(--text-normal)" }}>TF:</span>{" "}
                                {plan.focusTimeframes.join(", ")}
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

                    {/* Smart Strategy Suggestions (Read Mode) */}
                    {recommendations.length > 0 && (
                        <div style={{
                            marginBottom: "12px",
                            padding: "8px 12px",
                            background: "var(--background-secondary)",
                            borderRadius: "8px",
                            border: "1px solid var(--background-modifier-border)"
                        }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                                <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-accent)" }}>
                                    💡 Strategies for {plan.marketCycle}
                                </div>
                            </div>

                            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                {recommendations.map(rec => {
                                    const isSelected = plan.strategies?.includes(rec.card.canonicalName);
                                    if (isSelected) return null; // Only show unselected ones

                                    return (
                                        <button
                                            key={`read-${rec.card.path}`}
                                            onClick={() => handleQuickAddStrategy(rec.card.canonicalName)}
                                            style={{
                                                padding: "4px 10px",
                                                background: "var(--background-primary)",
                                                border: "1px dashed var(--interactive-accent)",
                                                borderRadius: "4px",
                                                fontSize: "11px",
                                                cursor: "pointer",
                                                color: "var(--text-normal)",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "4px"
                                            }}
                                            title="Click to add to plan"
                                        >
                                            <span>bv {rec.card.canonicalName}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Strategies Display */}
                    {plan.strategies && plan.strategies.length > 0 && (
                        <div style={{ marginBottom: "8px" }}>
                            <span style={{ fontWeight: "bold", color: "var(--text-normal)", fontSize: "12px" }}>Selected Strategies:</span>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "4px" }}>
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
                        <div style={{ width: "100%", marginTop: "8px", fontStyle: "italic", borderLeft: "2px solid var(--text-muted)", paddingLeft: "8px" }}>
                            {plan.notes}
                        </div>
                    )}
                </>
            ) : (
                <div style={{ fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic" }}>
                    No plan for today.{" "}
                    <span
                        style={{ textDecoration: "underline", cursor: "pointer", color: "var(--interactive-accent)" }}
                        onClick={() => setIsEditing(true)}
                    >
                        Set one now.
                    </span>
                </div>
            )
            }
        </GlassPanel >
    );
};
