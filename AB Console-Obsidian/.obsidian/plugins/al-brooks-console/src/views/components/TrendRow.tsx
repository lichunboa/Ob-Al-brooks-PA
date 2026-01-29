import * as React from "react";

interface Props {
    label: string;
    value: number;
    ratio: number;
    color: string;
}

export const TrendRow: React.FC<Props> = ({ label, value, ratio, color }) => {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: "0.85em",
                marginBottom: "4px",
            }}
        >
            <div style={{ color: "var(--text-muted)" }}>{label}</div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ color }}>{value.toFixed(1)}R</div>
                <div
                    style={{
                        width: "60px",
                        height: "4px",
                        background: "var(--background-modifier-border)",
                        borderRadius: "2px",
                        overflow: "hidden",
                    }}
                >
                    <div
                        style={{
                            width: `${Math.min(100, ratio * 100)}%`,
                            height: "100%",
                            background: color,
                            transition: "width 0.3s ease",
                        }}
                    />
                </div>
            </div>
        </div>
    );
};
