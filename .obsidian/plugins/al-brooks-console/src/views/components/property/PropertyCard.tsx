/**
 * PropertyCard 组件
 * 显示单个属性的卡片
 */

import * as React from "react";
import { GlassPanel } from "../../../ui/components/GlassPanel";
import type { PropertyStats } from "../../../core/property-manager";

interface PropertyCardProps {
    property: PropertyStats;
    onClick: () => void;
}

export const PropertyCard: React.FC<PropertyCardProps> = ({ property, onClick }) => {
    return (
        <div
            onClick={onClick}
            className="property-card"
            style={{
                cursor: "pointer",
                transition: "all 0.2s ease",
                padding: "12px",
                background: "rgba(30, 41, 59, 0.4)",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.05)"
            }}
        >
            <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "8px"
            }}>
                <span style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: 700,
                    fontSize: "0.95em",
                    color: "var(--text-normal)"
                }}>
                    {property.key}
                </span>
            </div>

            <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "0.85em",
                color: "var(--text-muted)"
            }}>
                <span style={{
                    background: "rgba(56, 189, 248, 0.15)",
                    color: "var(--interactive-accent)",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    fontWeight: 600
                }}>
                    {property.valueCount} 个值
                </span>
                <span style={{
                    opacity: 0.7,
                    display: "flex",
                    alignItems: "center",
                    gap: "4px"
                }}>
                    管理 →
                </span>
            </div>
        </div>
    );
};
