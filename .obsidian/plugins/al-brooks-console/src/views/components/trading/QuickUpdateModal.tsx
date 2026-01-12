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
    const [formData, setFormData] = React.useState({
        pnl: trade.pnl?.toString() || "",
        outcome: trade.outcome || "",
        ticker: trade.ticker || "",
        direction: trade.direction || "",
        accountType: trade.accountType || "",
        strategyName: trade.strategyName || "",
        setupCategory: trade.setupCategory || "",
        timeframe: trade.timeframe || "",
        executionQuality: trade.executionQuality || "",
        marketCycle: trade.marketCycle || "",
        notes: "",
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
            // 构建更新数据
            const updates: Record<string, any> = {};

            if (formData.pnl !== trade.pnl?.toString()) {
                updates.pnl = parseFloat(formData.pnl) || 0;
            }
            if (formData.outcome !== trade.outcome) updates.outcome = formData.outcome;
            if (formData.ticker !== trade.ticker) updates.ticker = formData.ticker;
            if (formData.direction !== trade.direction) updates.direction = formData.direction;
            if (formData.accountType !== trade.accountType) updates.accountType = formData.accountType;
            if (formData.strategyName !== trade.strategyName) updates.strategyName = formData.strategyName;
            if (formData.setupCategory !== trade.setupCategory) updates.setupCategory = formData.setupCategory;
            if (formData.timeframe !== trade.timeframe) updates.timeframe = formData.timeframe;
            if (formData.executionQuality !== trade.executionQuality) updates.executionQuality = formData.executionQuality;
            if (formData.marketCycle !== trade.marketCycle) updates.marketCycle = formData.marketCycle;
            if (formData.notes) updates.notes = formData.notes;

            if (Object.keys(updates).length === 0) {
                new Notice("没有修改");
                onClose();
                return;
            }

            // 执行更新
            const result = await actionService.updateTrade(trade.path, updates, {
                dryRun: false,
                validate: true,
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
                    maxWidth: "600px",
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

                {/* 表单内容 */}
                <div style={{ padding: "20px" }}>
                    {/* 文件信息 */}
                    <div style={{ marginBottom: "20px", padding: "12px", background: "var(--background-secondary)", borderRadius: "6px" }}>
                        <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>📄 {trade.path?.split('/').pop()}</div>
                        <div style={{ fontSize: "11px", color: "var(--text-faint)", marginTop: "4px" }}>📅 {trade.dateIso}</div>
                    </div>

                    {/* 按照单笔交易模版顺序 */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
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

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
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

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
                        <div style={fieldGroupStyle}>
                            <label style={labelStyle}>方向/direction</label>
                            <select value={formData.direction} onChange={(e) => handleChange("direction", e.target.value)} style={inputStyle}>
                                <option value="">没有值</option>
                                {enumPresets?.getCanonicalValues("direction").map((val) => (
                                    <option key={val} value={val}>{val}</option>
                                ))}
                            </select>
                        </div>

                        <div style={fieldGroupStyle}>
                            <label style={labelStyle}>设置类别/setup_category</label>
                            <select value={formData.setupCategory} onChange={(e) => handleChange("setupCategory", e.target.value)} style={inputStyle}>
                                <option value="">没有值</option>
                                {enumPresets?.getCanonicalValues("setup_category").map((val) => (
                                    <option key={val} value={val}>{val}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
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

                    {/* 净利润与结果 */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
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

                    {/* 备注 */}
                    <div style={fieldGroupStyle}>
                        <label style={labelStyle}>备注</label>
                        <textarea
                            value={formData.notes}
                            onChange={(e) => handleChange("notes", e.target.value)}
                            placeholder="输入备注..."
                            rows={3}
                            style={{
                                ...inputStyle,
                                resize: "vertical",
                                fontFamily: "inherit",
                            }}
                        />
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
