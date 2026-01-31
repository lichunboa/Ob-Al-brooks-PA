import * as React from "react";

interface EmptyStateProps {
    message: string;
    style?: React.CSSProperties;
}

/**
 * EmptyState通用UI组件
 * 用于显示空状态提示,统一样式
 */
export function EmptyState({ message, style }: EmptyStateProps) {
    return (
        <div
            style={{
                color: "var(--text-faint)",
                fontSize: "0.9em",
                textAlign: "center",
                padding: "12px",
                ...style,
            }}
        >
            {message}
        </div>
    );
}
