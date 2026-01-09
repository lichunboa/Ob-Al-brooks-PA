import * as React from "react";
import type { TradeRecord } from "../../../core/contracts";
import { GlassPanel } from "../../../ui/components/GlassPanel";

/**
 * ReviewHintsPanel Props接口
 */
export interface ReviewHintsPanelProps {
    latestTrade: TradeRecord | null;
    reviewHints: Array<{ id: string; zh: string; en: string }>;
}

/**
 * 复盘提示面板组件
 * 显示最新交易的复盘提示(可折叠)
 */
export const ReviewHintsPanel: React.FC<ReviewHintsPanelProps> = ({
    latestTrade,
    reviewHints,
}) => {
    if (!latestTrade || reviewHints.length === 0) {
        return null;
    }

    return (
        <details style={{ marginBottom: "16px" }}>
            <summary
                style={{
                    cursor: "pointer",
                    color: "var(--text-muted)",
                    fontSize: "0.95em",
                    userSelect: "none",
                    marginBottom: "8px",
                }}
            >
                扩展(不参与旧版对照):复盘提示
            </summary>
            <GlassPanel>
                <div style={{ fontWeight: 600, marginBottom: "8px" }}>
                    复盘提示
                    <span
                        style={{
                            fontWeight: 400,
                            marginLeft: "8px",
                            color: "var(--text-muted)",
                            fontSize: "0.85em",
                        }}
                    >
                        {latestTrade.name}
                    </span>
                </div>
                <ul style={{ margin: 0, paddingLeft: "18px" }}>
                    {reviewHints.slice(0, 4).map((h) => (
                        <li key={h.id} style={{ marginBottom: "6px" }}>
                            <div>{h.zh}</div>
                            <div
                                style={{
                                    color: "var(--text-muted)",
                                    fontSize: "0.85em",
                                }}
                            >
                                {h.en}
                            </div>
                        </li>
                    ))}
                </ul>
            </GlassPanel>
        </details>
    );
};
