import * as React from "react";
import { COLORS, EFFECTS, TYPO } from "../styles/theme";

interface Option {
    value: string;
    label: string;
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
    value: string;
    onChange: (value: string) => void;
    options: Option[] | string[];
    placeholder?: string;
}

export const Select: React.FC<SelectProps> = ({
    value,
    onChange,
    options,
    placeholder,
    className,
    style,
    disabled,
    ...rest
}) => {
    const [focused, setFocused] = React.useState(false);

    // Normalize options
    const normalizedOptions = React.useMemo(() => {
        return options.map(opt =>
            typeof opt === 'string' ? { value: opt, label: opt } : opt
        );
    }, [options]);

    return (
        <div
            style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                background: COLORS.glass.inset,
                border: focused ? `1px solid ${COLORS.accent}` : "1px solid rgba(255,255,255,0.05)",
                borderRadius: "8px",
                padding: "0 8px",
                boxShadow: "inset 0 1px 2px rgba(0,0,0,0.2)",
                transition: EFFECTS.transition,
                opacity: disabled ? 0.6 : 1,
                cursor: disabled ? "not-allowed" : "pointer",
                ...style
            }}
        >
            <select
                {...rest}
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                style={{
                    appearance: "none", // Hide default arrow
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: COLORS.text.normal,
                    fontFamily: "inherit",
                    fontSize: "0.95em",
                    padding: "8px 0",
                    width: "100%",
                    cursor: "inherit",
                    ...TYPO.bodyS
                }}
            >
                {placeholder && (
                    <option value="" disabled style={{ color: COLORS.text.muted }}>
                        {placeholder}
                    </option>
                )}
                {normalizedOptions.map((opt) => (
                    <option key={opt.value} value={opt.value} style={{ background: "var(--background-primary)" }}>
                        {opt.label}
                    </option>
                ))}
            </select>

            {/* Custom Arrow */}
            <div style={{ pointerEvents: "none", marginLeft: "4px", opacity: 0.5, fontSize: "0.8em" }}>
                ▼
            </div>
        </div>
    );
};
