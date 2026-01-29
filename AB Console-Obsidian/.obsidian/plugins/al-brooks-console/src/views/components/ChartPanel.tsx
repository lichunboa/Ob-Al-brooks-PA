import * as React from "react";
import { GlassPanel } from "../../ui/components/GlassPanel";
import { SectionHeader } from "../../ui/components/SectionHeader";
import { InteractiveButton } from "../../ui/components/InteractiveButton";
import { LightweightChart } from "./LightweightChart";
import { V5_COLORS } from "../../ui/tokens";
import { SPACE } from "../../ui/styles/dashboardPrimitives";
import { useConsoleContext } from "../../context/ConsoleContext";

interface ChartPanelProps {
  symbol: string;
  name: string;
  category: string;
  interval: string;
  onClose?: () => void;
  onIntervalChange?: (interval: string) => void;
}

const INTERVALS = [
  { value: "1m", label: "1分" },
  { value: "5m", label: "5分" },
  { value: "15m", label: "15分" },
  { value: "1h", label: "1时" },
  { value: "4h", label: "4时" },
  { value: "1d", label: "日线" },
];

export const ChartPanel: React.FC<ChartPanelProps> = ({
  symbol,
  name,
  category,
  interval,
  onClose,
  onIntervalChange,
}) => {
  const { settings } = useConsoleContext();
  const [selectedInterval, setSelectedInterval] = React.useState(interval);

  const handleIntervalChange = (newInterval: string) => {
    setSelectedInterval(newInterval);
    onIntervalChange?.(newInterval);
  };

  const categoryEmoji = {
    crypto: "💰",
    stock: "📈",
    forex: "💱",
    future: "📊",
  }[category] || "📊";

  return (
    <GlassPanel>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <SectionHeader
          title={`${categoryEmoji} ${name}`}
          subtitle={`${symbol} • ${selectedInterval}`}
          icon=""
        />
        {onClose && (
          <InteractiveButton
            interaction="text"
            onClick={onClose}
            style={{
              padding: "8px 16px",
              border: "1px solid var(--background-modifier-border)",
              borderRadius: "6px",
            }}
          >
            关闭
          </InteractiveButton>
        )}
      </div>

      {/* Interval Selector */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          marginTop: SPACE.md,
          marginBottom: SPACE.md,
          flexWrap: "wrap",
        }}
      >
        {INTERVALS.map((int) => (
          <button
            key={int.value}
            onClick={() => handleIntervalChange(int.value)}
            style={{
              padding: "6px 12px",
              borderRadius: "6px",
              border: "none",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: selectedInterval === int.value ? 600 : 400,
              background:
                selectedInterval === int.value
                  ? "var(--interactive-accent)"
                  : "var(--background-secondary)",
              color:
                selectedInterval === int.value
                  ? "var(--text-on-accent)"
                  : "var(--text-normal)",
            }}
          >
            {int.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div
        style={{
          border: "1px solid var(--background-modifier-border)",
          borderRadius: "8px",
          overflow: "hidden",
        }}
      >
        <LightweightChart symbol={symbol} interval={selectedInterval} height={400} backend={settings.backend} />
      </div>

      {/* Quick Stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: "12px",
          marginTop: SPACE.md,
        }}
      >
        <StatBox label="开盘" value="--" />
        <StatBox label="最高" value="--" />
        <StatBox label="最低" value="--" />
        <StatBox label="收盘" value="--" />
        <StatBox label="成交量" value="--" />
      </div>
    </GlassPanel>
  );
};

const StatBox: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div
    style={{
      padding: "12px",
      background: "var(--background-secondary)",
      borderRadius: "6px",
      textAlign: "center",
    }}
  >
    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
      {label}
    </div>
    <div style={{ fontSize: "14px", fontWeight: 600, fontFamily: "var(--font-monospace)" }}>
      {value}
    </div>
  </div>
);
