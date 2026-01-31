import * as React from "react";
import {
    buttonStyle,
    disabledButtonStyle,
    buttonSmStyle,
    buttonSmDisabledStyle,
    tabButtonStyle,
    activeTabButtonStyle,
    textButtonStyle,
} from "../styles/dashboardPrimitives";

interface ButtonProps {
    // 内容
    children: React.ReactNode;

    // 按钮类型
    variant?: "default" | "small" | "tab" | "text";

    // 状态
    disabled?: boolean;
    active?: boolean; // 用于tab按钮

    // 事件
    onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
    onMouseEnter?: (e: React.MouseEvent<HTMLButtonElement>) => void;
    onMouseLeave?: (e: React.MouseEvent<HTMLButtonElement>) => void;
    onFocus?: (e: React.FocusEvent<HTMLButtonElement>) => void;
    onBlur?: (e: React.FocusEvent<HTMLButtonElement>) => void;

    // 样式
    style?: React.CSSProperties;
    className?: string;

    // HTML属性
    type?: "button" | "submit" | "reset";
    title?: string;
}

/**
 * Button通用UI组件
 * 统一管理所有按钮样式,支持多种变体和状态
 */
export function Button({
    children,
    variant = "default",
    disabled = false,
    active = false,
    onClick,
    onMouseEnter,
    onMouseLeave,
    onFocus,
    onBlur,
    style,
    className,
    type = "button",
    title,
}: ButtonProps) {
    // 根据variant和状态选择样式
    let baseStyle: React.CSSProperties;

    if (variant === "tab") {
        baseStyle = active ? activeTabButtonStyle : tabButtonStyle;
    } else if (variant === "text") {
        baseStyle = textButtonStyle;
    } else if (variant === "small") {
        baseStyle = disabled ? buttonSmDisabledStyle : buttonSmStyle;
    } else {
        baseStyle = disabled ? disabledButtonStyle : buttonStyle;
    }

    return (
        <button
            type={type}
            onClick={disabled ? undefined : onClick}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            onFocus={onFocus}
            onBlur={onBlur}
            style={{ ...baseStyle, ...style }}
            className={className}
            disabled={disabled}
            title={title}
        >
            {children}
        </button>
    );
}
