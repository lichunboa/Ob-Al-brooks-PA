import * as React from "react";
import { Card } from "../../../ui/components/Card";
import { V5_COLORS } from "../../../ui/tokens";
import type { ReviewSuggestionResult } from "../../../core/hub-analytics";

/**
 * ReviewSuggestionPanel Props
 * 历史回顾建议面板 - 显示基于历史数据的分析建议
 */
export interface ReviewSuggestionPanelProps {
    suggestions: ReviewSuggestionResult[];
    SPACE: any;
}

/**
 * ReviewSuggestionPanel - 历史回顾建议面板
 * 与交易中心的即时建议不同，这里显示基于历史数据的回顾性分析
 */
export const ReviewSuggestionPanel: React.FC<ReviewSuggestionPanelProps> = ({
    suggestions,
    SPACE,
}) => {
    if (suggestions.length === 0) return null;

    // 根据类型获取样式
    const getTypeStyle = (type: ReviewSuggestionResult['type']) => {
        switch (type) {
            case 'success':
                return {
                    bg: 'rgba(16, 185, 129, 0.08)',
                    border: `1px solid ${V5_COLORS.win}30`,
                    iconColor: V5_COLORS.win,
                };
            case 'warning':
                return {
                    bg: 'rgba(239, 68, 68, 0.08)',
                    border: `1px solid ${V5_COLORS.loss}30`,
                    iconColor: V5_COLORS.loss,
                };
            case 'improvement':
            default:
                return {
                    bg: 'rgba(59, 130, 246, 0.08)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    iconColor: '#3B82F6',
                };
        }
    };

    return (
        <Card variant="tight">
            <div style={{ fontWeight: 700, opacity: 0.75, marginBottom: SPACE.sm }}>
                💡 历史分析建议 <span style={{ fontWeight: 400, fontSize: '0.85em', opacity: 0.7 }}>(基于筛选范围内的交易)</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.sm }}>
                {suggestions.map((suggestion, idx) => {
                    const style = getTypeStyle(suggestion.type);
                    return (
                        <div
                            key={`review-suggestion-${idx}`}
                            style={{
                                background: style.bg,
                                border: style.border,
                                borderRadius: '8px',
                                padding: '10px 14px',
                            }}
                        >
                            <div style={{
                                fontWeight: 700,
                                fontSize: '0.95em',
                                color: style.iconColor,
                                marginBottom: '6px',
                            }}>
                                {suggestion.title}
                            </div>
                            <ul style={{
                                margin: 0,
                                paddingLeft: '18px',
                                fontSize: '0.85em',
                                color: 'var(--text-muted)',
                            }}>
                                {suggestion.details.map((detail, i) => (
                                    <li key={`detail-${i}`} style={{ marginBottom: '3px' }}>
                                        {detail}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    );
                })}
            </div>
        </Card>
    );
};
