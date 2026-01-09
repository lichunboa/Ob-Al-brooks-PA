import * as React from "react";
import type { TradeRecord } from "../../../core/contracts";
import { TradeList } from "../TradeList";
import { EmptyState } from "../../../ui/components/EmptyState";

/**
 * TodayTradesSection Props接口
 */
export interface TodayTradesSectionProps {
    todayTrades: TradeRecord[];
    openFile: (path: string) => void;
}

/**
 * 今日交易列表组件
 * 显示今日交易记录
 */
export const TodayTradesSection: React.FC<TodayTradesSectionProps> = ({
    todayTrades,
    openFile,
}) => {
    return (
        <div style={{ marginTop: "16px" }}>
            <h3 style={{ marginBottom: "12px" }}>今日交易</h3>
            {todayTrades.length > 0 ? (
                <TradeList trades={todayTrades} onOpenFile={openFile} />
            ) : (
                <EmptyState message="今日暂无交易记录" />
            )}
        </div>
    );
};
