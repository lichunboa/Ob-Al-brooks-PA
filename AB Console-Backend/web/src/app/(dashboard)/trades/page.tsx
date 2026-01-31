'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  TrendingUp, TrendingDown, RefreshCw, Plus, 
  Calendar, DollarSign, Target, AlertCircle
} from 'lucide-react';
import { syncApi } from '@/lib/syncApi';

// Sync Service 的交易数据格式
interface TradeRecord {
  id: string;
  trade_date: string;
  symbol: string;
  direction: 'long' | 'short';
  entry_price: number;
  exit_price?: number;
  result?: 'win' | 'loss' | 'breakeven';
  pnl_r?: number;
  pnl_money?: number;
  strategy_name?: string;
  setup_key?: string;
  note_path?: string;
  note_title?: string;
  tags?: string[];
}

interface TradeStats {
  total_trades: number;
  win_count: number;
  loss_count: number;
  breakeven_count: number;
  win_rate: number | string;
  total_pnl_r: number | string;
  total_pnl_money: number | string;
  avg_pnl_r: number | string;
}

export default function TradesPage() {
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [stats, setStats] = useState<TradeStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchTrades = useCallback(async () => {
    setIsLoading(true);
    try {
      // 从 sync-service 获取数据
      const [tradesData, statsData] = await Promise.all([
        syncApi.getRecentTrades(100),
        syncApi.getTradeStats()
      ]);
      
      setTrades(tradesData);
      setStats(statsData);
    } catch (e) {
      console.error('获取交易数据失败:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('zh-CN');
  };

  const getResultColor = (result?: string) => {
    switch (result) {
      case 'win': return 'text-green-400';
      case 'loss': return 'text-red-400';
      default: return 'text-slate-400';
    }
  };

  const getResultBg = (result?: string) => {
    switch (result) {
      case 'win': return 'bg-green-600/20';
      case 'loss': return 'bg-red-600/20';
      default: return 'bg-slate-600/20';
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-white">交易记录</h2>
          <p className="text-sm text-slate-400">从 Sync Service 同步的交易数据</p>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={fetchTrades}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      {stats && (
        <div className="grid grid-cols-5 gap-4 mb-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-500">总交易</div>
            <div className="text-2xl font-bold text-white">{stats.total_trades}</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-500">胜率</div>
            <div className={`text-2xl font-bold ${parseFloat(String(stats.win_rate)) >= 50 ? 'text-green-400' : 'text-red-400'}`}>
              {parseFloat(String(stats.win_rate)).toFixed(1)}%
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-500">总盈亏 (R)</div>
            <div className={`text-2xl font-bold ${parseFloat(String(stats.total_pnl_r)) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {parseFloat(String(stats.total_pnl_r)) > 0 ? '+' : ''}{parseFloat(String(stats.total_pnl_r)).toFixed(2)}
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-500">总盈亏 ($)</div>
            <div className={`text-2xl font-bold ${parseFloat(String(stats.total_pnl_money)) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {parseFloat(String(stats.total_pnl_money)) > 0 ? '+' : ''}${parseFloat(String(stats.total_pnl_money)).toFixed(0)}
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-500">平均盈亏 (R)</div>
            <div className={`text-2xl font-bold ${parseFloat(String(stats.avg_pnl_r)) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {parseFloat(String(stats.avg_pnl_r)) > 0 ? '+' : ''}{parseFloat(String(stats.avg_pnl_r)).toFixed(2)}
            </div>
          </div>
        </div>
      )}

      {/* 交易列表 */}
      <div className="flex-1 overflow-auto">
        {trades.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <AlertCircle className="w-12 h-12 mb-4 opacity-30" />
            <p>暂无交易记录</p>
            <p className="text-sm mt-2">请在 Obsidian 中点击"同步"按钮导入交易数据</p>
          </div>
        ) : (
          <div className="space-y-2">
            {trades.map((trade) => (
              <div
                key={trade.id}
                className="p-4 rounded-xl border bg-slate-900/50 border-slate-800 hover:border-slate-700"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {/* 方向图标 */}
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      trade.direction === 'long' ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'
                    }`}>
                      {trade.direction === 'long' ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                    </div>
                    
                    {/* 交易信息 */}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{trade.symbol}</span>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          trade.direction === 'long' ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'
                        }`}>
                          {trade.direction === 'long' ? '做多' : '做空'}
                        </span>
                        {trade.result && (
                          <span className={`text-xs px-2 py-0.5 rounded ${getResultBg(trade.result)} ${getResultColor(trade.result)}`}>
                            {trade.result === 'win' ? '✓ 盈利' : trade.result === 'loss' ? '✗ 亏损' : '− 持平'}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-slate-400">
                        {formatDate(trade.trade_date)} 
                        {trade.strategy_name && ` · ${trade.strategy_name}`}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        入场: ${trade.entry_price} 
                        {trade.exit_price && ` → 出场: $${trade.exit_price}`}
                      </div>
                    </div>
                  </div>

                  {/* 盈亏显示 */}
                  <div className="text-right">
                    {trade.pnl_r !== undefined && (
                      <div className={`text-lg font-bold ${parseFloat(String(trade.pnl_r)) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {parseFloat(String(trade.pnl_r)) > 0 ? '+' : ''}{parseFloat(String(trade.pnl_r)).toFixed(2)} R
                      </div>
                    )}
                    {trade.pnl_money !== undefined && (
                      <div className={`text-sm ${parseFloat(String(trade.pnl_money)) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {parseFloat(String(trade.pnl_money)) > 0 ? '+' : ''}${parseFloat(String(trade.pnl_money)).toFixed(0)}
                      </div>
                    )}
                  </div>
                </div>
                
                {/* 笔记路径 */}
                {trade.note_path && (
                  <div className="mt-2 pt-2 border-t border-slate-800">
                    <span className="text-xs text-slate-500">{trade.note_path}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部信息 */}
      <div className="mt-4 pt-4 border-t border-slate-800 text-xs text-slate-500 flex justify-between">
        <span>数据来源: Sync Service (localhost:8089)</span>
        <span>共 {trades.length} 条记录</span>
      </div>
    </div>
  );
}
