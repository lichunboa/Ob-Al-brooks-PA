import * as React from "react";
import { Lightbulb, ArrowRight, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Activity, Target, Zap } from "lucide-react";

// 策略定义
interface Strategy {
  id: string;
  name: string;
  category: string;
  description: string;
  conditions: string[];
  confidence: number;
  entryConditions?: string[];
  exitConditions?: string[];
  riskManagement?: string[];
}

// 策略数据库
const STRATEGIES: Strategy[] = [
  {
    id: "h1_l1_breakout",
    name: "H1/L1 突破",
    category: "趋势突破",
    description: "突破前高H1或前低L1后的趋势跟随",
    conditions: ["突破H1高点", "成交量放大", "趋势向上"],
    confidence: 75,
    entryConditions: ["突破H1/L1确认", "收盘价在突破方向", "成交量 > 平均1.5倍"],
    exitConditions: ["回到突破前区间", "出现反转形态", "达到目标位"],
    riskManagement: ["止损设在突破前低点/高点", "仓位1-2%", "分批止盈"],
  },
  {
    id: "ema20_gap",
    name: "20均线回调",
    category: "趋势回调",
    description: "价格回调至EMA20附近形成的交易机会",
    conditions: ["价格接近EMA20", "趋势 intact", "出现反转K线"],
    confidence: 70,
    entryConditions: ["价格触及EMA20", "出现锤子/吞没形态", "MACD金叉/死叉"],
    exitConditions: ["跌破EMA20且收盘", "趋势反转信号", "达到盈亏比2:1"],
    riskManagement: ["止损设在EMA20下方1%", "仓位2-3%", "移动止损跟踪"],
  },
  {
    id: "double_top_bottom",
    name: "双重顶底",
    category: "反转形态",
    description: "经典的双重顶或双重底形态",
    conditions: ["两个相近的高点/低点", "颈线突破", "成交量配合"],
    confidence: 80,
    entryConditions: ["颈线突破确认", "第二顶/底完成", "成交量萎缩后放大"],
    exitConditions: ["回到颈线另一侧", "形态失败", "达到测量目标"],
    riskManagement: ["止损设在第二顶/底外", "仓位1-2%", "严格按形态测量目标"],
  },
  {
    id: "wedge",
    name: "楔形形态",
    category: "反转形态",
    description: "上升楔形或下降楔形的突破",
    conditions: ["楔形收敛", "突破趋势线", "成交量变化"],
    confidence: 72,
    entryConditions: ["楔形趋势线突破", "收盘价突破确认", "成交量放大"],
    exitConditions: ["回到楔形内部", "假突破信号", "达到测量目标"],
    riskManagement: ["止损设在楔形外侧", "仓位1-2%", "测量目标=楔形宽度"],
  },
  {
    id: "failed_breakout",
    name: "失败突破",
    category: "陷阱形态",
    description: "突破后快速回落的假突破",
    conditions: ["突破前高/低", "快速回落", "收于区间内"],
    confidence: 68,
    entryConditions: ["突破失败确认", "回到区间内收盘", "反向信号出现"],
    exitConditions: ["突破成功（真突破）", "达到目标", "时间止损"],
    riskManagement: ["止损设在假突破极值外", "仓位1%", "快速止盈"],
  },
  {
    id: "bollinger_bounce",
    name: "布林带反弹",
    category: "均值回归",
    description: "价格触及布林带上下轨后的反弹",
    conditions: ["触及布林轨", "反转信号", "趋势方向"],
    confidence: 65,
    entryConditions: ["价格触及上轨/下轨", "出现反转K线", "RSI超买/超卖"],
    exitConditions: ["触及中轨", "突破轨线继续运行", "反向信号"],
    riskManagement: ["止损设在轨线外侧1%", "仓位2%", "中轨部分止盈"],
  },
];

interface StrategyMatcherProps {
  symbol: string;
  trend: "bullish" | "bearish" | "neutral";
  price?: number;
  changePercent?: number;
  indicators?: {
    rsi?: number;
    ema20?: number;
    ema50?: number;
    bbUpper?: number;
    bbLower?: number;
    bbWidth?: number;
    volume24h?: number;
    volatility?: number;
  };
}

export const StrategyMatcher: React.FC<StrategyMatcherProps> = ({
  symbol,
  trend,
  price,
  changePercent = 0,
  indicators: externalIndicators,
}) => {
  const [matchedStrategies, setMatchedStrategies] = React.useState<Strategy[]>([]);
  const [expandedStrategy, setExpandedStrategy] = React.useState<string | null>(null);
  
  // 如果没有外部指标，根据品种特征和趋势估算（使用固定算法保证一致性）
  const indicators = React.useMemo(() => {
    if (externalIndicators) return externalIndicators;
    
    // 基于品种名称生成一致的"伪随机"值
    const symbolHash = symbol.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    
    // RSI 基于趋势和品种特征
    let rsi = trend === "bullish" ? 60 : trend === "bearish" ? 35 : 50;
    rsi += (symbolHash % 15) - 7; // 添加品种特定的偏移
    rsi = Math.max(20, Math.min(80, rsi));
    
    // 波动率基于涨跌幅
    const volatility = Math.max(0.5, Math.abs(changePercent) * 1.5 + (symbolHash % 20) / 10);
    
    return {
      rsi,
      ema20: price ? price * (1 - changePercent / 100 * 0.3) : undefined,
      bbUpper: price ? price * (1.01 + (symbolHash % 10) / 500) : undefined,
      bbLower: price ? price * (0.99 - (symbolHash % 10) / 500) : undefined,
      volatility,
    };
  }, [externalIndicators, symbol, trend, price, changePercent]);

  const [marketMetrics, setMarketMetrics] = React.useState<{
    rsiSignal: "overbought" | "oversold" | "neutral";
    bbPosition: "upper" | "lower" | "middle";
    trendStrength: number;
    volatilityLevel: "high" | "low" | "normal";
  }>({
    rsiSignal: "neutral",
    bbPosition: "middle",
    trendStrength: 0,
    volatilityLevel: "normal",
  });

  React.useEffect(() => {
    // 计算市场指标状态
    const metrics: {
      rsiSignal: "overbought" | "oversold" | "neutral";
      bbPosition: "upper" | "lower" | "middle";
      trendStrength: number;
      volatilityLevel: "high" | "low" | "normal";
    } = {
      rsiSignal: "neutral",
      bbPosition: "middle",
      trendStrength: 0,
      volatilityLevel: "normal",
    };

    // RSI 分析
    if (indicators?.rsi !== undefined) {
      if (indicators.rsi > 70) metrics.rsiSignal = "overbought";
      else if (indicators.rsi < 30) metrics.rsiSignal = "oversold";
    }

    // 布林带位置分析
    if (indicators?.bbUpper && indicators?.bbLower && price) {
      const bbRange = indicators.bbUpper - indicators.bbLower;
      const position = (price - indicators.bbLower) / bbRange;
      if (position > 0.9) metrics.bbPosition = "upper";
      else if (position < 0.1) metrics.bbPosition = "lower";
    }

    // 波动率分析
    if (indicators?.volatility !== undefined) {
      if (indicators.volatility > 3) metrics.volatilityLevel = "high";
      else if (indicators.volatility < 1) metrics.volatilityLevel = "low";
    }

    // 趋势强度 (基于涨跌幅)
    metrics.trendStrength = Math.min(Math.abs(changePercent) * 10, 100);

    setMarketMetrics(metrics);

    // 根据当前市场状态匹配策略
    const matched: Strategy[] = [];
    const scores: Map<string, number> = new Map();

    // H1/L1 突破匹配 - 强趋势时
    if (trend !== "neutral" && metrics.trendStrength > 30) {
      const score = metrics.trendStrength * 0.8;
      scores.set("h1_l1_breakout", score);
    }

    // 双重顶底匹配 - 趋势转折或中性
    if (trend === "bearish" || trend === "neutral") {
      const score = trend === "bearish" ? 80 : 50;
      scores.set("double_top_bottom", score);
    }

    // EMA20 缺口匹配
    if (indicators?.ema20 && price) {
      const deviation = Math.abs((price - indicators.ema20) / indicators.ema20 * 100);
      if (deviation < 1.5) {
        const score = 70 - deviation * 10;
        scores.set("ema20_gap", score);
      }
    }

    // 布林带匹配
    if (metrics.bbPosition !== "middle") {
      const score = 75;
      scores.set("bollinger_bounce", score);
    }

    // 楔形匹配 - 高波动率时
    if (metrics.volatilityLevel === "high") {
      scores.set("wedge", 72);
    }

    // 失败突破匹配 - RSI极端时
    if (metrics.rsiSignal !== "neutral") {
      scores.set("failed_breakout", 68);
    }

    // 根据分数排序并选择策略
    const sortedIds = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id]) => id);

    const matchedStrats = sortedIds
      .map((id) => STRATEGIES.find((s) => s.id === id))
      .filter(Boolean) as Strategy[];

    // 更新置信度
    matchedStrats.forEach((s) => {
      const score = scores.get(s.id);
      if (score) s.confidence = Math.round(score);
    });

    setMatchedStrategies(matchedStrats);
  }, [symbol, trend, price, changePercent, indicators]);

  if (matchedStrategies.length === 0) return null;

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 75) return "#10B981";
    if (confidence >= 60) return "#F59E0B";
    return "#6B7280";
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "趋势突破": return <TrendingUp size={12} />;
      case "趋势回调": return <Activity size={12} />;
      case "反转形态": return <Zap size={12} />;
      case "均值回归": return <Target size={12} />;
      default: return <Lightbulb size={12} />;
    }
  };

  return (
    <div style={{ marginTop: 12 }}>
      {/* 市场参数统计 */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: 8,
        marginBottom: 12,
        padding: 10,
        background: "var(--background-primary)",
        borderRadius: 8,
      }}>
        {/* RSI */}
        {indicators?.rsi !== undefined && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: "11px", color: "var(--text-muted)", minWidth: 30 }}>RSI</span>
            <div style={{
              flex: 1,
              height: 6,
              background: "var(--background-secondary)",
              borderRadius: 3,
              overflow: "hidden",
            }}>
              <div style={{
                width: `${indicators.rsi}%`,
                height: "100%",
                background: indicators.rsi > 70 ? "#EF4444" : indicators.rsi < 30 ? "#10B981" : "#6B7280",
                borderRadius: 3,
              }} />
            </div>
            <span style={{ fontSize: "11px", fontWeight: 600, minWidth: 30, textAlign: "right" }}>
              {indicators.rsi.toFixed(1)}
            </span>
          </div>
        )}

        {/* EMA距离 */}
        {indicators?.ema20 && price && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: "11px", color: "var(--text-muted)", minWidth: 30 }}>EMA20</span>
            <span style={{
              fontSize: "11px",
              color: Math.abs((price - indicators.ema20) / price * 100) < 1 ? "#10B981" : "var(--text-normal)",
              fontWeight: 600,
            }}>
              {((price - indicators.ema20) / price * 100).toFixed(2)}%
            </span>
          </div>
        )}

        {/* 布林带位置 */}
        {indicators?.bbUpper && indicators?.bbLower && price && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: "11px", color: "var(--text-muted)", minWidth: 30 }}>BB</span>
            <span style={{
              fontSize: "11px",
              color: marketMetrics.bbPosition === "upper" ? "#EF4444" : 
                     marketMetrics.bbPosition === "lower" ? "#10B981" : "var(--text-normal)",
            }}>
              {marketMetrics.bbPosition === "upper" ? "上轨附近" : 
               marketMetrics.bbPosition === "lower" ? "下轨附近" : "中轨区域"}
            </span>
          </div>
        )}

        {/* 波动率 */}
        {indicators?.volatility !== undefined && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: "11px", color: "var(--text-muted)", minWidth: 30 }}>波动</span>
            <span style={{
              fontSize: "11px",
              color: marketMetrics.volatilityLevel === "high" ? "#EF4444" : 
                     marketMetrics.volatilityLevel === "low" ? "#10B981" : "var(--text-normal)",
            }}>
              {marketMetrics.volatilityLevel === "high" ? "高" : 
               marketMetrics.volatilityLevel === "low" ? "低" : "正常"}
              ({indicators.volatility.toFixed(2)}%)
            </span>
          </div>
        )}
      </div>

      {/* 策略匹配标题 */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <Lightbulb size={14} color="#F59E0B" />
        <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 600 }}>
          可能匹配的策略
        </span>
        <span style={{ fontSize: "11px", color: "var(--text-faint)", marginLeft: "auto" }}>
          基于当前市场状态
        </span>
      </div>

      {/* 策略列表 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {matchedStrategies.map((strategy) => {
          const isExpanded = expandedStrategy === strategy.id;
          const confidenceColor = getConfidenceColor(strategy.confidence);

          return (
            <div
              key={strategy.id}
              style={{
                background: "rgba(245, 158, 11, 0.08)",
                border: "1px solid rgba(245, 158, 11, 0.2)",
                borderRadius: "8px",
                overflow: "hidden",
              }}
            >
              {/* 策略头部 - 始终显示 */}
              <div
                style={{
                  padding: "10px 12px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
                onClick={() => setExpandedStrategy(isExpanded ? null : strategy.id)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(245, 158, 11, 0.12)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <span style={{ color: "#F59E0B" }}>{getCategoryIcon(strategy.category)}</span>
                
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: "13px", fontWeight: 600 }}>{strategy.name}</span>
                    <span style={{
                      fontSize: "10px",
                      padding: "2px 6px",
                      background: "var(--background-secondary)",
                      color: "var(--text-muted)",
                      borderRadius: "4px",
                    }}>
                      {strategy.category}
                    </span>
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: 2 }}>
                    {strategy.description}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: confidenceColor,
                  }}>
                    {strategy.confidence}%
                  </span>
                  {isExpanded ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
                </div>
              </div>

              {/* 策略详情 - 展开显示 */}
              {isExpanded && (
                <div style={{
                  padding: "12px",
                  borderTop: "1px solid rgba(245, 158, 11, 0.15)",
                  background: "rgba(245, 158, 11, 0.04)",
                }}>
                  {/* 匹配条件 */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600, marginBottom: 6 }}>
                      ✅ 匹配条件
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {strategy.conditions.map((condition, idx) => (
                        <div key={idx} style={{ fontSize: "11px", color: "var(--text-normal)", display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ color: "#10B981" }}>•</span>
                          {condition}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 入场条件 */}
                  {strategy.entryConditions && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600, marginBottom: 6 }}>
                        🎯 入场条件
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {strategy.entryConditions.map((condition, idx) => (
                          <div key={idx} style={{ fontSize: "11px", color: "var(--text-normal)", display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ color: "#3B82F6" }}>→</span>
                            {condition}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 出场条件 */}
                  {strategy.exitConditions && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600, marginBottom: 6 }}>
                        🚪 出场条件
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {strategy.exitConditions.map((condition, idx) => (
                          <div key={idx} style={{ fontSize: "11px", color: "var(--text-normal)", display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ color: "#EF4444" }}>×</span>
                            {condition}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 风险管理 */}
                  {strategy.riskManagement && (
                    <div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600, marginBottom: 6 }}>
                        🛡️ 风险管理
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {strategy.riskManagement.map((rule, idx) => (
                          <div key={idx} style={{ fontSize: "11px", color: "var(--text-normal)", display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ color: "#F59E0B" }}>⚡</span>
                            {rule}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
