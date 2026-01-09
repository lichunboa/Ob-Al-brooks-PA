import * as React from "react";
import { glassPanelStyle } from "../styles/glass";

interface GlassPanelProps {
    children: React.ReactNode;
    style?: React.CSSProperties;
    className?: string;
}

/**
 * GlassPanel通用UI组件
 * 封装玻璃态样式,提供统一的面板容器
 */
export function GlassPanel({ children, style, className }: GlassPanelProps) {
    return (
        <div
            style={{ ...glassPanelStyle, ...style }}
            className={className}
        >
            {children}
        </div>
    );
}
