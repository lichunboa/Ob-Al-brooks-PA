import * as React from "react";
import type { StrategyCard } from "../../../core/strategy-index";
import { InteractiveButton } from "../../../ui/components/InteractiveButton";

/**
 * MarketCyclePanel Props接口
 */
export interface MarketCyclePanelProps {
    todayMarketCycle?: string;
    todayStrategyPicks: StrategyCard[];
    canOpenTodayNote: boolean;
    onOpenTodayNote: () => void;
    openFile: (path: string) => void;

    // 样式
    buttonStyle: React.CSSProperties;
    disabledButtonStyle: React.CSSProperties;
    textButtonStyle: React.CSSProperties;
}

/**
 * 市场周期面板组件
 * 显示市场周期、策略推荐和今日日记按钮
 */
export const MarketCyclePanel: React.FC<MarketCyclePanelProps> = ({
    todayMarketCycle,
    todayStrategyPicks,
    canOpenTodayNote,
    onOpenTodayNote,
    openFile,
    buttonStyle,
    disabledButtonStyle,
    textButtonStyle,
}) => {
    return (
        <>
            {!todayMarketCycle && (
                <div style={{ marginBottom: "12px" }}>
                    <div
                        style={{
                            color: "var(--text-muted)",
                            fontSize: "0.9em",
                            marginBottom: "10px",
                        }}
                    >
                        创建今日日记,并设置市场周期以获取策略推荐(旧版同位置)。
                    </div>
                    <InteractiveButton
                        disabled={!canOpenTodayNote}
                        onClick={onOpenTodayNote}
                        style={canOpenTodayNote ? buttonStyle : disabledButtonStyle}
                    >
                        打开/创建今日日记(设置市场周期)
                    </InteractiveButton>
                </div>
            )}

            <div
                style={{
                    color: "var(--text-muted)",
                    fontSize: "0.9em",
                    marginBottom: "10px",
                }}
            >
                市场周期:{todayMarketCycle ?? "—"}
            </div>

            {todayStrategyPicks.length > 0 && (
                <div style={{ marginBottom: "12px" }}>
                    <div style={{ fontWeight: 600, marginBottom: "8px" }}>
                        周期 → 策略推荐
                    </div>
                    <ul style={{ margin: 0, paddingLeft: "18px" }}>
                        {todayStrategyPicks.map((s) => (
                            <li
                                key={`today-pick-${s.path}`}
                                style={{ marginBottom: "6px" }}
                            >
                                <InteractiveButton
                                    interaction="text"
                                    onClick={() => openFile(s.path)}
                                    style={textButtonStyle}
                                >
                                    {s.canonicalName}
                                </InteractiveButton>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </>
    );
};
