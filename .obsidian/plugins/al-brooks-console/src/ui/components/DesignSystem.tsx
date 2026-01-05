import * as React from "react";
import { CSSProperties, ReactNode } from "react";
import { COLORS, EFFECTS, SPACE, TYPO } from "../styles/theme";

// =============================================================================
// 🧱 ATOMIC COMPONENTS (Primitives)
// =============================================================================

// --- 1. Layout / Containers ---

interface GlassProps {
    children: ReactNode;
    style?: CSSProperties;
    className?: string;
    onClick?: () => void;
    hoverEffect?: boolean;
}

/**
 * L1: The main container card. Floating, high blur.
 */
export const GlassCard: React.FC<GlassProps> = ({ children, style, onClick, hoverEffect = false }) => {
    const [isHovered, setIsHovered] = React.useState(false);

    const baseStyle: CSSProperties = {
        background: COLORS.glass.card,
        backdropFilter: EFFECTS.blur.card,
        WebkitBackdropFilter: EFFECTS.blur.card,
        borderRadius: "16px",
        border: COLORS.border.subtle,
        boxShadow: isHovered && hoverEffect ? EFFECTS.shadow.float : EFFECTS.shadow.card,
        padding: SPACE.lg,
        transition: EFFECTS.transition,
        transform: isHovered && hoverEffect ? "translateY(-2px)" : "none",
        overflow: "hidden", // Clip content
        cursor: onClick ? "pointer" : "default",
        ...style,
    };

    return (
        <div
            style={baseStyle}
            onClick={onClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {children}
        </div>
    );
};

/**
 * L2: Inner grouping panel. Less blur, differentiates sections.
 */
export const GlassPanel: React.FC<GlassProps> = ({ children, style, onClick }) => (
    <div
        style={{
            background: COLORS.glass.panel,
            borderRadius: "12px",
            border: COLORS.border.subtle,
            padding: SPACE.md,
            cursor: onClick ? "pointer" : "default",
            ...style,
        }}
        onClick={onClick}
    >
        {children}
    </div>
);

/**
 * L3: Sunken inset for data/input.
 */
export const GlassInset: React.FC<GlassProps> = ({ children, style }) => (
    <div
        style={{
            background: COLORS.glass.inset,
            borderRadius: "8px",
            boxShadow: "inset 0 1px 2px rgba(0,0,0,0.1)", // Inset shadow
            padding: SPACE.sm,
            border: "1px solid rgba(255,255,255,0.03)",
            ...style,
        }}
    >
        {children}
    </div>
);


// --- 2. Typography Components ---

interface TextProps {
    children: ReactNode;
    style?: CSSProperties;
    color?: string;
    align?: "left" | "center" | "right";
    money?: boolean; // If true, enforces tabular nums
}

export const DisplayXL: React.FC<TextProps> = ({ children, style, color, align, money }) => (
    <div style={{
        ...TYPO.displayXL,
        color: color ?? COLORS.text.normal,
        textAlign: align,
        ...(money ? TYPO.numeric : {}),
        ...style
    }}>
        {children}
    </div>
);

export const HeadingL: React.FC<TextProps> = ({ children, style, color, align }) => (
    <div style={{
        ...TYPO.displayL,
        color: color ?? COLORS.text.normal,
        textAlign: align,
        ...style
    }}>
        {children}
    </div>
);

export const HeadingM: React.FC<TextProps> = ({ children, style, color, align }) => (
    <div style={{
        ...TYPO.headingM,
        color: color ?? COLORS.text.normal,
        textAlign: align,
        ...style
    }}>
        {children}
    </div>
);

export const Label: React.FC<TextProps> = ({ children, style, color, align }) => (
    <div style={{
        ...TYPO.bodyS,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        color: color ?? COLORS.text.muted,
        textAlign: align,
        ...style
    }}>
        {children}
    </div>
);

export const Body: React.FC<TextProps> = ({ children, style, color, align }) => (
    <div style={{
        ...TYPO.bodyM,
        color: color ?? COLORS.text.normal,
        textAlign: align,
        ...style
    }}>
        {children}
    </div>
);


// --- 3. Interaction / Buttons ---

interface ButtonProps {
    children: ReactNode;
    onClick?: () => void;
    style?: CSSProperties;
    disabled?: boolean;
    block?: boolean; // Full width
    icon?: string;   // Optional leading icon char
}

/**
 * Primary Call-to-Action. Gradient + Glow.
 */
export const ButtonPrimary: React.FC<ButtonProps> = ({ children, onClick, style, disabled, block, icon }) => {
    const [hover, setHover] = React.useState(false);

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
                ...TYPO.bodyS,
                fontWeight: 600,
                background: disabled
                    ? "var(--background-modifier-form-field)"
                    : `linear-gradient(135deg, ${COLORS.accent} 0%, ${COLORS.demo} 100%)`,
                color: disabled ? COLORS.text.muted : COLORS.text.onAccent,
                border: "none",
                borderRadius: "8px",
                padding: "8px 16px",
                boxShadow: hover && !disabled ? EFFECTS.shadow.glow : "none",
                cursor: disabled ? "not-allowed" : "pointer",
                width: block ? "100%" : "auto",
                transition: EFFECTS.transition,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: SPACE.sm,
                opacity: disabled ? 0.6 : 1,
                transform: hover && !disabled ? "translateY(-1px)" : "none",
                ...style,
            }}
        >
            {icon && <span>{icon}</span>}
            {children}
        </button>
    );
};

/**
 * Ghost / Secondary Action.
 */
export const ButtonGhost: React.FC<ButtonProps> = ({ children, onClick, style, disabled, block, icon }) => {
    const [hover, setHover] = React.useState(false);

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
                ...TYPO.bodyS,
                background: hover && !disabled ? COLORS.glass.panel : "transparent",
                color: disabled ? COLORS.text.faint : COLORS.text.normal,
                border: COLORS.border.subtle,
                borderRadius: "8px",
                padding: "7px 15px", // 1px smaller to account for border
                cursor: disabled ? "not-allowed" : "pointer",
                width: block ? "100%" : "auto",
                transition: EFFECTS.transition,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: SPACE.sm,
                ...style,
            }}
        >
            {icon && <span>{icon}</span>}
            {children}
        </button>
    );
};


// --- 4. Data / Status ---

interface BadgeProps {
    label: string;
    color?: string; // Hex color
    tone?: "neutral" | "success" | "loss" | "warn";
    style?: CSSProperties;
}

export const StatusBadge: React.FC<BadgeProps> = ({ label, color, tone = "neutral", style }) => {
    let baseColor = color || COLORS.text.muted;
    if (tone === "success") baseColor = COLORS.win;
    if (tone === "loss") baseColor = COLORS.loss;
    if (tone === "warn") baseColor = COLORS.backtest;

    return (
        <span style={{
            ...TYPO.caption,
            fontWeight: 600,
            background: `rgba(${hexToRgb(baseColor)}, 0.1)`,
            border: `1px solid rgba(${hexToRgb(baseColor)}, 0.2)`,
            color: baseColor,
            padding: "2px 8px",
            borderRadius: "999px",
            display: "inline-block",
            ...style,
        }}>
            {label}
        </span>
    );
};

// Helper: Hex to RGB 
function hexToRgb(hex: string): string {
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
        ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
        : "100, 100, 100";
}
