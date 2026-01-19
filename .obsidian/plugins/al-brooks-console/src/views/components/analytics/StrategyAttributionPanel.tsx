import * as React from "react";
import type { TradeRecord } from "../../../core/contracts";
import { V5_COLORS } from "../../../ui/tokens";
import { InteractiveButton } from "../../../ui/components/InteractiveButton";
import { Card } from "../../../ui/components/Card";
import { formatCurrency } from "../../../utils/format-utils";
import { DayDetailPanel } from "./DayDetailPanel";

/**
 * StrategyAttributionPanel Props
 * 简化版策略归因面板，用于替代 JournalGallery（移除日历后）
 */
export interface StrategyAttributionPanelProps {
    trades: TradeRecord[];
    selectedDate: string | null;
    onSelectDate: (dateIso: string | null) => void;
    strategyAttribution: any[];
    openFile: (path: string) => void;
    textButtonStyle: React.CSSProperties;
    SPACE: any;
    currencyMode?: 'USD' | 'CNY';
}

/**
 * StrategyAttributionPanel - 策略归因面板
 * - 未选日期时：显示策略归因列表
 * - 选中日期时：显示当日交易详情
 */
export const StrategyAttributionPanel: React.FC<StrategyAttributionPanelProps> = ({
    trades,
    selectedDate,
    onSelectDate,
    strategyAttribution,
    openFile,
    textButtonStyle,
    SPACE,
    currencyMode = 'USD',
}) => {
    // 获取选中日期的交易
    const selectedDayTrades = React.useMemo(() => {
        if (!selectedDate) return [];
        return trades.filter(t => t.dateIso === selectedDate);
    }, [trades, selectedDate]);

    return (
        <Card variant="tight">
            <div
                style={{
                    fontWeight: 700,
                    opacity: 0.75,
                    marginBottom: SPACE.sm,
                }}
            >
                {selectedDate ? (
                    <>📅 {selectedDate} 交易详情</>
                ) : (
                    <>🎯 策略归因（Top）</>
                )}
            </div>

            {selectedDate ? (
                /* 显示选中日期的交易详情 */
                <DayDetailPanel
                    date={selectedDate}
                    trades={selectedDayTrades}
                    onClose={() => onSelectDate(null)}
                    onOpenFile={openFile}
                    style={{ background: 'transparent' }}
                />
            ) : (
                /* 显示策略归因列表 */
                <>
                    {strategyAttribution.length > 0 ? (
                        <ul style={{ margin: 0, paddingLeft: "18px" }}>
                            {strategyAttribution.map((r) => (
                                <li
                                    key={`attr-${r.strategyName}`}
                                    style={{ marginBottom: "6px" }}
                                >
                                    {r.strategyPath ? (
                                        <InteractiveButton
                                            interaction="text"
                                            onClick={() => openFile(r.strategyPath!)}
                                            style={textButtonStyle}
                                        >
                                            {r.strategyName}
                                        </InteractiveButton>
                                    ) : (
                                        <span>{r.strategyName}</span>
                                    )}
                                    <span
                                        style={{
                                            color: "var(--text-muted)",
                                            marginLeft: "8px",
                                            fontSize: "0.9em",
                                        }}
                                    >
                                        {r.count} 笔 •{" "}
                                        <span
                                            style={{
                                                color:
                                                    r.netMoney >= 0
                                                        ? V5_COLORS.win
                                                        : V5_COLORS.loss,
                                                fontWeight: 600,
                                            }}
                                        >
                                            {r.netMoney >= 0 ? "+" : ""}
                                            {formatCurrency(r.netMoney ?? 0, currencyMode)}
                                        </span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div
                            style={{
                                color: "var(--text-faint)",
                                fontSize: "0.9em",
                            }}
                        >
                            未找到策略归因数据。
                        </div>
                    )}
                </>
            )}
        </Card>
    );
};
