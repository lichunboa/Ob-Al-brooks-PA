import * as React from "react";
import type { App } from "obsidian";
import { Notice } from "obsidian";
import type { TradeData } from "../../../types";
import type { EnumPresets } from "../../../core/enum-presets";
import { ActionService } from "../../../core/action/action-service";
import { Button } from "../../../ui/components/Button";

interface QuickUpdateModalProps {
    trade: TradeData;
    enumPresets?: EnumPresets;
    app: App;
    onClose: () => void;
    onSuccess: () => void;
}

export const QuickUpdateModal: React.FC<QuickUpdateModalProps> = ({
    trade,
    enumPresets,
    app,
    onClose,
    onSuccess,
}) => {
    // 按照单笔交易模版的frontmatter顺序初始化所有字段
    const [formData, setFormData] = React.useState({
        accountType: trade.accountType || "",
        ticker: trade.ticker || "",
        timeframe: trade.timeframe || "5m",
        marketCycle: trade.marketCycle || "",
        alwaysIn: (trade as any).alwaysIn || "",
        dayType: (trade as any).dayType || "",
        probability: (trade as any).probability || "",
        confidence: (trade as any).confidence || "",
        managementPlan: (trade as any).managementPlan || "",
        direction: trade.direction || "",
        setupCategory: trade.setupCategory || "",
        patternsObserved: (trade as any).patternsObserved || "",
        signalBarQuality: (trade as any).signalBarQuality || "",
        orderType: (trade as any).orderType || "",
        entryPrice: (trade as any).entryPrice?.toString() || "",
        stopLoss: (trade as any).stopLoss?.toString() || "",
        takeProfit: (trade as any).takeProfit?.toString() || "",
        initialRisk: (trade as any).initialRisk?.toString() || "",
        pnl: trade.pnl?.toString() || "",
        outcome: trade.outcome || "",
        cover: (trade as any).cover || "",
        executionQuality: trade.executionQuality || "",
        strategyName: trade.strategyName || "",
    });

    const [isSaving, setIsSaving] = React.useState(false);

    const actionService = React.useMemo(() => {
        return new ActionService(app);
    }, [app]);

    const handleChange = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = async () => {
        if (!trade.path) {
            new Notice("❌ 交易路径不存在");
            return;
        }

        setIsSaving(true);

        try {
            // 构建更新数据 - 只包含有变化的字段
            const updates: Record<string, any> = {};

            if (formData.accountType !== trade.accountType) updates.accountType = formData.accountType;
            if (formData.ticker !== trade.ticker) updates.ticker = formData.ticker;
            if (formData.timeframe !== trade.timeframe) updates.timeframe = formData.timeframe;
            if (formData.marketCycle !== trade.marketCycle) updates.marketCycle = formData.marketCycle;
            if (formData.alwaysIn !== (trade as any).alwaysIn) updates.alwaysIn = formData.alwaysIn;
            if (formData.dayType !== (trade as any).dayType) updates.dayType = formData.dayType;
            if (formData.probability !== (trade as any).probability) updates.probability = formData.probability;
            if (formData.confidence !== (trade as any).confidence) updates.confidence = formData.confidence;
            if (formData.managementPlan !== (trade as any).managementPlan) updates.managementPlan = formData.managementPlan;
            if (formData.direction !== trade.direction) updates.direction = formData.direction;
            if (formData.setupCategory !== trade.setupCategory) updates.setupCategory = formData.setupCategory;
            if (formData.patternsObserved !== (trade as any).patternsObserved) updates.patternsObserved = formData.patternsObserved;
            if (formData.signalBarQuality !== (trade as any).signalBarQuality) updates.signalBarQuality = formData.signalBarQuality;
            if (formData.orderType !== (trade as any).orderType) updates.orderType = formData.orderType;
            if (formData.entryPrice) updates.entryPrice = parseFloat(formData.entryPrice) || 0;
            if (formData.stopLoss) updates.stopLoss = parseFloat(formData.stopLoss) || 0;
            if (formData.takeProfit) updates.takeProfit = parseFloat(formData.takeProfit) || 0;
            if (formData.initialRisk) updates.initialRisk = parseFloat(formData.initialRisk) || 0;
            if (formData.pnl !== trade.pnl?.toString()) updates.pnl = parseFloat(formData.pnl) || 0;
            if (formData.outcome !== trade.outcome) updates.outcome = formData.outcome;
            if (formData.cover !== (trade as any).cover) updates.cover = formData.cover;
            if (formData.executionQuality !== trade.executionQuality) updates.executionQuality = formData.executionQuality;
            if (formData.strategyName !== trade.strategyName) updates.strategyName = formData.strategyName;

            if (Object.keys(updates).length === 0) {
                new Notice("没有修改");
                onClose();
                return;
            }

            // 执行更新 (禁用严格验证,允许更新不完整的记录)
            const result = await actionService.updateTrade(trade.path, updates, {
                dryRun: false,
                validate: false,
            });

            if (result.success) {
                new Notice("✅ 更新成功");
                onSuccess();
                onClose();
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
        padding: "8px 12px",
        background: "var(--background-primary)",
        border: "1px solid var(--background-modifier-border)",
        borderRadius: "4px",
        color: "var(--text-normal)",
        fontSize: "14px",
    };

    const labelStyle: React.CSSProperties = {
        display: "block",
        marginBottom: "6px",
        fontSize: "13px",
        fontWeight: 500,
        color: "var(--text-normal)",
    };

    const fieldGroupStyle: React.CSSProperties = {
        marginBottom: "16px",
    };

    return (
        <div
            onClick={onClose}
            style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(0, 0, 0, 0.6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: "var(--background-primary)",
                    borderRadius: "8px",
                    maxWidth: "800px",
                    width: "90%",
                    maxHeight: "90vh",
                    overflow: "auto",
                    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
                }}
            >
                {/* 标题栏 */}
                <div style={{
                    padding: "16px 20px",
                    borderBottom: "1px solid var(--background-modifier-border)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    position: "sticky",
                    top: 0,
                    background: "var(--background-primary)",
                    zIndex: 1,
                }}>
                    <h3 style={{ margin: 0, fontSize: "16px" }}>⚡️ 快速更新交易</h3>
                    <Button variant="text" onClick={onClose}>✕</Button>
                </div>

                {/* 表单内容 - 按照单笔交易模版顺序 */}
                <div style={{ padding: "20px" }}>
                    {/* 文件信息 */}
                    <div style={{ marginBottom: "20px", padding: "12px", background: "var(--background-secondary)", borderRadius: "6px" }}>
                        <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>📄 {trade.path?.split('/').pop()}</div>
                        <div style={{ fontSize: "11px", color: "var(--text-faint)", marginTop: "4px" }}>📅 {trade.dateIso}</div>
                    </div>

                    {/* 第1行: 账户类型, 品种 */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                        <div style={fieldGroupStyle}>
                            <label style={labelStyle}>账户类型/account_type</label>
                            <select value={formData.accountType} onChange={(e) => handleChange("accountType", e.target.value)} style={inputStyle}>
                                <option value="">没有值</option>
                                {enumPresets?.getCanonicalValues("account_type").map((val) => (
                                    <option key={val} value={val}>{val}</option>
                                ))}
                            </select>
                        </div>

                        <div style={fieldGroupStyle}>
                            <label style={labelStyle}>品种/ticker</label>
                            <select value={formData.ticker} onChange={(e) => handleChange("ticker", e.target.value)} style={inputStyle}>
                                <option value="">没有值</option>
                                {enumPresets?.getCanonicalValues("ticker").map((val) => (
                                    <option key={val} value={val}>{val}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* 第2行: 时间周期, 市场周期 */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                        <div style={fieldGroupStyle}>
                            <label style={labelStyle}>时间周期/timeframe</label>
                            <select value={formData.timeframe} onChange={(e) => handleChange("timeframe", e.target.value)} style={inputStyle}>
                                <option value="">5m</option>
                                {enumPresets?.getCanonicalValues("timeframe").map((val) => (
                                    <option key={val} value={val}>{val}</option>
                                ))}
                            </select>
                        </div>

                        <div style={fieldGroupStyle}>
                            <label style={labelStyle}>市场周期/market_cycle</label>
                            <select value={formData.marketCycle} onChange={(e) => handleChange("marketCycle", e.target.value)} style={inputStyle}>
                                <option value="">没有值</option>
                                {enumPresets?.getCanonicalValues("market_cycle").map((val) => (
                                    <option key={val} value={val}>{val}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* 第3行: 总是方向, 日内类型 */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                        <div style={fieldGroupStyle}>
                            <label style={labelStyle}>总是方向/always_in</label>
                            <select value={formData.alwaysIn} onChange={(e) => handleChange("alwaysIn", e.target.value)} style={inputStyle}>
                                <option value="">没有值</option>
                                {enumPresets?.getCanonicalValues("always_in").map((val) => (
                                    <option key={val} value={val}>{val}</option>
                                ))}
                            </select>
                        </div>

                        <div style={fieldGroupStyle}>
                            <label style={labelStyle}>日内类型/day_type</label>
                            <select value={formData.dayType} onChange={(e) => handleChange("dayType", e.target.value)} style={inputStyle}>
                                <option value="">没有值</option>
                                {enumPresets?.getCanonicalValues("day_type").map((val) => (
                                    <option key={val} value={val}>{val}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* 第4行: 概率, 信心 */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                        <div style={fieldGroupStyle}>
                            <label style={labelStyle}>概率/probability</label>
                            <select value={formData.probability} onChange={(e) => handleChange("probability", e.target.value)} style={inputStyle}>
                                <option value="">没有值</option>
                                {enumPresets?.getCanonicalValues("probability").map((val) => (
                                    <option key={val} value={val}>{val}</option>
                                ))}
                            </select>
                        </div>

                        <div style={fieldGroupStyle}>
                            <label style={labelStyle}>信心/confidence</label>
                            <select value={formData.confidence} onChange={(e) => handleChange("confidence", e.target.value)} style={inputStyle}>
                                <option value="">没有值</option>
                                {enumPresets?.getCanonicalValues("confidence").map((val) => (
                                    <option key={val} value={val}>{val}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* 第5行: 管理计划, 方向 */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                        <div style={fieldGroupStyle}>
                            <label style={labelStyle}>管理计划/management_plan</label>
                            <select value={formData.managementPlan} onChange={(e) => handleChange("managementPlan", e.target.value)} style={inputStyle}>
                                <option value="">没有值</option>
                                {enumPresets?.getCanonicalValues("management_plan").map((val) => (
                                    <option key={val} value={val}>{val}</option>
                                ))}
                            </select>
                        </div>

                        <div style={fieldGroupStyle}>
                            <label style={labelStyle}>方向/direction</label>
                            <select value={formData.direction} onChange={(e) => handleChange("direction", e.target.value)} style={inputStyle}>
                                <option value="">没有值</option>
                                {enumPresets?.getCanonicalValues("direction").map((val) => (
                                    <option key={val} value={val}>{val}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* 第6行: 设置类别, 订单类型 */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                        <div style={fieldGroupStyle}>
                            <label style={labelStyle}>设置类别/setup_category</label>
                            <select value={formData.setupCategory} onChange={(e) => handleChange("setupCategory", e.target.value)} style={inputStyle}>
                                <option value="">没有值</option>
                                {enumPresets?.getCanonicalValues("setup_category").map((val) => (
                                    <option key={val} value={val}>{val}</option>
                                ))}
                            </select>
                        </div>

                        <div style={fieldGroupStyle}>
                            <label style={labelStyle}>订单类型/order_type</label>
                            <select value={formData.orderType} onChange={(e) => handleChange("orderType", e.target.value)} style={inputStyle}>
                                <option value="">没有值</option>
                                {enumPresets?.getCanonicalValues("order_type").map((val) => (
                                    <option key={val} value={val}>{val}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* 第7行: 入场价格, 止损 */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                        <div style={fieldGroupStyle}>
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

                        <div style={fieldGroupStyle}>
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
                    </div>

                    {/* 第8行: 目标位, 初始风险 */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                        <div style={fieldGroupStyle}>
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

                        <div style={fieldGroupStyle}>
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
                    </div>

                    {/* 第9行: 净利润, 结果 */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                        <div style={fieldGroupStyle}>
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

                        <div style={fieldGroupStyle}>
                            <label style={labelStyle}>结果/outcome</label>
                            <select value={formData.outcome} onChange={(e) => handleChange("outcome", e.target.value)} style={inputStyle}>
                                <option value="">没有值</option>
                                {enumPresets?.getCanonicalValues("outcome").map((val) => (
                                    <option key={val} value={val}>{val}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* 第10行: 执行评价, 策略名称 */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                        <div style={fieldGroupStyle}>
                            <label style={labelStyle}>执行评价/execution_quality</label>
                            <select value={formData.executionQuality} onChange={(e) => handleChange("executionQuality", e.target.value)} style={inputStyle}>
                                <option value="">没有值</option>
                                {enumPresets?.getCanonicalValues("execution_quality").map((val) => (
                                    <option key={val} value={val}>{val}</option>
                                ))}
                            </select>
                        </div>

                        <div style={fieldGroupStyle}>
                            <label style={labelStyle}>策略名称/strategy_name</label>
                            <select value={formData.strategyName} onChange={(e) => handleChange("strategyName", e.target.value)} style={inputStyle}>
                                <option value="">没有值</option>
                                {enumPresets?.getCanonicalValues("strategy_name").map((val) => (
                                    <option key={val} value={val}>{val}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {/* 底部按钮 */}
                <div style={{
                    padding: "16px 20px",
                    borderTop: "1px solid var(--background-modifier-border)",
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: "12px",
                    position: "sticky",
                    bottom: 0,
                    background: "var(--background-primary)",
                }}>
                    <Button variant="default" onClick={onClose} disabled={isSaving}>
                        取消
                    </Button>
                    <Button variant="default" onClick={handleSave} disabled={isSaving}>
                        {isSaving ? "保存中..." : "保存"}
                    </Button>
                </div>
            </div>
        </div>
    );
};
