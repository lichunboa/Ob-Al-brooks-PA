/**
 * 策略匹配组件 - Market Scanner
 * 
 * 基于后端信号和策略仓库中的策略卡片进行匹配
 */

import * as React from "react";
import { Lightbulb, TrendingUp, TrendingDown, Activity, Target, Zap, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { useStrategies, matchStrategies, type StrategyCard } from "../../hooks/useStrategies";
import { useConsoleContext } from "../../context/ConsoleContext";
import type { TradingSignal } from "../../hooks/useSignals";

interface StrategyMatcherProps {
  symbol: string;
  trend: "bullish" | "bearish" | "neutral";
  price?: number;
  changePercent?: number;
  signals?: TradingSignal[];
}

export const StrategyMatcher: React.FC<StrategyMatcherProps> = ({
  symbol,
  trend,
  price,
  changePercent = 0,
  signals = [],
}) => {
  const { settings } = useConsoleContext();
  const { strategies, isLoading, error } = useStrategies({
    backend: settings.backend,
    autoRefresh: false,
  });

  const [expandedStrategy, setExpandedStrategy] = React.useState<string | null>(null);

  // 过滤当前品种相关的信号
  const relevantSignals = React.useMemo(() => {
    return signals.filter((s) => {
      const symbolMatch = s.symbol.includes(symbol) || 
        symbol.includes(s.symbol.replace("=X", "").replace("=F", ""));
      return symbolMatch;
    });
  }, [signals, symbol]);

  // 匹配策略
  const matchedStrategies = React.useMemo(() => {
    return matchStrategies(
      strategies,
      relevantSignals.map(s => ({
        signal_name: s.signal_name,
        pattern: s.pattern,
        direction: s.direction,
        symbol: s.symbol,
      })),
      { trend, price, changePercent }
    );
  }, [strategies, relevantSignals, trend, price, changePercent]);

  // 获取分类图标
  const getCategoryIcon = (category?: string) => {
    const cat = category?.toLowerCase() || "";
    if (cat.includes("趋势")) return <TrendingUp size={14} />;
    if (cat.includes("回调")) return <Activity size={14} />;
    if (cat.includes("反转")) return <Zap size={14} />;
    if (cat.includes("均值") || cat.includes("区间")) return <Target size={14} />;
    return <Lightbulb size={14} />;
  };

  // 获取置信度颜色
  const getScoreColor = (score: number) => {
    if (score >= 80) return "#10B981";
    if (score >= 50) return "#F59E0B";
    return "#6B7280";
  };

  // 获取胜率标签
  const getWinRateLabel = (strategy: StrategyCard & { matchScore: number }) => {
    if (strategy.trade_count && strategy.trade_count > 0) {
      const winRate = ((strategy.win_count || 0) / strategy.trade_count * 100).toFixed(0);
      return `${winRate}% (${strategy.trade_count}笔)`;
    }
    return null;
  };

  if (isLoading) {
    return (
      <div style={{ 
        padding: "16px", 
        background: "var(--background-secondary)", 
        borderRadius: 8,
        textAlign: "center",
        color: "var(--text-muted)",
        fontSize: "13px",
      }}>
        <Activity size={16} style={{ marginBottom: 8, opacity: 0.5 }} />
        <div>正在加载策略...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        padding: "16px", 
        background: "rgba(239, 68, 68, 0.1)", 
        borderRadius: 8,
        border: "1px solid rgba(239, 68, 68, 0.3)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#EF4444", fontSize: "13px" }}>
          <AlertCircle size={14} />
          <span>策略加载失败: {error}</span>
        </div>
      </div>
    );
  }

  if (matchedStrategies.length === 0) {
    return (
      <div style={{ 
        padding: "16px", 
        background: "var(--background-secondary)", 
        borderRadius: 8,
        border: "1px solid var(--background-modifier-border)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Activity size={14} color="var(--text-muted)" />
          <span style={{ fontSize: "13px", fontWeight: 600 }}>当前市场状态</span>
        </div>
        
        {/* 市场指标显示 */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 8,
          fontSize: "12px",
        }}>
          <div style={{ 
            padding: "8px 12px", 
            background: "var(--background-primary)",
            borderRadius: 6,
          }}>
            <div style={{ color: "var(--text-muted)", marginBottom: 2 }}>趋势</div>
            <div style={{ 
              color: trend === "bullish" ? "#10B981" : trend === "bearish" ? "#EF4444" : "var(--text-normal)",
              fontWeight: 600,
            }}>
              {trend === "bullish" ? "看涨 📈" : trend === "bearish" ? "看跌 📉" : "震荡 ➡️"}
            </div>
          </div>
          
          <div style={{ 
            padding: "8px 12px", 
            background: "var(--background-primary)",
            borderRadius: 6,
          }}>
            <div style={{ color: "var(--text-muted)", marginBottom: 2 }}>涨跌幅</div>
            <div style={{ 
              color: changePercent >= 0 ? "#10B981" : "#EF4444",
              fontWeight: 600,
            }}>
              {changePercent >= 0 ? "+" : ""}{changePercent.toFixed(2)}%
            </div>
          </div>
        </div>

        {strategies.length === 0 ? (
          <div style={{ 
            marginTop: 12,
            padding: "12px",
            background: "var(--background-primary)",
            borderRadius: 6,
            fontSize: "12px",
            color: "var(--text-muted)",
            textAlign: "center",
          }}>
            暂无策略数据，请先在策略仓库中创建策略卡片
          </div>
        ) : (
          <div style={{ 
            marginTop: 12,
            padding: "12px",
            background: "var(--background-primary)",
            borderRadius: 6,
            fontSize: "12px",
            color: "var(--text-muted)",
          }}>
            当前市场条件下暂无匹配策略
            {relevantSignals.length > 0 && (
              <div style={{ marginTop: 4, fontSize: "11px" }}>
                检测到 {relevantSignals.length} 个信号但无匹配策略
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* 标题栏 */}
      <div style={{ 
        display: "flex", 
        alignItems: "center", 
        gap: 8, 
        marginBottom: 12,
        padding: "0 4px",
      }}>
        <Lightbulb size={16} color="#F59E0B" />
        <span style={{ fontSize: "13px", fontWeight: 600 }}>匹配策略</span>
        <span style={{ 
          fontSize: "11px", 
          color: "var(--text-muted)",
          marginLeft: "auto",
        }}>
          基于 {relevantSignals.length} 个信号
        </span>
      </div>

      {/* 策略列表 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {matchedStrategies.map((strategy) => {
          const isExpanded = expandedStrategy === strategy.id;
          const scoreColor = getScoreColor(strategy.matchScore);
          const winRateLabel = getWinRateLabel(strategy);

          return (
            <div
              key={strategy.id}
              style={{
                background: "var(--background-secondary)",
                border: "1px solid var(--background-modifier-border)",
                borderRadius: 8,
                overflow: "hidden",
                transition: "all 0.2s ease",
              }}
            >
              {/* 策略头部 */}
              <div
                onClick={() => setExpandedStrategy(isExpanded ? null : strategy.id)}
                style={{
                  padding: "12px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span style={{ color: scoreColor }}>{getCategoryIcon(strategy.category)}</span>
                
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    gap: 8,
                    marginBottom: 2,
                  }}>
                    <span style={{ 
                      fontSize: "13px", 
                      fontWeight: 600,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {strategy.name}
                    </span>
                    {strategy.category && (
                      <span style={{
                        fontSize: "10px",
                        padding: "2px 6px",
                        background: "var(--background-primary)",
                        color: "var(--text-muted)",
                        borderRadius: 4,
                        flexShrink: 0,
                      }}>
                        {strategy.category}
                      </span>
                    )}
                  </div>
                  
                  <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    {strategy.setup_type || strategy.description?.slice(0, 30) + "..." || "暂无描述"}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  {/* 匹配分数 */}
                  <div style={{
                    padding: "4px 8px",
                    background: scoreColor + "15",
                    borderRadius: 4,
                    textAlign: "center",
                  }}>
                    <div style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      color: scoreColor,
                    }}>
                      {strategy.matchScore}
                    </div>
                    <div style={{
                      fontSize: "9px",
                      color: "var(--text-muted)",
                    }}>
                      匹配度
                    </div>
                  </div>
                  
                  {isExpanded ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
                </div>
              </div>

              {/* 展开的详情 */}
              {isExpanded && (
                <div style={{
                  padding: "12px",
                  borderTop: "1px solid var(--background-modifier-border)",
                  background: "var(--background-primary)",
                }}>
                  {/* 匹配的信号 */}
                  {strategy.matchedSignals.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ 
                        fontSize: "11px", 
                        color: "var(--text-muted)", 
                        fontWeight: 600,
                        marginBottom: 6,
                      }}>
                        🎯 匹配信号
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {strategy.matchedSignals.map((sig, idx) => (
                          <span
                            key={idx}
                            style={{
                              fontSize: "10px",
                              padding: "2px 6px",
                              background: scoreColor + "20",
                              color: scoreColor,
                              borderRadius: 4,
                            }}
                          >
                            {sig}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 历史表现 */}
                  {winRateLabel && (
                    <div style={{ 
                      marginBottom: 12,
                      padding: "8px 12px",
                      background: "rgba(16, 185, 129, 0.1)",
                      borderRadius: 6,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>历史胜率</span>
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "#10B981" }}>
                        {winRateLabel}
                      </span>
                    </div>
                  )}

                  {/* 规则 */}
                  {strategy.rules && strategy.rules.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ 
                        fontSize: "11px", 
                        color: "var(--text-muted)", 
                        fontWeight: 600,
                        marginBottom: 6,
                      }}>
                        📋 规则
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {strategy.rules.slice(0, 3).map((rule, idx) => (
                          <div 
                            key={idx} 
                            style={{ 
                              fontSize: "11px", 
                              color: "var(--text-normal)",
                              paddingLeft: 12,
                              position: "relative",
                            }}
                          >
                            <span style={{ 
                              position: "absolute", 
                              left: 0, 
                              color: "#10B981",
                            }}>•</span>
                            {rule}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Frontmatter 中的关键字段 */}
                  {strategy.raw_frontmatter && (
                    <div>
                      <div style={{ 
                        fontSize: "11px", 
                        color: "var(--text-muted)", 
                        fontWeight: 600,
                        marginBottom: 6,
                      }}>
                        📝 策略详情
                      </div>
                      <div style={{ 
                        display: "grid", 
                        gridTemplateColumns: "repeat(2, 1fr)",
                        gap: 8,
                        fontSize: "11px",
                      }}>
                        {strategy.raw_frontmatter["风险等级/risk_level"] && (
                          <div>
                            <span style={{ color: "var(--text-muted)" }}>风险: </span>
                            <span>{String(strategy.raw_frontmatter["风险等级/risk_level"])}</span>
                          </div>
                        )}
                        {strategy.raw_frontmatter["盈亏比/risk_reward"] && (
                          <div>
                            <span style={{ color: "var(--text-muted)" }}>盈亏比: </span>
                            <span style={{ color: "#10B981" }}>{String(strategy.raw_frontmatter["盈亏比/risk_reward"])}</span>
                          </div>
                        )}
                        {strategy.raw_frontmatter["方向/direction"] && (
                          <div>
                            <span style={{ color: "var(--text-muted)" }}>方向: </span>
                            <span>{Array.isArray(strategy.raw_frontmatter["方向/direction"]) 
                              ? strategy.raw_frontmatter["方向/direction"].join(", ")
                              : String(strategy.raw_frontmatter["方向/direction"])}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 打开策略链接 */}
                  <div style={{ marginTop: 12, textAlign: "right" }}>
                    <a
                      href={`obsidian://open?path=${encodeURIComponent(strategy.path)}`}
                      onClick={(e) => {
                        e.preventDefault();
                        // 尝试打开策略文件
                        window.open(`obsidian://open?path=${encodeURIComponent(strategy.path)}`, '_blank');
                      }}
                      style={{
                        fontSize: "11px",
                        color: "var(--interactive-accent)",
                        textDecoration: "none",
                      }}
                    >
                      查看策略详情 →
                    </a>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StrategyMatcher;
