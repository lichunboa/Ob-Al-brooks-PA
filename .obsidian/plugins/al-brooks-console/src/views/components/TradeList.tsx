import * as React from "react";
import type { App } from "obsidian";
import type { TradeData } from "../../types";
import type { EnumPresets } from "../../core/enum-presets";
import { QuickUpdateModal } from "./trading/QuickUpdateModal";

interface TradeListProps {
  trades: TradeData[];
  onOpenFile: (path: string) => void;
  app?: App;
  enumPresets?: EnumPresets;
  onUpdate?: () => void;
}

export const TradeList: React.FC<TradeListProps> = ({ trades, onOpenFile, app, enumPresets, onUpdate }) => {
  const [selectedTrade, setSelectedTrade] = React.useState<TradeData | null>(null);
  const [showUpdateModal, setShowUpdateModal] = React.useState(false);

  const activateRow = React.useCallback((el: HTMLDivElement) => {
    el.style.borderColor = "var(--interactive-accent)";
    el.style.background = "var(--background-modifier-hover)";
    el.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.15)";
  }, []);

  const deactivateRow = React.useCallback((el: HTMLDivElement) => {
    el.style.borderColor = "var(--background-modifier-border)";
    el.style.background = "var(--background-primary)";
    el.style.boxShadow = "none";
  }, []);

  const bottomSpacer = 200;

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {trades.map((t, idx) => {
          const pnl = t.pnl ?? 0;
          const pnlColor =
            pnl > 0
              ? "var(--text-success)"
              : pnl < 0
                ? "var(--text-error)"
                : "var(--text-muted)";

          return (
            <div
              key={idx}
              style={{
                padding: "12px 16px",
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "6px",
                background: "var(--background-primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                transition:
                  "border-color 180ms ease, background-color 180ms ease, box-shadow 180ms ease",
                outline: "none",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "2px",
                  flex: 1,
                  cursor: "pointer"
                }}
                role="button"
                tabIndex={0}
                aria-label={`打开交易：${t.ticker ?? "未知"}（${t.dateIso ?? ""}）`}
                onClick={() => onOpenFile(t.path)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpenFile(t.path);
                  }
                }}
                onMouseEnter={(e) => activateRow(e.currentTarget.parentElement as HTMLDivElement)}
                onMouseLeave={(e) => deactivateRow(e.currentTarget.parentElement as HTMLDivElement)}
                onFocus={(e) => activateRow(e.currentTarget.parentElement as HTMLDivElement)}
                onBlur={(e) => deactivateRow(e.currentTarget.parentElement as HTMLDivElement)}
              >
                <div style={{ fontWeight: "600", fontSize: "1rem" }}>
                  {t.ticker ?? "未知"}
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  {t.dateIso}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
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

                {/* 更新按钮 */}
                {app && enumPresets && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedTrade(t);
                      setShowUpdateModal(true);
                    }}
                    style={{
                      background: "var(--interactive-accent)",
                      color: "var(--text-on-accent)",
                      border: "none",
                      borderRadius: "4px",
                      padding: "6px 12px",
                      fontSize: "0.85em",
                      fontWeight: 500,
                      cursor: "pointer",
                      transition: "opacity 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = "0.8";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = "1";
                    }}
                  >
                    更新
                  </button>
                )}
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

      {/* QuickUpdateModal */}
      {showUpdateModal && selectedTrade && app && (
        <QuickUpdateModal
          trade={selectedTrade}
          enumPresets={enumPresets}
          app={app}
          onClose={() => {
            setShowUpdateModal(false);
            setSelectedTrade(null);
          }}
          onSuccess={() => {
            if (onUpdate) {
              onUpdate();
            }
          }}
        />
      )}
    </div>
  );
};
