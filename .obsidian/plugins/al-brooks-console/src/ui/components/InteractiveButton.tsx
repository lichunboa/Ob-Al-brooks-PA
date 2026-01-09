
import * as React from "react";
import { Button } from "./Button";

export type InteractionVariant = "text" | "mini-cell" | "cover" | "lift";

interface InteractiveButtonProps extends React.ComponentProps<typeof Button> {
    interaction?: InteractionVariant;
}

export const InteractiveButton: React.FC<InteractiveButtonProps> = ({
    interaction,
    style,
    onMouseEnter,
    onMouseLeave,
    onFocus,
    onBlur,
    children,
    ...props
}) => {
    const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
        if (props.disabled) return;

        if (interaction === "text") {
            e.currentTarget.style.background = "var(--background-modifier-hover)";
        } else if (interaction === "mini-cell") {
            e.currentTarget.style.borderColor = "var(--interactive-accent)";
        } else if (interaction === "cover") {
            e.currentTarget.style.borderColor = "var(--interactive-accent)";
            e.currentTarget.style.background = "rgba(var(--mono-rgb-100), 0.06)";
        } else if (interaction === "lift") {
            e.currentTarget.style.transform = "translateY(-1px)";
            e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)";
        }

        onMouseEnter?.(e);
    };

    const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
        if (interaction === "text") {
            e.currentTarget.style.background = "transparent";
        } else if (interaction === "mini-cell") {
            e.currentTarget.style.borderColor = "var(--background-modifier-border)";
        } else if (interaction === "cover") {
            e.currentTarget.style.borderColor = "var(--background-modifier-border)";
            e.currentTarget.style.background = "rgba(var(--mono-rgb-100), 0.03)";
        } else if (interaction === "lift") {
            e.currentTarget.style.transform = "none";
            e.currentTarget.style.boxShadow = "none";
        }

        onMouseLeave?.(e);
    };

    const handleFocus = (e: React.FocusEvent<HTMLButtonElement>) => {
        if (props.disabled) return;

        // All variants share the same focus style in the original code
        e.currentTarget.style.boxShadow = "0 0 0 2px var(--interactive-accent)";

        onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLButtonElement>) => {
        e.currentTarget.style.boxShadow = "none";
        onBlur?.(e);
    };

    return (
        <Button
            {...props}
            style={style}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onFocus={handleFocus}
            onBlur={handleBlur}
        >
            {children}
        </Button>
    );
};
