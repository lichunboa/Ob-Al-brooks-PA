import * as React from "react";
import { LightweightChart, type ChartSignal } from "../../views/components/LightweightChart";
import { StrategyMatcher } from "./StrategyMatcher";
import { StrategyIndicatorPanel } from "./StrategyIndicatorPanel";
import { TrendingUp, TrendingDown, Activity, BarChart3, Layers, Clock, AlignEndHorizontal, Wifi, WifiOff } from "lucide-react";
import type { TradingSignal } from "../../hooks/useSignals";
import { useStrategyMarkers } from "../../hooks/useStrategyMarkers";
import type { BackendSettings } from "../../settings";

interface SymbolData {
  id: string;
  ticker: string;
  name: string;
  category: string;
  price: number;
  change: number;
  changePercent: number;
  trend: "bullish" | "bearish" | "neutral";
}

interface SingleChartViewProps {
  backend: BackendSettings;
  symbols: SymbolData[];
  selectedSymbol: string;
  onSelectSymbol: (id: string) => void;
  chartInterval: string;
  onIntervalChange: (interval: string) => void;
  signals?: TradingSignal[];
  realtimePrice?: { price: number; change24h: number } | null;
  isWsConnected?: boolean;
}

const CATEGORY_CONFIG: Record<string, { emoji: string; label: string; color: string }> = {
  crypto: { emoji: "💰", label: "加密货币", color: "#F59E0B" },
  stock: { emoji: "📈", label: "股票", color: "#3B82F6" },
  forex: { emoji: "💱", label: "外汇", color: "#8B5CF6" },
  future: { emoji: "📊", label: "期货", color: "#10B981" },
  metal: { emoji: "🥇", label: "贵金属", color: "#FBBF24" },
};

const INTERVALS = [
  { value: "1m", label: "1分" },
  { value: "5m", label: "5分" },
  { value: "15m", label: "15分" },
  { value: "1h", label: "1时" },
  { value: "4h", label: "4时" },
  { value: "1d", label: "日线" },
];

export const SingleChartView: React.FC<SingleChartViewProps> = ({
  backend,
  symbols,
  selectedSymbol,
  onSelectSymbol,
  chartInterval,
  onIntervalChange,
  signals = [],
  realtimePrice,
  isWsConnected = false,
}) => {
  const currentSymbol = symbols.find((s) => s.id === selectedSymbol) || symbols[0];
  
  // 使用 WebSocket 实时价格或 HTTP 价格
  const displayPrice = realtimePrice?.price ?? currentSymbol?.price ?? 0;
  const displayChangePercent = realtimePrice?.change24h ?? currentSymbol?.changePercent ?? 0;

  // 将 TradingSignal 转换为 ChartSignal
  // 转换后端信号为图表信号
  const chartSignals: ChartSignal[] = React.useMemo(() => {
    return signals
      .filter((s) => {
        const symbolMatch = s.symbol.includes(currentSymbol?.id) || 
          currentSymbol?.id.includes(s.symbol.replace("=X", "").replace("=F", ""));
        return symbolMatch;
      })
      .map((s) => ({
        time: Math.floor(s.timestamp / 1000),
        position: (s.direction === "BUY" ? "belowBar" : "aboveBar") as "belowBar" | "aboveBar",
        color: s.direction === "BUY" ? "#10B981" : "#EF4444",
        shape: (s.direction === "BUY" ? "arrowUp" : "arrowDown") as "arrowUp" | "arrowDown" | "circle",
        text: s.signal_name,
      }))
      .slice(0, 5);
  }, [signals, currentSymbol]);

  // 生成策略标记
  const { markers: strategyMarkers } = useStrategyMarkers({
    symbol: currentSymbol?.id || "",
    trend: currentSymbol?.trend || "neutral",
    price: currentSymbol?.price || 0,
    changePercent: currentSymbol?.changePercent || 0,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "12px" }}>
      {/* 主图表区域 65% */}
      <div style={{ flex: "0 0 65%", minHeight: 0 }}>
        <div style={{
          background: "var(--background-secondary)",
          border: "1px solid var(--background-modifier-border)",
          borderRadius: 12,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}>
          {/* 图表头部 */}
          <div style={{
            padding: "12px 16px",
            background: "var(--background-secondary-alt)",
            borderBottom: "1px solid var(--background-modifier-border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: "20px" }}>
                {currentSymbol ? CATEGORY_CONFIG[currentSymbol.category]?.emoji : "📊"}
              </span>
              <div>
                <div style={{ fontWeight: 700, fontSize: "1.2em" }}>
                  {currentSymbol?.id || "选择品种"}
                </div>
                <div style={{ fontSize: "0.8em", color: "var(--text-muted)" }}>
                  {currentSymbol?.name || "-"}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {/* 价格和涨跌 */}
              {displayPrice > 0 && (
                <div style={{ textAlign: "right", marginRight: 12 }}>
                  <div style={{
                    fontWeight: 700,
                    fontSize: "1.3em",
                    fontFamily: "var(--font-monospace)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}>
                    ${displayPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    {/* WebSocket 状态指示器 */}
                    <span title={isWsConnected ? "WebSocket 实时连接" : "HTTP 轮询模式"}>
                      {isWsConnected ? (
                        <Wifi size={14} color="#10B981" />
                      ) : (
                        <WifiOff size={14} color="var(--text-muted)" />
                      )}
                    </span>
                  </div>
                  <div style={{
                    fontSize: "0.85em",
                    color: displayChangePercent >= 0 ? "#10B981" : "#EF4444",
                  }}>
                    {displayChangePercent >= 0 ? "+" : ""}
                    {displayChangePercent.toFixed(2)}%
                  </div>
                </div>
              )}

              {/* 周期选择器 */}
              <div style={{
                display: "flex",
                gap: 4,
                background: "var(--background-primary)",
                borderRadius: 6,
                padding: 2,
              }}>
                {INTERVALS.map((int) => (
                  <button
                    key={int.value}
                    onClick={() => onIntervalChange(int.value)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 4,
                      border: "none",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontWeight: chartInterval === int.value ? 600 : 400,
                      background: chartInterval === int.value ? "var(--interactive-accent)" : "transparent",
                      color: chartInterval === int.value ? "var(--text-on-accent)" : "var(--text-normal)",
                    }}
                  >
                    {int.label}
                  </button>
                ))}
              </div>

              {/* 对齐到最新 */}
              <button
                onClick={() => {
                  // 强制刷新当前品种数据
                  window.dispatchEvent(new CustomEvent("force-refresh-chart", { 
                    detail: { symbol: currentSymbol?.ticker, interval: chartInterval } 
                  }));
                }}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid var(--background-modifier-border)",
                  background: "var(--background-primary)",
                  color: "var(--text-normal)",
                  cursor: "pointer",
                  fontSize: "12px",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
                title="对齐到最新数据"
              >
                <AlignEndHorizontal size={14} />
                对齐
              </button>
            </div>
          </div>

          {/* 图表主体 */}
          <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
            {currentSymbol?.ticker ? (
              <LightweightChart
                symbol={currentSymbol.ticker}
                interval={chartInterval}
                backend={backend}
                signals={chartSignals}
                strategyMarkers={strategyMarkers}
                showSignals={true}
              />
            ) : (
              <div style={{
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-muted)",
              }}>
                选择品种查看图表
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 下方区域：品种列表 + 策略面板 */}
      <div style={{ flex: "1 1 35%", minHeight: 0, display: "flex", gap: "12px" }}>
        {/* 品种列表侧边栏 */}
        <div style={{
          flex: "0 0 200px",
          background: "var(--background-secondary)",
          border: "1px solid var(--background-modifier-border)",
          borderRadius: 12,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}>
          <div style={{
            padding: "12px",
            borderBottom: "1px solid var(--background-modifier-border)",
            background: "var(--background-secondary-alt)",
          }}>
            <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              <BarChart3 size={14} />
              品种列表
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {symbols.map((sym) => (
              <button
                key={sym.id}
                onClick={() => onSelectSymbol(sym.id)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "none",
                  background: selectedSymbol === sym.id ? "var(--background-modifier-hover)" : "transparent",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  borderLeft: selectedSymbol === sym.id ? "3px solid var(--interactive-accent)" : "3px solid transparent",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  if (selectedSymbol !== sym.id) {
                    e.currentTarget.style.background = "var(--background-modifier-hover)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedSymbol !== sym.id) {
                    e.currentTarget.style.background = "transparent";
                  }
                }}
              >
                <span>{CATEGORY_CONFIG[sym.category]?.emoji}</span>
                <div style={{ flex: 1, textAlign: "left" }}>
                  <div style={{ fontWeight: 600, fontSize: "13px" }}>{sym.id}</div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    {sym.price > 0 ? `$${sym.price.toFixed(2)}` : "-"}
                  </div>
                </div>
                <span style={{
                  fontSize: "11px",
                  color: sym.trend === "bullish" ? "#10B981" : 
                         sym.trend === "bearish" ? "#EF4444" : "var(--text-muted)",
                }}>
                  {sym.trend === "bullish" ? "▲" : sym.trend === "bearish" ? "▼" : "—"}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* 策略面板 */}
        <div style={{
          flex: 1,
          background: "var(--background-secondary)",
          border: "1px solid var(--background-modifier-border)",
          borderRadius: 12,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}>
          <div style={{
            padding: "12px",
            borderBottom: "1px solid var(--background-modifier-border)",
            background: "var(--background-secondary-alt)",
          }}>
            <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              <Layers size={14} />
              策略匹配
            </div>
          </div>
          <div style={{ flex: 1, padding: "12px", overflowY: "auto" }}>
            {currentSymbol && (
              <>
                {/* 当前市场状态 */}
                <div style={{
                  padding: "12px",
                  background: currentSymbol.trend === "bullish" ? "rgba(16, 185, 129, 0.1)" :
                             currentSymbol.trend === "bearish" ? "rgba(239, 68, 68, 0.1)" :
                             "var(--background-primary)",
                  borderRadius: 8,
                  marginBottom: 12,
                  border: `1px solid ${currentSymbol.trend === "bullish" ? "#10B981" :
                                      currentSymbol.trend === "bearish" ? "#EF4444" :
                                      "var(--background-modifier-border)"}`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    {currentSymbol.trend === "bullish" ? (
                      <TrendingUp size={18} color="#10B981" />
                    ) : currentSymbol.trend === "bearish" ? (
                      <TrendingDown size={18} color="#EF4444" />
                    ) : (
                      <Activity size={18} color="var(--text-muted)" />
                    )}
                    <span style={{ fontWeight: 600 }}>
                      当前趋势: {currentSymbol.trend === "bullish" ? "看涨" : 
                                currentSymbol.trend === "bearish" ? "看跌" : "震荡"}
                    </span>
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    涨跌幅: {displayChangePercent >= 0 ? "+" : ""}{displayChangePercent.toFixed(2)}%
                    {isWsConnected && <span style={{ color: "#10B981", marginLeft: 4 }}>● 实时</span>}
                  </div>
                </div>

                {/* 策略匹配组件 */}
                <StrategyMatcher
                  symbol={currentSymbol.id}
                  trend={currentSymbol.trend}
                  price={displayPrice}
                  changePercent={displayChangePercent}
                  signals={signals}
                  backend={backend}
                  timeframe={chartInterval}
                />

                {/* 最新信号 */}
                {signals.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ 
                      fontWeight: 600, 
                      marginBottom: 8,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}>
                      <Clock size={14} />
                      相关信号
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {signals
                        .filter((s) => {
                          const symbolMatch = s.symbol.includes(currentSymbol.id) || 
                            currentSymbol.id.includes(s.symbol.replace("=X", "").replace("=F", ""));
                          return symbolMatch;
                        })
                        .slice(0, 3)
                        .map((signal) => {
                          const timeStr = new Date(signal.timestamp).toLocaleTimeString("zh-CN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          });
                          return (
                            <div
                              key={signal.id}
                              style={{
                                padding: "8px 10px",
                                background: signal.direction === "BUY" ? "rgba(16, 185, 129, 0.1)" :
                                          signal.direction === "SELL" ? "rgba(239, 68, 68, 0.1)" :
                                          "var(--background-primary)",
                                borderRadius: 6,
                                border: `1px solid ${signal.direction === "BUY" ? "#10B98130" :
                                                    signal.direction === "SELL" ? "#EF444430" :
                                                    "var(--background-modifier-border)"}`,
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                              }}
                            >
                              <span style={{
                                color: signal.direction === "BUY" ? "#10B981" :
                                       signal.direction === "SELL" ? "#EF4444" : "#F59E0B",
                              }}>
                                {signal.direction === "BUY" ? "🟢" : 
                                 signal.direction === "SELL" ? "🔴" : "🟡"}
                              </span>
                              <span style={{ fontWeight: 500, fontSize: "12px" }}>
                                {signal.signal_name}
                              </span>
                              <span style={{ 
                                marginLeft: "auto", 
                                fontSize: "11px", 
                                color: "var(--text-muted)" 
                              }}>
                                {timeStr}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
