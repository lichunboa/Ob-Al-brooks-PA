import * as React from "react";
import { GlassPanel } from "../../../ui/components/GlassPanel";
import { SectionHeader } from "../../../ui/components/SectionHeader";
import { Button } from "../../../ui/components/Button";
import { Toggle } from "../../../ui/components/Toggle";


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
                            <span style={{ textTransform: "capitalize" }}>{String(key).replace(/([A-Z])/g, ' $1').trim()}</span>
                            <Toggle
                                checked={visibleWidgets[key]}
                                onChange={() => onToggle(key)}
                            />
                        </div>
                    ))}
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <Button
                        variant="default"
                        onClick={onClose}
                    >
                        Done
                    </Button>
                </div>
            </GlassPanel>
        </div>
    );
};
