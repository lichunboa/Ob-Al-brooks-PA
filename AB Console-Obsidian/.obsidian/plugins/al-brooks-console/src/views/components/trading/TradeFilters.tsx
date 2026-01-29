import * as React from "react";
import { V5_COLORS } from "../../../ui/tokens";

/**
 * 时间范围类型
 */
export type TimeRange = "today" | "week" | "month" | "all";

/**
 * 账户类型
 */
export type AccountType = "all" | "Live" | "Demo" | "Backtest";

/**
 * 时间范围标签映射
 */
export const TIME_RANGE_LABELS: Record<TimeRange, string> = {
    today: "今日",
    week: "本周",
    month: "本月",
    all: "全部",
};

/**
 * 账户类型标签映射
 */
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
    all: "全部",
    Live: "实盘",
    Demo: "模拟",
    Backtest: "回测",
};

/**
 * 交易过滤器Props
 */
export interface TradeFiltersProps {
    timeRange: TimeRange;
    onTimeRangeChange: (range: TimeRange) => void;
    accountType: AccountType;
    onAccountTypeChange: (type: AccountType) => void;
}

/**
 * 按钮组样式
 */
const buttonGroupStyle: React.CSSProperties = {
    display: "flex",
    gap: "2px",
    background: "var(--background-primary)",
    borderRadius: "6px",
    padding: "2px",
    border: "1px solid var(--background-modifier-border)",
};

/**
 * 获取按钮样式
 */
const getButtonStyle = (isActive: boolean): React.CSSProperties => ({
    padding: "4px 8px",
    fontSize: "0.75em",
    fontWeight: isActive ? 600 : 400,
    background: isActive ? "#60A5FA" : "transparent",
    color: isActive ? "white" : "var(--text-muted)",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    transition: "all 0.15s ease",
});

/**
 * 交易过滤器组件
 * 可用于整个交易中心，包含时间范围和账户类型选择
 */
export const TradeFilters: React.FC<TradeFiltersProps> = ({
    timeRange,
    onTimeRangeChange,
    accountType,
    onAccountTypeChange,
}) => {
    const ranges: TimeRange[] = ["today", "week", "month", "all"];
    const accountTypes: AccountType[] = ["all", "Live", "Demo", "Backtest"];

    return (
        <div style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
        }}>
            {/* 时间范围选择器 */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "0.8em", color: "var(--text-muted)" }}>📅</span>
                <div style={buttonGroupStyle}>
                    {ranges.map((r) => (
                        <button
                            key={r}
                            onClick={() => onTimeRangeChange(r)}
                            style={getButtonStyle(timeRange === r)}
                        >
                            {TIME_RANGE_LABELS[r]}
                        </button>
                    ))}
                </div>
            </div>

            {/* 账户类型选择器 */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "0.8em", color: "var(--text-muted)" }}>💼</span>
                <div style={buttonGroupStyle}>
                    {accountTypes.map((t) => (
                        <button
                            key={t}
                            onClick={() => onAccountTypeChange(t)}
                            style={getButtonStyle(accountType === t)}
                        >
                            {ACCOUNT_TYPE_LABELS[t]}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};
