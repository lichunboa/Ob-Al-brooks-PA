import * as React from "react";
import { GlassPanel } from "../../ui/components/GlassPanel";
import { SectionHeader } from "../../ui/components/SectionHeader";
import { InteractiveButton } from "../../ui/components/InteractiveButton";
import { useConsoleContext } from "../../context/ConsoleContext";
import { useSignals, formatSignalMessage, type TradingSignal } from "../../hooks/useSignals";
import { V5_COLORS } from "../../ui/tokens";
import { SPACE } from "../../ui/styles/dashboardPrimitives";

interface SignalCardProps {
  signal: TradingSignal;
  onClick?: (signal: TradingSignal) => void;
  isNew?: boolean;
}

const SignalCard: React.FC<SignalCardProps> = ({ signal, onClick, isNew }) => {
  const directionConfig = {
    BUY: { emoji: "🟢", color: V5_COLORS.live, label: "买入" },
    SELL: { emoji: "🔴", color: V5_COLORS.loss, label: "卖出" },
    ALERT: { emoji: "🟡", color: V5_COLORS.back, label: "提醒" },
  }[signal.direction];

  const timeStr = new Date(signal.timestamp).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      onClick={() => onClick?.(signal)}
      style={{
        padding: "12px",
        background: isNew ? V5_COLORS.live + "08" : "var(--background-secondary)",
        borderRadius: "8px",
        border: `1px solid ${isNew ? directionConfig.color + "40" : "var(--background-modifier-border)"}`,
        cursor: onClick ? "pointer" : "default",
        transition: "all 0.2s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
        <span style={{ fontSize: "14px" }}>{directionConfig.emoji}</span>
        <span style={{ fontWeight: 600, fontSize: "14px" }}>{signal.symbol}</span>
        <span
          style={{
            color: directionConfig.color,
            fontSize: "11px",
            fontWeight: 600,
            padding: "2px 6px",
            background: directionConfig.color + "15",
            borderRadius: "4px",
          }}
        >
          {directionConfig.label}
        </span>
        <span style={{ fontSize: "11px", color: "var(--text-muted)", marginLeft: "auto" }}>
          {timeStr}
        </span>
      </div>

      <div style={{ fontSize: "13px", fontWeight: 500, marginBottom: "4px" }}>
        {signal.signal_name}
      </div>

      <div
        style={{
          fontSize: "12px",
          color: "var(--text-muted)",
          lineHeight: 1.4,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {signal.message}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "8px" }}>
        <span style={{ fontSize: "11px", color: "var(--text-faint)", display: "flex", alignItems: "center", gap: "4px" }}>
          💪 {(signal.strength * 100).toFixed(0)}%
        </span>
        {signal.pattern && (
          <span style={{ fontSize: "11px", color: "var(--text-faint)", display: "flex", alignItems: "center", gap: "4px" }}>
            📊 {signal.pattern}
          </span>
        )}
      </div>
    </div>
  );
};

export const SignalPanel: React.FC = () => {
  const { settings } = useConsoleContext();
  const { signals, unreadCount, isLoading, lastCheck, refresh, markAsRead } = useSignals({
    backend: settings.backend,
    autoRefresh: true,
    refreshInterval: settings.backend.autoRefreshInterval || 30,
  });

  const [selectedDirection, setSelectedDirection] = React.useState<"ALL" | "BUY" | "SELL" | "ALERT">("ALL");
  const [showNotification, setShowNotification] = React.useState(false);

  // Desktop notification for new signals
  React.useEffect(() => {
    if (unreadCount > 0 && settings.notifications.enableSound) {
      setShowNotification(true);
      const timer = setTimeout(() => setShowNotification(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [unreadCount, settings.notifications.enableSound]);

  const filteredSignals = React.useMemo(() => {
    if (selectedDirection === "ALL") return signals;
    return signals.filter((s) => s.direction === selectedDirection);
  }, [signals, selectedDirection]);

  const handleSignalClick = (signal: TradingSignal) => {
    // Open chart for this symbol
    console.log("Open chart for", signal.symbol);
  };

  return (
    <>
      {/* Notification Toast */}
      {showNotification && unreadCount > 0 && (
        <div
          style={{
            position: "fixed",
            top: "20px",
            right: "20px",
            zIndex: 1000,
            padding: "16px 20px",
            background: V5_COLORS.live,
            color: "white",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            animation: "slideIn 0.3s ease",
          }}
        >
          <div style={{ fontWeight: 600 }}>🚨 新信号</div>
          <div style={{ fontSize: "13px", marginTop: "4px" }}>
            收到 {unreadCount} 个新交易信号
          </div>
        </div>
      )}

      <GlassPanel>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <SectionHeader
            title="交易信号"
            subtitle={`${filteredSignals.length} 个信号`}
            icon="🚨"
          />
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {unreadCount > 0 && (
              <span
                style={{
                  padding: "2px 8px",
                  background: V5_COLORS.live,
                  color: "white",
                  borderRadius: "10px",
                  fontSize: "11px",
                  fontWeight: 600,
                }}
              >
                {unreadCount} 新
              </span>
            )}
            <InteractiveButton
              interaction="text"
              onClick={refresh}
              disabled={isLoading}
              style={{ fontSize: "12px", padding: "4px 8px" }}
            >
              {isLoading ? "..." : "刷新"}
            </InteractiveButton>
          </div>
        </div>

        {/* Filter Tabs */}
        <div style={{ display: "flex", gap: "4px", marginTop: SPACE.sm, marginBottom: SPACE.sm }}>
          {[
            { key: "ALL", label: "全部" },
            { key: "BUY", label: "买入", color: V5_COLORS.live },
            { key: "SELL", label: "卖出", color: V5_COLORS.loss },
            { key: "ALERT", label: "提醒", color: V5_COLORS.back },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setSelectedDirection(tab.key as typeof selectedDirection)}
              style={{
                padding: "4px 10px",
                borderRadius: "4px",
                border: "none",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: selectedDirection === tab.key ? 600 : 400,
                background:
                  selectedDirection === tab.key
                    ? (tab as { color?: string }).color || "var(--interactive-accent)"
                    : "var(--background-secondary)",
                color:
                  selectedDirection === tab.key
                    ? "white"
                    : "var(--text-normal)",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Signal List */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "400px", overflowY: "auto" }}>
          {filteredSignals.length === 0 ? (
            <div
              style={{
                padding: "32px",
                textAlign: "center",
                color: "var(--text-muted)",
                background: "var(--background-secondary)",
                borderRadius: "8px",
              }}
            >
              <div style={{ fontSize: "24px", marginBottom: "8px" }}>📭</div>
              <div style={{ fontSize: "13px" }}>暂无信号</div>
              <div style={{ fontSize: "11px", marginTop: "4px" }}>
                最后检查: {lastCheck ? new Date(lastCheck).toLocaleTimeString() : "-"}
              </div>
            </div>
          ) : (
            filteredSignals.map((signal, index) => (
              <SignalCard
                key={signal.id}
                signal={signal}
                onClick={handleSignalClick}
                isNew={index < unreadCount}
              />
            ))
          )}
        </div>
      </GlassPanel>
    </>
  );
};
