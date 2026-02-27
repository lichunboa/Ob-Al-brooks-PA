'use client';

import { useExecutionContext } from '@/contexts/ExecutionContext';
import {
  TradingControl,
  BotAllocations,
  BotDetailPanel,
} from '@/components/execution';
import type { BotAllocation } from '@/components/execution';

export default function ExecutionPage() {
  const {
    isConnected,
    isLoading,
    tradingStatus,
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
