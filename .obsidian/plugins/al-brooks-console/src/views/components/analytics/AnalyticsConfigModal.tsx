import * as React from "react";
import { GlassPanel } from "../../../ui/components/GlassPanel";
import { SectionHeader } from "../../../ui/components/SectionHeader";

interface AnalyticsConfigModalProps {
    visibleWidgets: Record<string, boolean>;
    onToggle: (widgetId: string) => void;
    onClose: () => void;
    style?: React.CSSProperties;
}

export const AnalyticsConfigModal: React.FC<AnalyticsConfigModalProps> = ({
    visibleWidgets,
    onToggle,
    onClose,
    style,
}) => {
    return (
        <div style={{
            position: "absolute",
            top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(4px)",
            zIndex: 100,
            display: "flex",
            justifyContent: "center",
            paddingTop: "100px",
            ...style
        }}>
            <GlassPanel style={{ width: "400px", height: "fit-content", padding: "20px" }}>
                <SectionHeader title="Dashboard Configuration" icon="⚙️" />

                <div style={{ display: "flex", flexDirection: "column", gap: "12px", margin: "20px 0" }}>
                    {Object.keys(visibleWidgets).map(key => (
                        <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ textTransform: "capitalize" }}>{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                            <div
                                onClick={() => onToggle(key)}
                                style={{
                                    width: "48px",
                                    height: "26px",
                                    borderRadius: "14px",
                                    background: visibleWidgets[key] ? "var(--interactive-accent)" : "rgba(var(--mono-rgb-100), 0.2)",
                                    position: "relative",
                                    cursor: "pointer",
                                    transition: "background 0.2s"
                                }}
                            >
                                <div style={{
                                    width: "20px",
                                    height: "20px",
                                    borderRadius: "50%",
                                    background: "#fff",
                                    position: "absolute",
                                    top: "3px",
                                    left: visibleWidgets[key] ? "25px" : "3px",
                                    transition: "left 0.2s"
                                }} />
                            </div>
                        </div>
                    ))}
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                        className="pa-btn pa-btn--primary"
                        onClick={onClose}
                    >
                        Done
                    </button>
                </div>
            </GlassPanel>
        </div>
    );
};
