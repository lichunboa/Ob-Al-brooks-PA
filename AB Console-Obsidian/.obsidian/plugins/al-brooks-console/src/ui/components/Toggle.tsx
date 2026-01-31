import * as React from "react";
import { COLORS, EFFECTS } from "../styles/theme";

interface ToggleProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label?: string; // Standardize label side? usually right.
    style?: React.CSSProperties;
    disabled?: boolean;
}

export const Toggle: React.FC<ToggleProps> = ({ checked, onChange, label, style, disabled }) => {
    return (
        <div
            style={{ display: "inline-flex", alignItems: "center", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, ...style }}
            onClick={() => !disabled && onChange(!checked)}
        >
            <div
                style={{
                    position: "relative",
                    width: "36px",
                    height: "20px",
                    borderRadius: "999px",
                    background: checked ? COLORS.accent : "rgba(255,255,255,0.1)",
                    border: "1px solid rgba(255,255,255,0.05)",
                    transition: EFFECTS.transition,
                    boxShadow: "inset 0 1px 2px rgba(0,0,0,0.2)"
                }}
            >
                <div
                    style={{
                        position: "absolute",
                        top: "2px",
                        left: "2px",
                        width: "14px",
                        height: "14px",
                        borderRadius: "50%",
                        background: "#fff",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
                        transform: checked ? "translateX(16px)" : "translateX(0)",
                        transition: "transform 0.2s cubic-bezier(0.4, 0.0, 0.2, 1)",
                    }}
                />
            </div>
            {label && (
                <span style={{ marginLeft: "8px", fontSize: "0.9em", color: COLORS.text.normal }}>
                    {label}
                </span>
            )}
        </div>
    );
};
