'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  TrendingUp, TrendingDown, RefreshCw, Plus, X, 
  Calendar, DollarSign, Target, AlertCircle, ExternalLink
} from 'lucide-react';

interface Trade {
  id: string;
  date: string;
  ticker: string;
  direction: string;
  entry_price: number;
  exit_price: number;
  stop_loss: number;
  take_profit: number;
  position_size: number;
  pnl: number;
  pnl_percent: number;
  strategy: string;
  timeframe: string;
  market_cycle: string;
  setup_quality: string;
  execution_quality: string;
  file_path: string;
}

interface TradeStats {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  total_pnl: number;
  avg_pnl: number;
}

export default function TradesPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [stats, setStats] = useState<TradeStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  
  const [newTrade, setNewTrade] = useState({
    date: new Date().toISOString().split('T')[0],
    ticker: 'BTCUSDT',
    direction: 'Long',
    entry_price: '',
    exit_price: '',
    stop_loss: '',
    take_profit: '',
    position_size: '10',
    strategy: '',
    timeframe: '5m',
    lessons: ''
  });

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8088';

  const fetchTrades = useCallback(async () => {
    setIsLoading(true);
    try {
      const [tradesRes, statsRes] = await Promise.all([
        fetch(`${apiUrl}/api/v1/trades`),
        fetch(`${apiUrl}/api/v1/trades/stats`)
      ]);
      
      if (tradesRes.ok) {
        const data = await tradesRes.json();
        setTrades(data.trades || []);
      }
      
      if (statsRes.ok) {
        setStats(await statsRes.json());
      }
    } catch (e) {
      console.error('Failed:', e);
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl]);

  const createTrade = async () => {
    if (!newTrade.ticker || !newTrade.entry_price || !newTrade.exit_price) {
      alert('请填写完整信息');
      return;
    }
    
    setIsCreating(true);
    try {
      const entryPrice = parseFloat(newTrade.entry_price);
      const exitPrice = parseFloat(newTrade.exit_price);
      const pnl = (exitPrice - entryPrice) * (newTrade.direction === 'Long' ? 1 : -1);
      
      const trade = {
        ...newTrade,
        entry_price: entryPrice,
        exit_price: exitPrice,
        stop_loss: newTrade.stop_loss ? parseFloat(newTrade.stop_loss) : 0,
        take_profit: newTrade.take_profit ? parseFloat(newTrade.take_profit) : 0,
        position_size: parseFloat(newTrade.position_size),
        pnl: pnl,
        pnl_percent: (pnl / entryPrice) * 100
      };
      
      const res = await fetch(`${apiUrl}/api/v1/trades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trade })
      });
      
      if (res.ok) {
        alert('交易记录创建成功！');
        setShowCreateModal(false);
        await fetchTrades();
      } else {
        const err = await res.json();
        alert(`创建失败: ${err.error}`);
      }
    } catch (e) {
      alert('网络错误');
    } finally {
      setIsCreating(false);
    }
  };

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('zh-CN');
  };

  return (
    <div className="h-full flex flex-col">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-white">交易记录</h2>
          <p className="text-sm text-slate-400">所有交易自动同步到 Obsidian</p>
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
          <button 
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-sm rounded-lg"
          >
            <Plus className="w-4 h-4" />
            新建交易
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-500">总交易</div>
            <div className="text-2xl font-bold text-white">{stats.total_trades}</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-500">胜率</div>
            <div className="text-2xl font-bold text-green-400">{stats.win_rate.toFixed(1)}%</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-500">总盈亏</div>
            <div className={`text-2xl font-bold ${stats.total_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              ${stats.total_pnl.toFixed(0)}
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-500">平均盈亏</div>
            <div className={`text-2xl font-bold ${stats.avg_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              ${stats.avg_pnl.toFixed(0)}
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
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      trade.direction === 'Long' ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'
                    }`}>
                      {trade.direction === 'Long' ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                    </div>
                    
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{trade.ticker}</span>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          trade.direction === 'Long' ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'
                        }`}>
                          {trade.direction === 'Long' ? '做多' : '做空'}
                        </span>
                      </div>
                      <div className="text-sm text-slate-400">
                        {formatDate(trade.date)} · {trade.timeframe}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className={`text-lg font-bold ${trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(0)}
                    </div>
                    <div className={`text-sm ${trade.pnl_percent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {trade.pnl_percent >= 0 ? '+' : ''}{trade.pnl_percent.toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 创建交易弹窗 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-md">
            <h3 className="font-bold text-white mb-4">新建交易记录</h3>
            
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="date"
                  value={newTrade.date}
                  onChange={(e) => setNewTrade({ ...newTrade, date: e.target.value })}
                  className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                />
                <select
                  value={newTrade.ticker}
                  onChange={(e) => setNewTrade({ ...newTrade, ticker: e.target.value })}
                  className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                >
                  <option value="BTCUSDT">BTCUSDT</option>
                  <option value="ETHUSDT">ETHUSDT</option>
                  <option value="SOLUSDT">SOLUSDT</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <select
                  value={newTrade.direction}
                  onChange={(e) => setNewTrade({ ...newTrade, direction: e.target.value })}
                  className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                >
                  <option value="Long">做多</option>
                  <option value="Short">做空</option>
                </select>
                <input
                  type="number"
                  placeholder="入场价"
                  value={newTrade.entry_price}
                  onChange={(e) => setNewTrade({ ...newTrade, entry_price: e.target.value })}
                  className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                />
              </div>

              <input
                type="number"
                placeholder="出场价"
                value={newTrade.exit_price}
                onChange={(e) => setNewTrade({ ...newTrade, exit_price: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
              />

              <input
                type="text"
                placeholder="策略 (可选)"
                value={newTrade.strategy}
                onChange={(e) => setNewTrade({ ...newTrade, strategy: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
              />
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 py-2 bg-slate-800 text-white rounded-lg"
              >
                取消
              </button>
              <button
                onClick={createTrade}
                disabled={isCreating}
                className="flex-1 py-2 bg-green-600 text-white rounded-lg"
              >
                {isCreating ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
