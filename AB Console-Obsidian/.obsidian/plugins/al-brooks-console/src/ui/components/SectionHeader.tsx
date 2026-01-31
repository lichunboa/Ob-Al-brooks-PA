import * as React from "react";

interface SectionHeaderProps {
    title: string;
    subtitle?: string;
    icon?: string;
    style?: React.CSSProperties;
}

/**
 * SectionHeader通用UI组件
 * 用于Tab页面的标题区域,统一样式
 */
export function SectionHeader({
    title,
    subtitle,
    icon,
    style
}: SectionHeaderProps) {
    const displayTitle = icon ? `${icon} ${title}` : title;

    return (
        <div
            style={{
                margin: "12px 0 10px",
                paddingBottom: "8px",
                borderBottom: "1px solid var(--background-modifier-border)",
                display: "flex",
                alignItems: "baseline",
                gap: "10px",
                flexWrap: "wrap",
                ...style,
            }}
        >
            <div style={{ fontWeight: 700 }}>{displayTitle}</div>
            {subtitle && (
                <div style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>
                    {subtitle}
                </div>
            )}
        </div>
    );
}
