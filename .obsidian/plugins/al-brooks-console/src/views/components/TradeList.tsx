import * as React from "react";
import type { TradeData } from "../../types";

interface TradeListProps {
  trades: TradeData[];
  onOpenFile: (path: string) => void;
}

export const TradeList: React.FC<TradeListProps> = ({ trades, onOpenFile }) => {
  const activateRow = React.useCallback((el: HTMLDivElement) => {
    el.style.borderColor = "var(--interactive-accent)";
    el.style.background = "var(--background-modifier-hover)";
    el.style.boxShadow = "0 0 0 2px var(--background-modifier-border)";
  }, []);

  const deactivateRow = React.useCallback((el: HTMLDivElement) => {
    el.style.borderColor = "var(--background-modifier-border)";
    el.style.background = "var(--background-primary)";
    el.style.boxShadow = "none";
  }, []);

  if (trades.length <= 200) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {trades.map((t) => {
          const pnl = typeof t.pnl === "number" ? t.pnl : 0;
          const isWin = pnl > 0;
          const isLoss = pnl < 0;
          const pnlColor = isWin
            ? "var(--text-success)"
            : isLoss
            ? "var(--text-error)"
            : "var(--text-muted)";

          return (
            <div
              key={t.path}
              style={{
                padding: "12px",
                background: "var(--background-primary)",
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                cursor: "pointer",
                transition: "border-color 180ms ease, background-color 180ms ease, box-shadow 180ms ease",
                outline: "none",
              }}
              role="button"
              tabIndex={0}
              aria-label={`打开交易：${t.ticker ?? "未知"}（${t.dateIso ?? ""}）`}
              onClick={() => {
                onOpenFile(t.path);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpenFile(t.path);
                }
              }}
              onMouseEnter={(e) => activateRow(e.currentTarget)}
              onMouseLeave={(e) => deactivateRow(e.currentTarget)}
              onFocus={(e) => activateRow(e.currentTarget)}
              onBlur={(e) => deactivateRow(e.currentTarget)}
            >
              <div
                style={{ display: "flex", flexDirection: "column", gap: "2px" }}
              >
                <div style={{ fontWeight: "600", fontSize: "1rem" }}>
                  {t.ticker ?? "未知"}
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  {t.dateIso}
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontWeight: "700",
                    color: pnlColor,
                    fontSize: "1.1rem",
                  }}
                >
                  {pnl > 0 ? "+" : ""}
                  {pnl}R
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-faint)" }}>
                  {t.outcome ?? ""}
                </div>
              </div>
            </div>
          );
        })}
        {trades.length === 0 && (
          <div
            style={{
              padding: "20px",
              textAlign: "center",
              color: "var(--text-faint)",
            }}
          >
            未找到交易记录。开始记录吧！
          </div>
        )}
      </div>
    );
  }

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = React.useState(0);
  const [viewportHeight, setViewportHeight] = React.useState(0);

  const rowHeight = 74;
  const overscan = 6;

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setViewportHeight(el.clientHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const onScroll = React.useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
  }, []);

  const totalHeight = trades.length * rowHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(
    trades.length,
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan
  );
  const visible = trades.slice(startIndex, endIndex);
  const topSpacer = startIndex * rowHeight;
  const bottomSpacer = Math.max(
    0,
    totalHeight - topSpacer - visible.length * rowHeight
  );

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      style={{
        display: "block",
        overflowY: "auto",
        maxHeight: "600px",
        border: "1px solid var(--background-modifier-border)",
        borderRadius: "8px",
        background: "var(--background-primary)",
        padding: "8px",
      }}
    >
      <div style={{ height: topSpacer }} />
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {visible.map((t) => {
          const pnl = typeof t.pnl === "number" ? t.pnl : 0;
          const isWin = pnl > 0;
          const isLoss = pnl < 0;
          const pnlColor = isWin
            ? "var(--text-success)"
            : isLoss
            ? "var(--text-error)"
            : "var(--text-muted)";

          return (
            <div
              key={t.path}
              style={{
                padding: "12px",
                background: "var(--background-primary)",
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                cursor: "pointer",
                transition: "border-color 180ms ease, background-color 180ms ease, box-shadow 180ms ease",
                outline: "none",
              }}
              role="button"
              tabIndex={0}
              aria-label={`打开交易：${t.ticker ?? "未知"}（${t.dateIso ?? ""}）`}
              onClick={() => {
                // Open file
                onOpenFile(t.path);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpenFile(t.path);
                }
              }}
              onMouseEnter={(e) => activateRow(e.currentTarget)}
              onMouseLeave={(e) => deactivateRow(e.currentTarget)}
              onFocus={(e) => activateRow(e.currentTarget)}
              onBlur={(e) => deactivateRow(e.currentTarget)}
            >
              <div
                style={{ display: "flex", flexDirection: "column", gap: "2px" }}
              >
                <div style={{ fontWeight: "600", fontSize: "1rem" }}>
                  {t.ticker ?? "未知"}
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  {t.dateIso}
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontWeight: "700",
                    color: pnlColor,
                    fontSize: "1.1rem",
                  }}
                >
                  {pnl > 0 ? "+" : ""}
                  {pnl}R
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-faint)" }}>
                  {t.outcome ?? ""}
                </div>
              </div>
            </div>
          );
        })}
        {trades.length === 0 && (
          <div
            style={{
              padding: "20px",
              textAlign: "center",
              color: "var(--text-faint)",
            }}
          >
            未找到交易记录。开始记录吧！
          </div>
        )}
      </div>
      <div style={{ height: bottomSpacer }} />
    </div>
  );
};
