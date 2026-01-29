import * as React from "react";
import { Button } from "../../../ui/components/Button";
import type { TradeData } from "../../../types";
import type { EnumPresets } from "../../../core/enum-presets";
import { FORM_LOGIC_MAP, FIELD_LABELS } from "../../../core/form-logic-map";
import { useRiskCalculator } from "../../../hooks/useRiskCalculator";
import { Input } from "../../../ui/components/Input";
import { Select } from "../../../ui/components/Select";

interface TradeInlineFormProps {
    trade: TradeData;
    enumPresets?: EnumPresets;
    onSave: (updates: Record<string, any>) => Promise<void>;
    onCancel: () => void;
    isSaving: boolean;
}

export const TradeInlineForm: React.FC<TradeInlineFormProps> = ({
    trade,
    enumPresets,
    onSave,
    onCancel,
    isSaving
}) => {
    // Initial State derived from trade
    const [formData, setFormData] = React.useState<Record<string, any>>(() => {
        const t = trade as any;
        return {
            accountType: trade.accountType || "",
            ticker: trade.ticker || "",
            timeframe: trade.timeframe || "5m",
            marketCycle: trade.marketCycle || "",
            alwaysIn: t.alwaysIn || "",
            dayType: t.dayType || "",
            probability: t.probability || "",
            confidence: t.confidence || "",
            managementPlan: t.managementPlan || "",
            direction: trade.direction || "",
            setupCategory: trade.setupCategory || "",
            patternsObserved: t.patternsObserved || "",
            signalBarQuality: t.signalBarQuality || "",
            orderType: t.orderType || "",
            entryPrice: t.entryPrice?.toString() || "",
            stopLoss: t.stopLoss?.toString() || "",
            takeProfit: t.takeProfit?.toString() || "",
            initialRisk: t.initialRisk?.toString() || "",
            pnl: trade.pnl?.toString() || "",
            outcome: trade.outcome || "",
            cover: t.cover || "",
            executionQuality: trade.executionQuality || "",
            strategyName: trade.strategyName || "",
        };
    });

    // Risk Stats
    const riskStats = useRiskCalculator({
        entryPrice: parseFloat(formData.entryPrice) || 0,
        stopLoss: parseFloat(formData.stopLoss) || 0,
        takeProfit: parseFloat(formData.takeProfit) || 0,
        direction: formData.direction
    });

    const handleChange = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSaveClick = () => {
        // Compute updates
        const updates: Record<string, any> = {};
        const t = trade as any;

        // Helper to check changes
        const check = (key: string, formKey: string, isNum = false) => {
            let newVal = formData[formKey];
            let oldVal = t[key] ?? trade[key as keyof TradeData];

            if (isNum) {
                newVal = parseFloat(newVal) || 0;
                oldVal = typeof oldVal === 'number' ? oldVal : parseFloat(oldVal) || 0;
                if (newVal !== oldVal) updates[key] = newVal;
            } else {
                if (newVal !== (oldVal || "")) updates[key] = newVal;
            }
        };

        // Complete list of fields
        check("accountType", "accountType");
        check("ticker", "ticker");
        check("timeframe", "timeframe");
        check("marketCycle", "marketCycle");
        check("alwaysIn", "alwaysIn");
        check("dayType", "dayType");
        check("probability", "probability");
        check("confidence", "confidence");
        check("managementPlan", "managementPlan");
        check("direction", "direction");
        check("setupCategory", "setupCategory");
        // For patternsObserved, handling array vs string might be tricky? 
        // Assuming string for now based on original TradeList.
        check("patternsObserved", "patternsObserved");
        check("signalBarQuality", "signalBarQuality");
        check("orderType", "orderType");
        check("entryPrice", "entryPrice", true);
        check("stopLoss", "stopLoss", true);
        check("takeProfit", "takeProfit", true);
        check("initial_risk", "initialRisk", true); // Note: field name mapped
        check("pnl", "pnl", true);
        check("outcome", "outcome");
        check("cover", "cover");
        check("executionQuality", "executionQuality");
        check("strategyName", "strategyName");

        onSave(updates);
    };

    // Styling
    // Styling
    // Deprecated: inputStyle removed in favor of UI components.


    const labelStyle: React.CSSProperties = {
        display: "block",
        marginBottom: "4px",
        fontSize: "11px",
        fontWeight: 500,
        color: "var(--text-muted)",
    };

    const highlightStyle: React.CSSProperties = {
        ...labelStyle,
        color: "var(--interactive-accent)",
        fontWeight: 700
    };

    // Render logic
    const setupCat = formData.setupCategory;
    const logicKey = Object.keys(FORM_LOGIC_MAP).find(k => k === setupCat);
    const logic = logicKey ? FORM_LOGIC_MAP[logicKey] : undefined;
    const highlightFields = logic?.highlight || [];
    // If visible fields are defined, we could filter. currently showing all.

    // Risk Bar Component
    const renderRiskBar = () => {
        if (!riskStats.isValid || !riskStats.risk) return null;

        return (
            <div style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "8px 12px",
                borderRadius: "4px",
                background: "var(--background-primary)",
                border: "1px solid var(--background-modifier-border)",
                fontSize: "0.85em",
                marginBottom: "8px",
                gridColumn: "1 / -1" // Span all columns
            }}>
                <div style={{ color: "var(--text-muted)" }}>
                    <span style={{ fontWeight: 600 }}>Risk:</span> ${riskStats.risk.toFixed(2)}
                </div>
                {riskStats.reward !== null && (
                    <div style={{ color: "var(--text-muted)" }}>
                        <span style={{ fontWeight: 600 }}>Reward:</span> ${riskStats.reward.toFixed(2)}
                    </div>
                )}
                {riskStats.rRequest !== null && (
                    <div style={{
                        color: riskStats.displayColor,
                        fontWeight: 700,
                        marginLeft: "auto"
                    }}>
                        R-Multiple: {riskStats.rRequest.toFixed(2)}R
                    </div>
                )}
            </div>
        );
    };

    const renderField = (
        key: string,
        internalKey: string, // e.g. "patterns_observed" vs "patternsObserved"
        type: "select" | "number" | "text",
        enumKey?: string
    ) => {
        const isHighlighted = highlightFields.includes(internalKey);

        // Detox Style: Ensure no double borders or clashing backgrounds.
        // We let the Input/Select component handle its own inset style.

        const labelEl = (
            <label style={isHighlighted ? highlightStyle : labelStyle}>
                {FIELD_LABELS[key] || key} {isHighlighted && "★"}
            </label>
        );

        return (
            <div style={{}}>
                {labelEl}
                {type === "select" && enumKey ? (
                    <Select
                        value={formData[key]}
                        onChange={(val) => handleChange(key, val)}
                        options={(enumPresets?.getCanonicalValues(enumKey) || []) as string[]}
                        style={{
                            border: isHighlighted ? "1px solid var(--interactive-accent)" : undefined
                        }}
                    />
                ) : (
                    <Input
                        type={type}
                        step={type === "number" ? (key === 'pnl' ? "0.1" : "0.01") : undefined}
                        value={formData[key]}
                        onChange={(val) => handleChange(key, val)}
                        style={{
                            border: isHighlighted ? "1px solid var(--interactive-accent)" : undefined
                        }}
                    />
                )}
            </div>
        );
    };

    return (
        <div style={{
            padding: "16px",
            borderTop: "1px solid var(--background-modifier-border)",
            background: "var(--background-secondary)",
        }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "12px" }}>
                {renderField("accountType", "account_type", "select", "account_type")}
                {renderField("ticker", "ticker", "select", "ticker")}
                {renderField("timeframe", "timeframe", "select", "timeframe")}

                {renderField("marketCycle", "market_cycle", "select", "market_cycle")}
                {renderField("setupCategory", "setup_category", "select", "setup_category")}
                {renderField("patternsObserved", "patterns_observed", "select", "patterns_observed")}

                {renderField("signalBarQuality", "signal_bar_quality", "select", "signal_bar_quality")}
                {renderField("direction", "direction", "select", "direction")}
                {renderField("alwaysIn", "always_in", "select", "always_in")}

                {renderField("dayType", "day_type", "select", "day_type")}
                {renderField("probability", "probability", "select", "probability")}
                {renderField("confidence", "confidence", "select", "confidence")}

                {renderField("orderType", "order_type", "select", "order_type")}
                {renderField("entryPrice", "entry_price", "number")}
                {renderField("stopLoss", "stop_loss", "number")}

                {renderField("takeProfit", "take_profit", "number")}
                {renderField("initialRisk", "initial_risk", "number")}
                {renderField("pnl", "net_profit", "number")}

                {renderField("outcome", "outcome", "select", "outcome")}
                {renderField("executionQuality", "execution_quality", "select", "execution_quality")}
                {renderField("managementPlan", "management_plan", "select", "management_plan")}

                {renderField("strategyName", "strategy_name", "select", "strategy_name")}

                {/* Risk Bar (Full Width) */}
                {renderRiskBar()}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" }}>
                <Button
                    onClick={onCancel}
                    disabled={isSaving}
                    variant="default"
                    style={{
                        background: "var(--background-modifier-border)",
                        border: "none",
                        padding: "6px 16px",
                        fontSize: "0.9em"
                    }}
                >
                    取消
                </Button>
                <Button
                    onClick={handleSaveClick}
                    disabled={isSaving}
                    variant="default"
                    style={{
                        padding: "6px 16px",
                        fontSize: "0.9em",
                        fontWeight: 500
                    }}
                >
                    {isSaving ? "保存中..." : "保存"}
                </Button>
            </div>
        </div>
    );
};
