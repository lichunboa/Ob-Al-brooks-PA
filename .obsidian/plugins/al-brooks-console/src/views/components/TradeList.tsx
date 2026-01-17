import * as React from "react";
import type { App } from "obsidian";
import { Notice } from "obsidian";
import type { TradeData } from "../../types";
import type { EnumPresets } from "../../core/enum-presets";
import { ActionService } from "../../core/action/action-service";
import { Button } from "../../ui/components/Button";
import { TradeInlineForm } from "./trading/TradeInlineForm";

interface TradeListProps {
  trades: TradeData[];
  onOpenFile: (path: string) => void;
  app?: App;
  enumPresets?: EnumPresets;
  onUpdate?: () => void;
}

export const TradeList: React.FC<TradeListProps> = ({ trades, onOpenFile, app, enumPresets, onUpdate }) => {
  const [expandedTradeIndex, setExpandedTradeIndex] = React.useState<number | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);

  const actionService = React.useMemo(() => {
    return app ? new ActionService(app) : null;
  }, [app]);

  const handleToggleEdit = (index: number) => {
    if (expandedTradeIndex === index) {
      setExpandedTradeIndex(null);
    } else {
      setExpandedTradeIndex(index);
    }
  };

  const handleSave = async (trade: TradeData, updates: Record<string, any>) => {
    if (!actionService || !trade.path) {
      new Notice("❌ 无法保存");
      return;
    }

    setIsSaving(true);

    try {
      if (Object.keys(updates).length === 0) {
        new Notice("没有修改");
        setExpandedTradeIndex(null);
        return;
      }

      const result = await actionService.updateTrade(trade.path, updates, {
        dryRun: false,
        validate: false,
      });

      if (result.success) {
        new Notice("✅ 更新成功");
        setExpandedTradeIndex(null);
        if (onUpdate) onUpdate();
      } else {
        // 检查是否是风控错误
        if (result.details?.limit) {
          // 显示风控警告Modal
          showRiskWarningModal(result.details);
        } else {
          new Notice(`❌ 更新失败: ${result.message}`);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      new Notice(`❌ 更新失败: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  };

  // 风控警告Modal
  const showRiskWarningModal = (details: any) => {
    if (!app) return;

    const { Modal } = require('obsidian');
    const modal = new Modal(app);
    modal.titleEl.setText('⚠️ 风险警告');

    modal.contentEl.createDiv({}, (div: HTMLDivElement) => {
      div.style.cssText = 'padding: 16px; line-height: 1.6;';
      div.innerHTML = `
        <div style="margin-bottom: 16px; font-weight: 600; color: var(--text-error);">
          风险超出每日限额!
        </div>
        <div style="margin-bottom: 8px;">
          <strong>当前风险:</strong> ${details.currentRisk.toFixed(1)}R
        </div>
        <div style="margin-bottom: 8px;">
          <strong>新增风险:</strong> ${details.newRisk.toFixed(1)}R
        </div>
        <div style="margin-bottom: 8px;">
          <strong>总计:</strong> ${details.totalRisk.toFixed(1)}R
        </div>
        <div style="margin-bottom: 16px; color: var(--text-error); font-weight: 600;">
          <strong>限额:</strong> ${details.limit}R
        </div>
        <div style="font-size: 12px; opacity: 0.7; padding: 12px; background: var(--background-secondary); border-radius: 4px;">
          💡 <strong>建议:</strong> 降低仓位或等待明日
        </div>
      `;
    });

    modal.open();
  };



  if (!trades || trades.length === 0) {
    return (
      <div style={{
        padding: "20px",
        textAlign: "center",
        color: "var(--text-faint)",
        fontSize: "0.9em"
      }}>
        暂无交易记录
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {trades.map((t, idx) => {
        const pnl = t.pnl ?? 0;
        const pnlColor = pnl > 0 ? "var(--text-success)" : pnl < 0 ? "var(--text-error)" : "var(--text-muted)";
        const isExpanded = expandedTradeIndex === idx;

        return (
          <div
            key={idx}
            style={{
              border: "1px solid var(--background-modifier-border)",
              borderRadius: "6px",
              background: "var(--background-primary)",
            }}
          >
            {/* 交易主信息 */}
            <div style={{
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <div
                style={{ display: "flex", flexDirection: "column", gap: "2px", flex: 1, cursor: "pointer" }}
                onClick={() => onOpenFile(t.path)}
              >
                <div style={{ fontWeight: "600", fontSize: "1rem" }}>{t.ticker ?? "未知"}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{t.dateIso}</div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: "700", color: pnlColor, fontSize: "1.1rem" }}>
                    {pnl > 0 ? "+" : ""}{Number.isInteger(pnl) ? pnl : pnl.toFixed(2)}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-faint)" }}>
                    {t.outcome ?? ""}
                  </div>
                </div>

                {app && enumPresets && (
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleEdit(idx);
                    }}
                    variant="small"
                    style={{
                      background: isExpanded ? "var(--interactive-accent-hover)" : "var(--interactive-accent)",
                      color: "var(--text-on-accent)",
                      border: "none",
                      borderRadius: "4px",
                      padding: "6px 12px",
                      fontSize: "0.85em",
                      fontWeight: 500
                    }}
                  >
                    {isExpanded ? "收起" : "编辑"}
                  </Button>
                )}
              </div>
            </div>

            {/* 内联编辑表单 */}
            {isExpanded && (
              <TradeInlineForm
                trade={t}
                enumPresets={enumPresets}
                onSave={(updates) => handleSave(t, updates)}
                onCancel={() => setExpandedTradeIndex(null)}
                isSaving={isSaving}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};
