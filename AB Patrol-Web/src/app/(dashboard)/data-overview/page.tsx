'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Database, TrendingUp, TrendingDown, RefreshCw,
  FileText, Layers, BarChart3, Activity, Wallet,
  CircleDollarSign, LineChart
} from 'lucide-react';
import { syncApi, TradeStats, AccountStats, StrategyPerformance, TradeRecord } from '@/lib/syncApi';

export default function DataOverviewPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [tradeStats, setTradeStats] = useState<TradeStats | null>(null);
  const [accountStats, setAccountStats] = useState<{ Live: AccountStats; Demo: AccountStats; Backtest: AccountStats; All: AccountStats } | null>(null);
  const [strategies, setStrategies] = useState<StrategyPerformance[]>([]);
  const [recentTrades, setRecentTrades] = useState<TradeRecord[]>([]);
  const [syncStatus, setSyncStatus] = useState<any>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchAllData = useCallback(async () => {
    setIsLoading(true);
    try {
      const health = await syncApi.checkHealth();
      const connected = health.status === 'healthy';
      setIsConnected(connected);

      if (connected) {
        const [status, stats, accStats, strategyList, trades] = await Promise.allSettled([
          syncApi.getStatus(),
          syncApi.getTradeStats(),
          syncApi.getAccountStats(),
          syncApi.getStrategyPerformance(),
          syncApi.getRecentTrades(20)
        ]);

        if (status.status === 'fulfilled') setSyncStatus(status.value);
        if (stats.status === 'fulfilled') setTradeStats(stats.value);
        if (accStats.status === 'fulfilled') setAccountStats(accStats.value);
        if (strategyList.status === 'fulfilled') setStrategies(strategyList.value);
        if (trades.status === 'fulfilled') setRecentTrades(trades.value);

        setLastUpdate(new Date());
      }
    } catch (e) {
      console.error('获取数据失败:', e);
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, 30000);
    return () => clearInterval(interval);
  }, [fetchAllData]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '从未';
    return new Date(dateStr).toLocaleString('zh-CN');
  };

  // 账户卡片组件
  const AccountCard = ({ type, stats, color }: { type: string; stats: AccountStats; color: string }) => {
    const pnl = parseFloat(String(stats.total_pnl_money || 0));
    const winRate = parseFloat(String(stats.win_rate || 0));
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <span className={`text-sm font-medium ${color}`}>{type}</span>
          <span className="text-xs px-2 py-1 bg-slate-800 rounded text-slate-400">
            {stats.total_trades} 笔
          </span>
        </div>
        <div className={`text-3xl font-bold ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
        </div>
        <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
          <span className={winRate >= 50 ? 'text-green-400' : 'text-red-400'}>
            {winRate}% 胜率
          </span>
          <span>{stats.win_count}胜 {stats.loss_count}负</span>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full overflow-auto">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">数据总览</h2>
          <p className="text-sm text-slate-400">
            Sync Service 收集的所有交易数据
            {lastUpdate && ` · 更新于 ${lastUpdate.toLocaleTimeString()}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
            (isConnected || tradeStats) ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'
          }`}>
            <div className={`w-2 h-2 rounded-full ${(isConnected || tradeStats) ? 'bg-green-400' : 'bg-red-400'}`} />
            {(isConnected || tradeStats) ? '已连接' : '未连接'}
          </div>

          <button
            onClick={fetchAllData}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </div>

      {!isConnected && !tradeStats ? (
        <div className="flex flex-col items-center justify-center h-64 text-slate-500">
          <Activity className="w-12 h-12 mb-4 opacity-30" />
          <p>无法连接到 Sync Service</p>
          <p className="text-sm mt-2">请确保服务运行在 localhost:8089</p>
        </div>
      ) : (
        <>
          {/* 账户资金概览 */}
          {accountStats && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
                <Wallet className="w-4 h-4" />
                账户资金概览
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <AccountCard type="实盘账户" stats={accountStats.Live} color="text-green-400" />
                <AccountCard type="模拟盘" stats={accountStats.Demo} color="text-blue-400" />
                <AccountCard type="复盘回测" stats={accountStats.Backtest} color="text-orange-400" />
              </div>
            </div>
          )}

          {/* 数据概览卡片 */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 text-sm">总交易数</span>
                <FileText className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-3xl font-bold text-white">{tradeStats?.total_trades || 0}</div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 text-sm">策略数量</span>
                <Layers className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-3xl font-bold text-white">{strategies.length}</div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 text-sm">胜率</span>
                <BarChart3 className="w-4 h-4 text-green-400" />
              </div>
              <div className={`text-3xl font-bold ${parseFloat(String(tradeStats?.win_rate || 0)) >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                {parseFloat(String(tradeStats?.win_rate || 0)).toFixed(1)}%
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 text-sm">总盈亏 (R)</span>
                <Database className="w-4 h-4 text-yellow-400" />
              </div>
              <div className={`text-3xl font-bold ${parseFloat(String(tradeStats?.total_pnl_r || 0)) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {parseFloat(String(tradeStats?.total_pnl_r || 0)) > 0 ? '+' : ''}{parseFloat(String(tradeStats?.total_pnl_r || 0)).toFixed(2)}
              </div>
            </div>
          </div>

          {/* 策略筛选 */}
          {strategies.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6">
              <h3 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
                <LineChart className="w-4 h-4" />
                策略筛选 ({strategies.length} 个)
              </h3>
              <div className="flex flex-wrap gap-2">
                {strategies.map((strategy) => (
                  <div
                    key={strategy.strategy_name}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-lg text-sm"
                  >
                    <span className="text-white">{strategy.strategy_name}</span>
                    <span className="text-slate-500">{strategy.trade_count} 笔</span>
                    <span className={strategy.total_pnl_r >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {strategy.total_pnl_r >= 0 ? '+' : ''}{parseFloat(String(strategy.total_pnl_r)).toFixed(0)}$
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 详细统计 */}
          <div className="grid grid-cols-2 gap-6 mb-6">
            {/* 交易统计详情 */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h3 className="font-semibold text-white mb-4">交易统计</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-slate-800">
                  <span className="text-slate-400">盈利交易</span>
                  <span className="text-green-400 font-medium">{tradeStats?.win_count || 0}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-800">
                  <span className="text-slate-400">亏损交易</span>
                  <span className="text-red-400 font-medium">{tradeStats?.loss_count || 0}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-800">
                  <span className="text-slate-400">持平交易</span>
                  <span className="text-slate-400 font-medium">{tradeStats?.breakeven_count || 0}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-800">
                  <span className="text-slate-400">平均盈亏 (R)</span>
                  <span className={`font-medium ${parseFloat(String(tradeStats?.avg_pnl_r || 0)) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {parseFloat(String(tradeStats?.avg_pnl_r || 0)).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-slate-400">总盈亏 ($)</span>
                  <span className={`font-medium ${parseFloat(String(tradeStats?.total_pnl_money || 0)) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {parseFloat(String(tradeStats?.total_pnl_money || 0)) > 0 ? '+' : ''}${parseFloat(String(tradeStats?.total_pnl_money || 0)).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* 同步状态 */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h3 className="font-semibold text-white mb-4">同步状态</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-slate-800">
                  <span className="text-slate-400">服务状态</span>
                  <span className="text-green-400 font-medium">{syncStatus?.status || '未知'}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-800">
                  <span className="text-slate-400">总交易数</span>
                  <span className="text-white font-medium">{syncStatus?.stats?.total_trades || 0}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-800">
                  <span className="text-slate-400">总策略数</span>
                  <span className="text-white font-medium">{syncStatus?.stats?.total_strategies || 0}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-800">
                  <span className="text-slate-400">上次交易同步</span>
                  <span className="text-slate-300 text-sm">{formatDate(syncStatus?.last_sync?.trades)}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-slate-400">上次策略同步</span>
                  <span className="text-slate-300 text-sm">{formatDate(syncStatus?.last_sync?.strategies)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 最近交易 */}
          {recentTrades.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h3 className="font-semibold text-white mb-4">最近交易</h3>
              <div className="space-y-2">
                {recentTrades.map((trade) => (
                  <div key={trade.id} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        trade.direction === 'long' ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'
                      }`}>
                        {trade.direction === 'long' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium">{trade.symbol}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            trade.direction === 'long' ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'
                          }`}>
                            {trade.direction === 'long' ? '多' : '空'}
                          </span>
                          {trade.account_type && (
                            <span className={`text-xs ${
                              trade.account_type === 'Live' ? 'text-green-400' :
                              trade.account_type === 'Demo' ? 'text-blue-400' : 'text-orange-400'
                            }`}>
                              {trade.account_type === 'Live' ? '实盘' : trade.account_type === 'Demo' ? '模拟' : '回测'}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">
                          {formatDate(trade.trade_date)} · {trade.strategy_name || '无策略'}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      {trade.pnl_r !== undefined && (
                        <div className={`font-medium ${parseFloat(String(trade.pnl_r)) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {parseFloat(String(trade.pnl_r)) > 0 ? '+' : ''}{parseFloat(String(trade.pnl_r)).toFixed(2)} R
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
