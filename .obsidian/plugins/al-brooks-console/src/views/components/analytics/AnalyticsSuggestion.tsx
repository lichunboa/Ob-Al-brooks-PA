import * as React from "react";
import { V5_COLORS, withHexAlpha } from "../../../ui/tokens";

/**
 * AnalyticsSuggestion Props接口
 */
export interface AnalyticsSuggestionProps {
    // 数据Props
    analyticsSuggestion: {
        text: string;
        tone: "success" | "warn" | "danger" | "ok";
    };

    // 样式Props
    cardTightStyle: React.CSSProperties;

    // 常量Props
    SPACE: any;
}

/**
 * 系统建议组件
 * 显示基于数据分析的系统建议
 */
export const AnalyticsSuggestion: React.FC<AnalyticsSuggestionProps> = ({
    analyticsSuggestion,
    cardTightStyle,
    SPACE,
}) => {
    return (
        <div
            style={{
                ...cardTightStyle,
            }}
        >
            <div
                style={{
                    fontWeight: 700,
                    opacity: 0.75,
                    marginBottom: SPACE.sm,
                }}
            >
                💡 系统建议{" "}
                <span
                    style={{
                        fontWeight: 600,
                        opacity: 0.6,
                        fontSize: "0.85em",
                    }}
                >
                    (Actions)
                </span>
            </div>
            <div
                style={{
                    fontSize: "0.95em",
                    lineHeight: 1.6,
                    padding: "10px 12px",
                    borderRadius: "10px",
                    background:
                        analyticsSuggestion.tone === "danger"
                            ? withHexAlpha(V5_COLORS.loss, "1F")
                            : analyticsSuggestion.tone === "warn"
                                ? withHexAlpha(V5_COLORS.back, "1F")
                                : withHexAlpha(V5_COLORS.win, "1A"),
                    border: "1px solid var(--background-modifier-border)",
                    color:
                        analyticsSuggestion.tone === "danger"
                            ? V5_COLORS.loss
                            : analyticsSuggestion.tone === "warn"
                                ? V5_COLORS.back
                                : V5_COLORS.win,
                    fontWeight: 700,
                }}
            >
                {analyticsSuggestion.text}
            </div>
        </div>
    );
};
