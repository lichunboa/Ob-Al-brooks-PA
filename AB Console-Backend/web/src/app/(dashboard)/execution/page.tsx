'use client';

import { useState } from 'react';
import { useExecutionData } from '@/hooks/useExecutionData';
import { TradingControl, BotAllocations, ThresholdConfig, ReconciliationPanel, BotDetailPanel, PatrolPanel } from '@/components/execution';
import type { BotAllocation } from '@/components/execution';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Shield,
  AlertTriangle,
  RefreshCw,
  Settings,
  Eye,
  EyeOff,
  Save,
  CheckCircle,
  XCircle,
  Crosshair,
  X,
} from 'lucide-react';
import * as api from '@/lib/executionApi';

export default function ExecutionPage() {
  const {
    isConnected,
    isLoading,
    error,
    health,
    balance,
    positions,
    riskStatus,
    config,
    tradingStatus,
    refresh,
    toggleTrading,
    syncFromBinance,
    updateAllocation,
  } = useExecutionData();

  const [showConfigForm, setShowConfigForm] = useState(false);
  const [configForm, setConfigForm] = useState({
    mode: 'demo',
    api_key: '',
    api_secret: '',
    max_daily_loss: 100,
    max_position_size: 50,
    max_leverage: 5,
  });
  const [showSecrets, setShowSecrets] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const handleSaveConfig = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const result = await api.updateConfig(configForm);
      setSaveMessage(result.message);
      setShowConfigForm(false);
      setTimeout(() => setSaveMessage(null), 5000);
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleEmergencyStop = async (enabled: boolean) => {
    try {
      await api.setEmergencyStop(enabled);
      refresh();
    } catch (err) {
      console.error('设置紧急停止失败:', err);
    }
  };

  const handleToggleTrading = async (enabled: boolean) => {
    await toggleTrading(enabled);
  };

  const handleSync = async () => {
    await syncFromBinance();
  };

  const handleUpdateAllocation = async (botId: string, data: Partial<BotAllocation>) => {
    await updateAllocation(botId, data);
  };

  const usdt = balance.find((b) => b.asset === 'USDT');

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Wallet className="w-8 h-8" />
            交易执行
          </h1>
          <p className="text-slate-400 mt-1">
            币安 Demo Trading · V3.0
          </p>
        </div>
        <button
          onClick={() => refresh()}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {/* Connection Status */}
      <div
        className={`rounded-xl border p-4 ${
          isConnected
            ? 'bg-green-900/20 border-green-800/50'
            : 'bg-red-900/20 border-red-800/50'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-3 h-3 rounded-full ${
                isConnected ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            <span className={isConnected ? 'text-green-300' : 'text-red-300'}>
              {isConnected
                ? `已连接 - ${health?.mode === 'demo' ? 'Demo Trading' : health?.mode === 'testnet' ? '测试网' : '主网'}`
                : '未连接'}
            </span>
            {health?.version && (
              <span className="text-slate-500 text-sm">v{health.version}</span>
            )}
          </div>
          {error && <span className="text-red-400 text-sm">{error}</span>}
        </div>
      </div>

      {/* Save Message */}
      {saveMessage && (
        <div className="bg-blue-900/20 border border-blue-800/50 rounded-xl p-4">
          <p className="text-blue-300">{saveMessage}</p>
        </div>
      )}

      {/* Trading Control & Bot Allocations */}
      {isConnected && tradingStatus && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TradingControl
              tradingEnabled={tradingStatus.trading_enabled}
              lastSync={tradingStatus.last_sync}
              binanceBalance={tradingStatus.binance_balance}
              binanceAvailable={tradingStatus.binance_available}
              unrealizedPnl={tradingStatus.total_unrealized_pnl}
              onToggle={handleToggleTrading}
              onSync={handleSync}
              isLoading={isLoading}
            />
            <BotAllocations
              allocations={tradingStatus.allocations}
              totalBalance={tradingStatus.binance_balance}
              onUpdate={handleUpdateAllocation}
              isLoading={isLoading}
            />
          </div>

          {/* Bot Detail Panels - 默认全部展开 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {Object.keys(tradingStatus.allocations).map((botId) => (
              <BotDetailPanel key={botId} botId={botId} onClose={() => {}} />
            ))}
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Balance Card */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">账户余额</h3>
            <Wallet className="w-5 h-5 text-slate-500" />
          </div>
          {isConnected && usdt ? (
            <div className="space-y-4">
              <div>
                <p className="text-slate-400 text-sm">总余额</p>
                <p className="text-3xl font-bold text-white">
                  ${usdt.balance.toFixed(2)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-slate-400 text-xs">可用</p>
                  <p className="text-lg font-semibold text-green-400">
                    ${usdt.available.toFixed(2)}
                  </p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-slate-400 text-xs">未实现盈亏</p>
                  <p
                    className={`text-lg font-semibold ${
                      usdt.unrealized_pnl >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {usdt.unrealized_pnl >= 0 ? '+' : ''}
                    ${usdt.unrealized_pnl.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-slate-500">
              {isLoading ? '加载中...' : '未连接或无数据'}
            </p>
          )}
        </div>

        {/* Risk Status Card */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">风控状态</h3>
            <Shield className="w-5 h-5 text-slate-500" />
          </div>
          {isConnected && riskStatus ? (
            <div className="space-y-4">
              {/* Emergency Stop */}
              <div
                className={`flex items-center justify-between p-3 rounded-lg ${
                  riskStatus.emergency_stop
                    ? 'bg-red-900/30 border border-red-800'
                    : 'bg-slate-800/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle
                    className={`w-5 h-5 ${
                      riskStatus.emergency_stop ? 'text-red-400' : 'text-slate-500'
                    }`}
                  />
                  <span
                    className={
                      riskStatus.emergency_stop ? 'text-red-400' : 'text-slate-300'
                    }
                  >
                    紧急停止
                  </span>
                </div>
                <button
                  onClick={() => handleEmergencyStop(!riskStatus.emergency_stop)}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    riskStatus.emergency_stop
                      ? 'bg-green-600 hover:bg-green-500 text-white'
                      : 'bg-red-600 hover:bg-red-500 text-white'
                  }`}
                >
                  {riskStatus.emergency_stop ? '解除' : '启用'}
                </button>
              </div>

              {/* Daily PnL */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-slate-400 text-xs">今日盈亏</p>
                  <p
                    className={`text-lg font-semibold ${
                      riskStatus.daily_pnl >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {riskStatus.daily_pnl >= 0 ? '+' : ''}$
                    {riskStatus.daily_pnl.toFixed(2)}
                  </p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-slate-400 text-xs">剩余额度</p>
                  <p className="text-lg font-semibold text-white">
                    ${riskStatus.remaining_loss_budget.toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Can Open */}
              <div className="flex items-center gap-2 text-sm">
                {riskStatus.can_open_new_position ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-green-400">可以开新仓</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-red-400" />
                    <span className="text-red-400">禁止开新仓</span>
                  </>
                )}
              </div>
            </div>
          ) : (
            <p className="text-slate-500">
              {isLoading ? '加载中...' : '未连接或无数据'}
            </p>
          )}
        </div>

        {/* Config Card */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">API 配置</h3>
            <Settings className="w-5 h-5 text-slate-500" />
          </div>
          {config ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-slate-400 text-xs">模式</p>
                  <p
                    className={`text-lg font-semibold ${
                      config.mode === 'demo'
                        ? 'text-blue-400'
                        : config.mode === 'testnet'
                        ? 'text-yellow-400'
                        : 'text-green-400'
                    }`}
                  >
                    {config.mode === 'demo' ? 'Demo' : config.mode === 'testnet' ? '测试网' : '主网'}
                  </p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-slate-400 text-xs">最大杠杆</p>
                  <p className="text-lg font-semibold text-white">
                    {config.max_leverage}x
                  </p>
                </div>
              </div>

              <div className="bg-slate-800/50 rounded-lg p-3">
                <p className="text-slate-400 text-xs mb-1">API Key</p>
                <div className="flex items-center gap-2">
                  {config.api_key_configured ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-green-400" />
                      <span className="text-green-400 font-mono text-sm">
                        {config.api_key_preview}
                      </span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-red-400" />
                      <span className="text-red-400">未配置</span>
                    </>
                  )}
                </div>
              </div>

              <button
                onClick={() => setShowConfigForm(!showConfigForm)}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-medium transition-colors"
              >
                {showConfigForm ? '取消' : '修改配置'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-slate-500">
                {isLoading ? '加载中...' : '服务未连接'}
              </p>
              <button
                onClick={() => setShowConfigForm(!showConfigForm)}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-medium transition-colors"
              >
                配置 API Key
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Config Form */}
      {showConfigForm && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">配置 API</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 text-sm mb-1">模式</label>
              <select
                value={configForm.mode}
                onChange={(e) =>
                  setConfigForm({ ...configForm, mode: e.target.value })
                }
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
              >
                <option value="demo">Demo Trading</option>
                <option value="testnet">测试网 (Testnet)</option>
                <option value="mainnet">主网 (Mainnet)</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-400 text-sm mb-1">最大杠杆</label>
              <input
                type="number"
                value={configForm.max_leverage}
                onChange={(e) =>
                  setConfigForm({
                    ...configForm,
                    max_leverage: parseInt(e.target.value) || 5,
                  })
                }
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
              />
            </div>
            <div>
              <label className="block text-slate-400 text-sm mb-1">API Key</label>
              <div className="relative">
                <input
                  type={showSecrets ? 'text' : 'password'}
                  value={configForm.api_key}
                  onChange={(e) =>
                    setConfigForm({ ...configForm, api_key: e.target.value })
                  }
                  placeholder="输入 API Key"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowSecrets(!showSecrets)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showSecrets ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-slate-400 text-sm mb-1">API Secret</label>
              <input
                type={showSecrets ? 'text' : 'password'}
                value={configForm.api_secret}
                onChange={(e) =>
                  setConfigForm({ ...configForm, api_secret: e.target.value })
                }
                placeholder="输入 API Secret"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
              />
            </div>
            <div>
              <label className="block text-slate-400 text-sm mb-1">
                每日最大亏损 (USDT)
              </label>
              <input
                type="number"
                value={configForm.max_daily_loss}
                onChange={(e) =>
                  setConfigForm({
                    ...configForm,
                    max_daily_loss: parseFloat(e.target.value) || 100,
                  })
                }
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
              />
            </div>
            <div>
              <label className="block text-slate-400 text-sm mb-1">
                单笔最大仓位 (USDT)
              </label>
              <input
                type="number"
                value={configForm.max_position_size}
                onChange={(e) =>
                  setConfigForm({
                    ...configForm,
                    max_position_size: parseFloat(e.target.value) || 50,
                  })
                }
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-3">
            <button
              onClick={() => setShowConfigForm(false)}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSaveConfig}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-white font-medium transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? '保存中...' : '保存配置'}
            </button>
          </div>
          <p className="mt-3 text-slate-500 text-sm">
            注意：保存后需要重启 Execution Service 才能生效
          </p>
        </div>
      )}

      {/* Positions */}
      <PositionsTable
        positions={positions}
        isConnected={isConnected}
        isLoading={isLoading}
        onRefresh={() => refresh()}
      />

      {/* Patrol Panel */}
      {isConnected && <PatrolPanel />}

      {/* Info */}
      <div className="bg-blue-900/20 border border-blue-800/50 rounded-xl p-4">
        <p className="text-blue-300 text-sm">
          <span className="font-semibold">V3.0:</span> 持仓巡检（60s 周期）、名义价值控制、杠杆 10x、移动止损、启动自动设杠杆。
        </p>
      </div>

      {/* Threshold Config */}
      {isConnected && <ReconciliationPanel isLoading={isLoading} />}

      {isConnected && <ThresholdConfig isLoading={isLoading} />}
    </div>
  );
}

/* ========== PositionsTable 组件（V3.0: Bot 归属 + 修改止损 + 一键平仓） ========== */

const BOT_LABELS: Record<string, { emoji: string; name: string; color: string }> = {
  'al-brooks': { emoji: '🦁', name: 'PA', color: 'text-amber-400' },
  trader: { emoji: '📊', name: '量化', color: 'text-blue-400' },
  wyckoff: { emoji: '🔮', name: '威科夫', color: 'text-purple-400' },
};

function PositionsTable({
  positions,
  isConnected,
  isLoading,
  onRefresh,
}: {
  positions: api.Position[];
  isConnected: boolean;
  isLoading: boolean;
  onRefresh: () => void;
}) {
  const [closingAll, setClosingAll] = useState(false);
  const [slEdit, setSlEdit] = useState<{ symbol: string; price: string } | null>(null);
  const [slSaving, setSlSaving] = useState(false);

  const handleCloseAll = async () => {
    if (!confirm('确认一键平仓所有持仓？将同时取消所有挂单。')) return;
    setClosingAll(true);
    try {
      const result = await api.closeAllPositions();
      alert(`已平仓 ${result.total_closed} 笔${result.total_failed > 0 ? `，失败 ${result.total_failed} 笔` : ''}`);
      onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : '平仓失败');
    } finally {
      setClosingAll(false);
    }
  };

  const handleCloseOne = async (symbol: string) => {
    try {
      await api.closePosition(symbol);
      onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : '平仓失败');
    }
  };

  const handleModifySl = async () => {
    if (!slEdit) return;
    setSlSaving(true);
    try {
      await api.modifyStopLoss(slEdit.symbol, parseFloat(slEdit.price));
      setSlEdit(null);
      onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : '修改止损失败');
    } finally {
      setSlSaving(false);
    }
  };

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">当前持仓</h3>
        <div className="flex items-center gap-3">
          <span className="text-slate-500 text-sm">{positions.length} 个持仓</span>
          {positions.length > 0 && (
            <button
              onClick={handleCloseAll}
              disabled={closingAll}
              className="px-3 py-1 text-xs bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded border border-red-800/50 transition-colors disabled:opacity-50"
            >
              {closingAll ? '平仓中...' : '一键平仓'}
            </button>
          )}
        </div>
      </div>

      {/* 修改止损弹窗 */}
      {slEdit && (
        <div className="mb-4 p-3 bg-slate-800 rounded-lg border border-slate-700 flex items-center gap-3">
          <Crosshair className="w-4 h-4 text-yellow-400" />
          <span className="text-sm text-slate-300">修改 {slEdit.symbol} 止损:</span>
          <input
            type="number"
            value={slEdit.price}
            onChange={(e) => setSlEdit({ ...slEdit, price: e.target.value })}
            className="w-32 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-sm"
            step="0.01"
          />
          <button
            onClick={handleModifySl}
            disabled={slSaving}
            className="px-3 py-1 text-xs bg-yellow-900/30 text-yellow-400 rounded border border-yellow-800/50 disabled:opacity-50"
          >
            {slSaving ? '...' : '确认'}
          </button>
          <button onClick={() => setSlEdit(null)} className="text-slate-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {positions.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-slate-400 text-sm border-b border-slate-800">
                <th className="text-left py-2">Bot</th>
                <th className="text-left py-2">交易对</th>
                <th className="text-left py-2">方向</th>
                <th className="text-right py-2">数量</th>
                <th className="text-right py-2">入场价</th>
                <th className="text-right py-2">标记价</th>
                <th className="text-right py-2">未实现盈亏</th>
                <th className="text-right py-2">杠杆</th>
                <th className="text-right py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos) => {
                const botIds = pos.bot_ids || (pos.bot_id ? [pos.bot_id] : []);
                return (
                  <tr key={`${pos.symbol}-${pos.side}`} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="py-3">
                      {botIds.length > 0 ? (
                        <div className="flex gap-1">
                          {botIds.map((id) => {
                            const bot = BOT_LABELS[id];
                            return bot ? (
                              <span key={id} className={`text-xs ${bot.color}`} title={bot.name}>{bot.emoji}</span>
                            ) : null;
                          })}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-600">-</span>
                      )}
                    </td>
                    <td className="py-3 font-medium text-white">{pos.symbol}</td>
                    <td className="py-3">
                      <span className={`flex items-center gap-1 ${pos.side === 'LONG' ? 'text-green-400' : 'text-red-400'}`}>
                        {pos.side === 'LONG' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                        {pos.side === 'LONG' ? '做多' : '做空'}
                      </span>
                    </td>
                    <td className="py-3 text-right text-white">{pos.quantity}</td>
                    <td className="py-3 text-right text-slate-300">${pos.entry_price.toFixed(2)}</td>
                    <td className="py-3 text-right text-slate-300">${pos.mark_price.toFixed(2)}</td>
                    <td className={`py-3 text-right font-medium ${pos.unrealized_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {pos.unrealized_pnl >= 0 ? '+' : ''}${pos.unrealized_pnl.toFixed(2)}
                    </td>
                    <td className="py-3 text-right text-slate-300">{pos.leverage}x</td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setSlEdit({ symbol: pos.symbol, price: pos.entry_price.toFixed(2) })}
                          className="px-2 py-0.5 text-xs text-yellow-400 hover:bg-yellow-900/20 rounded"
                          title="修改止损"
                        >
                          SL
                        </button>
                        <button
                          onClick={() => handleCloseOne(pos.symbol)}
                          className="px-2 py-0.5 text-xs text-red-400 hover:bg-red-900/20 rounded"
                          title="平仓"
                        >
                          平仓
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-slate-500 text-center py-8">
          {isConnected ? '暂无持仓' : '未连接到服务'}
        </p>
      )}
    </div>
  );
}
