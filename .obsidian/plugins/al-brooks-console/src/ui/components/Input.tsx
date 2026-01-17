import * as React from "react";
import { CSSProperties } from "react";
import { COLORS, EFFECTS, SPACE, TYPO } from "../styles/theme";

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'prefix'> {
    value: string | number;
    onChange: (value: string) => void;
    label?: string;
    prefix?: React.ReactNode;
    suffix?: React.ReactNode;
}

/**
 * Standardized Input component.
 * Uses a subtle glass style, removing default browser borders.
 */
export const Input: React.FC<InputProps> = ({
    value,
    onChange,
    style,
    disabled,
    prefix,
    suffix,
    type = "text",
    ...rest
}) => {
    const [focused, setFocused] = React.useState(false);

    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                background: COLORS.glass.inset,
                border: focused ? `1px solid ${COLORS.accent}` : "1px solid rgba(255,255,255,0.05)",
                borderRadius: "8px",
                padding: "0 8px", // Container padding
                boxShadow: "inset 0 1px 2px rgba(0,0,0,0.2)",
                transition: EFFECTS.transition,
                opacity: disabled ? 0.6 : 1,
                cursor: disabled ? "not-allowed" : "text",
                ...style
            }}
        >
            {prefix && <span style={{ marginRight: "6px", color: COLORS.text.muted, fontSize: "0.85em" }}>{prefix}</span>}

            <input
                {...rest}
                type={type}
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
                onFocus={(e) => {
                    setFocused(true);
                    rest.onFocus?.(e);
                }}
                onBlur={(e) => {
                    setFocused(false);
                    rest.onBlur?.(e);
                }}
                style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: COLORS.text.normal,
                    fontFamily: "inherit",
                    fontSize: "0.95em", // Standard body size
                    padding: "8px 0", // Vertical padding on input itself
                    width: "100%",
                    minWidth: 0,
                    ...TYPO.bodyS
                }}
            />

            {suffix && <span style={{ marginLeft: "6px", color: COLORS.text.muted, fontSize: "0.85em" }}>{suffix}</span>}
        </div>
    );
};
