'use client';

import { useState } from 'react';
import { TrendingUp, TrendingDown, Crosshair, X } from 'lucide-react';
import * as api from '@/lib/executionApi';
import { getBotConfig } from '@/lib/botConfig';

interface PositionsTableProps {
  positions: api.Position[];
  isConnected: boolean;
  isLoading: boolean;
  onRefresh: () => void;
}

export function PositionsTable({ positions, isConnected, onRefresh }: PositionsTableProps) {
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
                            const bot = getBotConfig(id);
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
