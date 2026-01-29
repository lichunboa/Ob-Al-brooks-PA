import * as React from "react";
import { TFile } from "obsidian";
import { Button } from "../../../ui/components/Button";
import { Card } from "../../../ui/components/Card";
import { SRSCard } from "../../../services/srs-query-service";

interface ContextLearnWidgetProps {
    cards: SRSCard[];
    onReview: (file: TFile) => void;
}

export const ContextLearnWidget: React.FC<ContextLearnWidgetProps> = ({ cards, onReview }) => {
    if (!cards || cards.length === 0) return null;

    return (
        <Card variant="subtle" style={{ marginTop: "16px", borderLeft: "4px solid var(--interactive-accent)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <div style={{ fontWeight: 600, fontSize: "0.9em", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>🧠</span>
                    <span>推荐复习 (Context Review)</span>
                </div>
                <div style={{ fontSize: "0.8em", color: "var(--text-muted)", background: "var(--background-modifier-form-field)", padding: "2px 6px", borderRadius: "10px" }}>
                    {cards.length} Due
                </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {cards.slice(0, 3).map((card, idx) => (
                    <div
                        key={idx}
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            background: "var(--background-primary)",
                            padding: "8px",
                            borderRadius: "6px",
                            border: "1px solid var(--background-modifier-border)"
                        }}
                    >
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.85em", flex: 1, marginRight: "8px" }}>
                            {card.title}
                        </div>
                        <Button
                            variant="small"
                            onClick={() => onReview(card.file)}
                            style={{ padding: "2px 8px", fontSize: "0.8em" }}
                        >
                            Review
                        </Button>
                    </div>
                ))}
                {cards.length > 3 && (
                    <div style={{ textAlign: "center", fontSize: "0.8em", color: "var(--text-faint)" }}>
                        + {cards.length - 3} more...
                    </div>
                )}
            </div>
        </Card>
    );
};
