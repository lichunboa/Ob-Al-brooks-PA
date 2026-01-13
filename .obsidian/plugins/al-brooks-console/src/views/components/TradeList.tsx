import * as React from "react";
import type { App } from "obsidian";
import { Notice } from "obsidian";
import type { TradeData } from "../../types";
import type { EnumPresets } from "../../core/enum-presets";
import { ActionService } from "../../core/action/action-service";

interface TradeListProps {
  trades: TradeData[];
  onOpenFile: (path: string) => void;
  app?: App;
  enumPresets?: EnumPresets;
  onUpdate?: () => void;
}

export const TradeList: React.FC<TradeListProps> = ({ trades, onOpenFile, app, enumPresets, onUpdate }) => {
  const [expandedTradeIndex, setExpandedTradeIndex] = React.useState<number | null>(null);
  const [formData, setFormData] = React.useState<Record<string, any>>({});
  const [isSaving, setIsSaving] = React.useState(false);

  const actionService = React.useMemo(() => {
    return app ? new ActionService(app) : null;
  }, [app]);

  // 初始化表单数据
  const initFormData = (trade: TradeData) => {
    const t = trade as any;
    return {
      accountType: trade.accountType || "",
      ticker: trade.ticker || "",
      timeframe: trade.timeframe || "5m",
      marketCycle: trade.marketCycle || "",
      alwaysIn: t.alwaysIn || "",
      dayType: t.dayType || "",
      probability: t.probability || "",
      confidence: t.confidence || "",
      managementPlan: t.managementPlan || "",
      direction: trade.direction || "",
      setupCategory: trade.setupCategory || "",
      patternsObserved: t.patternsObserved || "",
      signalBarQuality: t.signalBarQuality || "",
      orderType: t.orderType || "",
      entryPrice: t.entryPrice?.toString() || "",
      stopLoss: t.stopLoss?.toString() || "",
      takeProfit: t.takeProfit?.toString() || "",
      initialRisk: t.initialRisk?.toString() || "",
      pnl: trade.pnl?.toString() || "",
      outcome: trade.outcome || "",
      cover: t.cover || "",
      executionQuality: trade.executionQuality || "",
      strategyName: trade.strategyName || "",
    };
  };

  const handleToggleEdit = (index: number, trade: TradeData) => {
    if (expandedTradeIndex === index) {
      setExpandedTradeIndex(null);
    } else {
      setExpandedTradeIndex(index);
      setFormData(initFormData(trade));
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async (trade: TradeData) => {
    if (!actionService || !trade.path) {
      new Notice("❌ 无法保存");
      return;
    }

    setIsSaving(true);

    try {
      const updates: Record<string, any> = {};
      const t = trade as any;

      if (formData.accountType !== trade.accountType) updates.accountType = formData.accountType;
      if (formData.ticker !== trade.ticker) updates.ticker = formData.ticker;
      if (formData.timeframe !== trade.timeframe) updates.timeframe = formData.timeframe;
      if (formData.marketCycle !== trade.marketCycle) updates.marketCycle = formData.marketCycle;
      if (formData.alwaysIn !== t.alwaysIn) updates.alwaysIn = formData.alwaysIn;
      if (formData.dayType !== t.dayType) updates.dayType = formData.dayType;
      if (formData.probability !== t.probability) updates.probability = formData.probability;
      if (formData.confidence !== t.confidence) updates.confidence = formData.confidence;
      if (formData.managementPlan !== t.managementPlan) updates.managementPlan = formData.managementPlan;
      if (formData.direction !== trade.direction) updates.direction = formData.direction;
      if (formData.setupCategory !== trade.setupCategory) updates.setupCategory = formData.setupCategory;
      if (formData.patternsObserved !== t.patternsObserved) updates.patternsObserved = formData.patternsObserved;
      if (formData.signalBarQuality !== t.signalBarQuality) updates.signalBarQuality = formData.signalBarQuality;
      if (formData.orderType !== t.orderType) updates.orderType = formData.orderType;
      if (formData.entryPrice) updates.entryPrice = parseFloat(formData.entryPrice) || 0;
      if (formData.stopLoss) updates.stopLoss = parseFloat(formData.stopLoss) || 0;
      if (formData.takeProfit) updates.takeProfit = parseFloat(formData.takeProfit) || 0;
      if (formData.initialRisk) updates.initialRisk = parseFloat(formData.initialRisk) || 0;
      if (formData.pnl !== trade.pnl?.toString()) updates.pnl = parseFloat(formData.pnl) || 0;
      if (formData.outcome !== trade.outcome) updates.outcome = formData.outcome;
      if (formData.cover !== t.cover) updates.cover = formData.cover;
      if (formData.executionQuality !== trade.executionQuality) updates.executionQuality = formData.executionQuality;
      if (formData.strategyName !== trade.strategyName) updates.strategyName = formData.strategyName;

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
        new Notice(`❌ 更新失败: ${result.message}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      new Notice(`❌ 更新失败: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "6px 10px",
    background: "var(--background-primary)",
    border: "1px solid var(--background-modifier-border)",
    borderRadius: "4px",
    color: "var(--text-normal)",
    fontSize: "13px",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    marginBottom: "4px",
    fontSize: "11px",
    fontWeight: 500,
    color: "var(--text-muted)",
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
                    {pnl > 0 ? "+" : ""}{pnl}R
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-faint)" }}>
                    {t.outcome ?? ""}
                  </div>
                </div>

                {app && enumPresets && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleEdit(idx, t);
                    }}
                    style={{
                      background: isExpanded ? "var(--interactive-accent-hover)" : "var(--interactive-accent)",
                      color: "var(--text-on-accent)",
                      border: "none",
                      borderRadius: "4px",
                      padding: "6px 12px",
                      fontSize: "0.85em",
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    {isExpanded ? "收起" : "编辑"}
                  </button>
                )}
              </div>
            </div>

            {/* 内联编辑表单 - 所有20个字段 */}
            {isExpanded && (
              <div style={{
                padding: "16px",
                borderTop: "1px solid var(--background-modifier-border)",
                background: "var(--background-secondary)",
              }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "12px" }}>
                  {/* 第1-3列 */}
                  <div>
                    <label style={labelStyle}>账户类型/account_type</label>
                    <select value={formData.accountType} onChange={(e) => handleChange("accountType", e.target.value)} style={inputStyle}>
                      <option value="">没有值</option>
                      {enumPresets?.getCanonicalValues("account_type").map((val) => (
                        <option key={val} value={val}>{val}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>品种/ticker</label>
                    <select value={formData.ticker} onChange={(e) => handleChange("ticker", e.target.value)} style={inputStyle}>
                      <option value="">没有值</option>
                      {enumPresets?.getCanonicalValues("ticker").map((val) => (
                        <option key={val} value={val}>{val}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>时间周期/timeframe</label>
                    <select value={formData.timeframe} onChange={(e) => handleChange("timeframe", e.target.value)} style={inputStyle}>
                      <option value="">5m</option>
                      {enumPresets?.getCanonicalValues("timeframe").map((val) => (
                        <option key={val} value={val}>{val}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>市场周期/market_cycle</label>
                    <select value={formData.marketCycle} onChange={(e) => handleChange("marketCycle", e.target.value)} style={inputStyle}>
                      <option value="">没有值</option>
                      {enumPresets?.getCanonicalValues("market_cycle").map((val) => (
                        <option key={val} value={val}>{val}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>总是方向/always_in</label>
                    <select value={formData.alwaysIn} onChange={(e) => handleChange("alwaysIn", e.target.value)} style={inputStyle}>
                      <option value="">没有值</option>
                      {enumPresets?.getCanonicalValues("always_in").map((val) => (
                        <option key={val} value={val}>{val}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>日内类型/day_type</label>
                    <select value={formData.dayType} onChange={(e) => handleChange("dayType", e.target.value)} style={inputStyle}>
                      <option value="">没有值</option>
                      {enumPresets?.getCanonicalValues("day_type").map((val) => (
                        <option key={val} value={val}>{val}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>概率/probability</label>
                    <select value={formData.probability} onChange={(e) => handleChange("probability", e.target.value)} style={inputStyle}>
                      <option value="">没有值</option>
                      {enumPresets?.getCanonicalValues("probability").map((val) => (
                        <option key={val} value={val}>{val}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>信心/confidence</label>
                    <select value={formData.confidence} onChange={(e) => handleChange("confidence", e.target.value)} style={inputStyle}>
                      <option value="">没有值</option>
                      {enumPresets?.getCanonicalValues("confidence").map((val) => (
                        <option key={val} value={val}>{val}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>管理计划/management_plan</label>
                    <select value={formData.managementPlan} onChange={(e) => handleChange("managementPlan", e.target.value)} style={inputStyle}>
                      <option value="">没有值</option>
                      {enumPresets?.getCanonicalValues("management_plan").map((val) => (
                        <option key={val} value={val}>{val}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>方向/direction</label>
                    <select value={formData.direction} onChange={(e) => handleChange("direction", e.target.value)} style={inputStyle}>
                      <option value="">没有值</option>
                      {enumPresets?.getCanonicalValues("direction").map((val) => (
                        <option key={val} value={val}>{val}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>设置类别/setup_category</label>
                    <select value={formData.setupCategory} onChange={(e) => handleChange("setupCategory", e.target.value)} style={inputStyle}>
                      <option value="">没有值</option>
                      {enumPresets?.getCanonicalValues("setup_category").map((val) => (
                        <option key={val} value={val}>{val}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>订单类型/order_type</label>
                    <select value={formData.orderType} onChange={(e) => handleChange("orderType", e.target.value)} style={inputStyle}>
                      <option value="">没有值</option>
                      {enumPresets?.getCanonicalValues("order_type").map((val) => (
                        <option key={val} value={val}>{val}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>入场/entry_price</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.entryPrice}
                      onChange={(e) => handleChange("entryPrice", e.target.value)}
                      placeholder="入场价格"
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>止损/stop_loss</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.stopLoss}
                      onChange={(e) => handleChange("stopLoss", e.target.value)}
                      placeholder="止损价格"
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>目标位/take_profit</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.takeProfit}
                      onChange={(e) => handleChange("takeProfit", e.target.value)}
                      placeholder="目标价格"
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>初始风险/initial_risk</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.initialRisk}
                      onChange={(e) => handleChange("initialRisk", e.target.value)}
                      placeholder="初始风险"
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>净利润/net_profit (R)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={formData.pnl}
                      onChange={(e) => handleChange("pnl", e.target.value)}
                      placeholder="例如: 2.5"
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>结果/outcome</label>
                    <select value={formData.outcome} onChange={(e) => handleChange("outcome", e.target.value)} style={inputStyle}>
                      <option value="">没有值</option>
                      {enumPresets?.getCanonicalValues("outcome").map((val) => (
                        <option key={val} value={val}>{val}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>执行评价/execution_quality</label>
                    <select value={formData.executionQuality} onChange={(e) => handleChange("executionQuality", e.target.value)} style={inputStyle}>
                      <option value="">没有值</option>
                      {enumPresets?.getCanonicalValues("execution_quality").map((val) => (
                        <option key={val} value={val}>{val}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>策略名称/strategy_name</label>
                    <select value={formData.strategyName} onChange={(e) => handleChange("strategyName", e.target.value)} style={inputStyle}>
                      <option value="">没有值</option>
                      {enumPresets?.getCanonicalValues("strategy_name").map((val) => (
                        <option key={val} value={val}>{val}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 保存/取消按钮 */}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" }}>
                  <button
                    onClick={() => setExpandedTradeIndex(null)}
                    disabled={isSaving}
                    style={{
                      background: "var(--background-modifier-border)",
                      color: "var(--text-normal)",
                      border: "none",
                      borderRadius: "4px",
                      padding: "6px 16px",
                      fontSize: "0.9em",
                      cursor: "pointer",
                    }}
                  >
                    取消
                  </button>
                  <button
                    onClick={() => handleSave(t)}
                    disabled={isSaving}
                    style={{
                      background: "var(--interactive-accent)",
                      color: "var(--text-on-accent)",
                      border: "none",
                      borderRadius: "4px",
                      padding: "6px 16px",
                      fontSize: "0.9em",
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    {isSaving ? "保存中..." : "保存"}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
