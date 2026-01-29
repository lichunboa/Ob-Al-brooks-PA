import * as React from "react";
import {
    cardStyle,
    cardTightStyle,
    cardSubtleStyle,
    cardSubtleTightStyle
} from "../styles/dashboardPrimitives";

export type CardVariant = "default" | "tight" | "subtle" | "subtle-tight";

interface CardProps {
    children: React.ReactNode;
    variant?: CardVariant;
    style?: React.CSSProperties;
    className?: string;
    onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

/**
 * Card Component
 * Encapsulates the standard card styles from standardPrimitives.
 * Supports variants: default, tight, subtle, subtle-tight.
 */
export function Card({
    children,
    variant = "default",
    style,
    className,
    onClick
}: CardProps) {
    let baseStyle = cardStyle;

    switch (variant) {
        case "tight":
            baseStyle = cardTightStyle;
            break;
        case "subtle":
            baseStyle = cardSubtleStyle;
            break;
        case "subtle-tight":
            baseStyle = cardSubtleTightStyle;
            break;
    }

    return (
        <div
            style={{ ...baseStyle, ...style }}
            className={className}
            onClick={onClick}
        >
            {children}
        </div>
    );
}
