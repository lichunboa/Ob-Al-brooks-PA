import * as React from "react";
import { GlassPanel } from "../../ui/components/GlassPanel";
import { SectionHeader } from "../../ui/components/SectionHeader";
import { InteractiveButton } from "../../ui/components/InteractiveButton";
import { useMarketData, usePriceStats } from "../../hooks/useMarketData";
import { useConsoleContext } from "../../context/ConsoleContext";
import { V5_COLORS } from "../../ui/tokens";
import { SPACE } from "../../ui/styles/dashboardPrimitives";
import { ChartPanel } from "./ChartPanel";
import { DATA_SOURCES, type DataSource } from "../../services/data-source";

interface SymbolCardProps {
  ticker: string;
  name: string;
  category: string;
  interval: string;
  exchange: DataSource;
  isSelected: boolean;
  onClick: () => void;
}

const SymbolCard: React.FC<SymbolCardProps> = ({
  ticker,
  name,
  category,
  interval,
  exchange,
  isSelected,
  onClick,
}) => {
  const { settings } = useConsoleContext();
  const { data, isLoading, refresh } = useMarketData({
    backend: settings.backend,
    symbol: ticker,
    interval,
    limit: 50,
    autoRefresh: true,
  });

  const stats = usePriceStats(data?.candles);
  const isPositive = stats.change >= 0;
  const color = isPositive ? V5_COLORS.live : V5_COLORS.loss;

  const categoryEmoji = {
    crypto: "💰",
    stock: "📈",
    forex: "💱",
    future: "📊",
  }[category] || "📊";

  const dataSource = DATA_SOURCES[exchange];
  const isDelayed = dataSource.delay !== "realtime";

  const latestPrice = data?.candles[data.candles.length - 1]?.close;

  return (
    <div
      onClick={onClick}
      style={{
        padding: "16px",
        background: isSelected ? "var(--interactive-accent-hover)" : "var(--background-secondary)",
        borderRadius: "8px",
        border: `2px solid ${isSelected ? "var(--interactive-accent)" : "var(--background-modifier-border)"}`,
        minWidth: "200px",
        cursor: "pointer",
        transition: "all 0.2s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
        <span style={{ fontSize: "16px" }}>{categoryEmoji}</span>
        <span style={{ fontWeight: 600 }}>{name}</span>
        <span style={{ fontSize: "11px", color: "var(--text-muted)", marginLeft: "auto" }}>
          {interval}
        </span>
      </div>

      {isLoading ? (
        <div style={{ color: "var(--text-muted)", fontSize: "13px" }}>加载中...</div>
      ) : latestPrice ? (
        <>
          <div
            style={{
              fontSize: "24px",
              fontWeight: 700,
              fontFamily: "var(--font-monospace)",
              marginBottom: "8px",
            }}
          >
            ${latestPrice.toFixed(category === "forex" ? 4 : 2)}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span
              style={{
                color,
                fontWeight: 600,
                fontSize: "14px",
              }}
            >
              {isPositive ? "+" : ""}
              {stats.change.toFixed(category === "forex" ? 4 : 2)} ({stats.changePercent.toFixed(2)}%)
            </span>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              H: {stats.high24h.toFixed(category === "forex" ? 4 : 1)} L: {stats.low24h.toFixed(category === "forex" ? 4 : 1)}
            </span>
          </div>

          <div
            style={{
              marginTop: "8px",
              fontSize: "11px",
              color: "var(--text-muted)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>
              波动率: {stats.volatility.toFixed(2)}%
              {isDelayed && (
                <span style={{ marginLeft: "8px", color: V5_COLORS.back }}>
                  ● 延迟
                </span>
              )}
            </span>
            <InteractiveButton
              interaction="text"
              onClick={(e) => {
                e.stopPropagation();
                refresh();
              }}
              style={{ fontSize: "11px" }}
            >
              刷新
            </InteractiveButton>
          </div>
        </>
      ) : (
        <div style={{ color: V5_COLORS.textDim, fontSize: "13px" }}>无数据</div>
      )}
    </div>
  );
};

export const MarketOverview: React.FC = () => {
  const { settings } = useConsoleContext();
  const activeSymbols = settings.watchedSymbols.filter((s) => s.isActive);
  const [selectedSymbol, setSelectedSymbol] = React.useState<string | null>(null);

  const selectedConfig = activeSymbols.find((s) => s.id === selectedSymbol);

  // Group symbols by category
  const groupedSymbols = React.useMemo(() => {
    const groups: Record<string, typeof activeSymbols> = {
      crypto: [],
      forex: [],
      stock: [],
      future: [],
    };
    activeSymbols.forEach((s) => {
      if (groups[s.category]) {
        groups[s.category].push(s);
      }
    });
    return groups;
  }, [activeSymbols]);

  const categoryNames: Record<string, string> = {
    crypto: "加密货币",
    forex: "外汇",
    stock: "股票",
    future: "期货",
  };

  return (
    <>
      <GlassPanel>
        <SectionHeader 
          title="市场概览" 
          subtitle={`${activeSymbols.length} 个品种 | 点击卡片查看图表`} 
          icon="📊" 
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: "12px",
            marginTop: SPACE.md,
          }}
        >
          {activeSymbols.map((symbol) => (
            <SymbolCard
              key={symbol.id}
              ticker={symbol.ticker}
              name={symbol.id}
              category={symbol.category}
              interval={symbol.defaultInterval}
              exchange={symbol.exchange as DataSource}
              isSelected={selectedSymbol === symbol.id}
              onClick={() => setSelectedSymbol(symbol.id)}
            />
          ))}
        </div>

        {/* Legend */}
        <div style={{ 
          marginTop: SPACE.md, 
          padding: "12px", 
          background: "var(--background-secondary)",
          borderRadius: "8px",
          fontSize: "12px",
          color: "var(--text-muted)",
          display: "flex",
          gap: "16px",
          flexWrap: "wrap",
        }}>
          <span>💰 加密货币</span>
          <span>💱 外汇</span>
          <span>📈 股票</span>
          <span>📊 期货</span>
          <span style={{ marginLeft: "auto" }}>
            <span style={{ color: V5_COLORS.back }}>●</span> 延迟数据 (~15min)
          </span>
        </div>
      </GlassPanel>

      {selectedConfig && (
        <ChartPanel
          symbol={selectedConfig.ticker}
          name={selectedConfig.name}
          category={selectedConfig.category}
          interval={selectedConfig.defaultInterval}
          onClose={() => setSelectedSymbol(null)}
        />
      )}
    </>
  );
};
