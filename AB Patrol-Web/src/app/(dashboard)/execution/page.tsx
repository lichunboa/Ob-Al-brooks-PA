'use client';

import { useExecutionContext } from '@/contexts/ExecutionContext';
import {
  TradingControl,
  BotAllocations,
  BotDetailPanel,
} from '@/components/execution';
import type { BotAllocation } from '@/components/execution';
import type { ExecutionAccountOverview } from '@/lib/executionApi';

export default function ExecutionPage() {
  const {
    isConnected,
    isLoading,
    tradingStatus,
    accountsOverview,
    botSummaries,
    botEvolutions,
    refresh,
    toggleTrading,
    syncFromBinance,
    updateAllocation,
  } = useExecutionContext();

  const handleToggleTrading = async (enabled: boolean) => {
    await toggleTrading(enabled);
  };
  const handleSync = async () => {
    await syncFromBinance();
  };
  const handleUpdateAllocation = async (botId: string, data: Partial<BotAllocation>) => {
    await updateAllocation(botId, data);
  };

  return (
    <>
      {/* Trading Control + Bot Allocations + Bot Detail Panels */}
      {isConnected && tradingStatus && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TradingControl
              tradingEnabled={tradingStatus.trading_enabled}
              lastSync={tradingStatus.last_sync}
              totalBalance={tradingStatus.account_balance ?? tradingStatus.binance_balance}
              availableBalance={tradingStatus.account_available ?? tradingStatus.binance_available}
              unrealizedPnl={tradingStatus.total_unrealized_pnl}
              accountAsset={tradingStatus.account_asset ?? 'USDT'}
              exchangeLabel={tradingStatus.exchange === 'ctrader' ? 'cTrader Demo' : '交易主栈'}
              onToggle={handleToggleTrading}
              onSync={handleSync}
              isLoading={isLoading}
            />
            <BotAllocations
              allocations={tradingStatus.allocations}
              totalBalance={tradingStatus.account_balance ?? tradingStatus.binance_balance}
              onUpdate={handleUpdateAllocation}
              isLoading={isLoading}
            />
          </div>
          {accountsOverview && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <AccountSnapshotCard account={accountsOverview.primary} />
              {accountsOverview.secondary ? (
                <AccountSnapshotCard account={accountsOverview.secondary} />
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                  <p className="text-white font-medium mb-2">Binance Demo</p>
                  <p className="text-sm text-slate-400">
                    尚未连通 `8094` 侧车执行服务。页面已经支持双账户展示，启动 Binance demo 实例后这里会自动出现余额、持仓和交易开关状态。
                  </p>
                </div>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {Object.keys(tradingStatus.allocations).map((botId) => (
              <BotDetailPanel
                key={botId}
                botId={botId}
                summary={botSummaries[botId] ?? null}
                evolution={botEvolutions[botId] ?? null}
              />
            ))}
          </div>
        </div>
      )}

      {/* V3.0 Info */}
      <div className="bg-blue-900/20 border border-blue-800/50 rounded-xl p-4">
        <p className="text-blue-300 text-sm">
          <span className="font-semibold">V3.0:</span> 持仓巡检（60s 周期）、名义价值控制、杠杆 10x、移动止损、启动自动设杠杆。
        </p>
      </div>
    </>
  );
}

function AccountSnapshotCard({ account }: { account: ExecutionAccountOverview }) {
  const tradingStatus = account.trading_status;
  const primaryBalance = account.balance[0];
  const totalBalance =
    tradingStatus?.account_balance ??
    tradingStatus?.binance_balance ??
    primaryBalance?.balance ??
    0;
  const availableBalance =
    tradingStatus?.account_available ??
    tradingStatus?.binance_available ??
    primaryBalance?.available ??
    0;
  const asset = tradingStatus?.account_asset ?? account.health?.account_asset ?? primaryBalance?.asset ?? 'USDT';
  const exchange = account.health?.exchange ?? tradingStatus?.exchange ?? '-';
  const mode = account.health?.mode ?? '-';
  const allocations = tradingStatus?.allocations ?? {};
  const enabledBots = Object.values(allocations).filter((item) => item.enabled);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-white font-semibold">{account.label}</p>
          <p className="text-sm text-slate-400">{exchange} · {mode}</p>
        </div>
        <span
          className={`px-2.5 py-1 rounded-full text-xs font-medium ${
            account.healthy ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
          }`}
        >
          {account.healthy ? '在线' : '离线'}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-slate-800/60 p-3">
          <p className="text-xs text-slate-500 mb-1">总余额</p>
          <p className="text-sm font-medium text-white">{asset} {totalBalance.toFixed(2)}</p>
        </div>
        <div className="rounded-lg bg-slate-800/60 p-3">
          <p className="text-xs text-slate-500 mb-1">可用</p>
          <p className="text-sm font-medium text-green-400">{asset} {availableBalance.toFixed(2)}</p>
        </div>
        <div className="rounded-lg bg-slate-800/60 p-3">
          <p className="text-xs text-slate-500 mb-1">持仓数</p>
          <p className="text-sm font-medium text-slate-200">{account.positions.length}</p>
        </div>
      </div>
      <div className="text-xs text-slate-500">
        交易开关: {tradingStatus?.trading_enabled ? '开启' : '关闭'} ·
        账户地址: {account.base_url}
      </div>
      {enabledBots.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500 uppercase tracking-wider">启用 Bot</p>
          <div className="space-y-2">
            {enabledBots.map((bot) => (
              <div key={bot.bot_id} className="rounded-lg bg-slate-800/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-white">{bot.name}</p>
                  <span className="text-xs text-slate-400">
                    风险 {bot.risk_percent}% · 成本 {bot.max_cost_pct_per_order ?? 1}%
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {bot.allowed_symbols.join(' / ')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
      {account.positions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500 uppercase tracking-wider">当前持仓</p>
          <div className="space-y-2">
            {account.positions.map((position) => (
              <div key={`${account.key}-${position.symbol}-${position.side}`} className="rounded-lg bg-slate-800/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-white">
                    {position.symbol} · {position.side}
                  </p>
                  <span className={position.unrealized_pnl >= 0 ? 'text-xs text-green-400' : 'text-xs text-red-400'}>
                    {position.unrealized_pnl >= 0 ? '+' : ''}{position.unrealized_pnl.toFixed(2)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  数量 {position.quantity} · 开仓 {position.entry_price} · 现价 {position.mark_price}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
