'use client';

import { useState } from 'react';
import { RefreshCw, AlertTriangle, CheckCircle, Search } from 'lucide-react';
import * as api from '@/lib/executionApi';

interface ReconciliationPanelProps {
  isLoading: boolean;
}

export const ReconciliationPanel: React.FC<ReconciliationPanelProps> = ({ isLoading }) => {
  const [report, setReport] = useState<api.ReconciliationReport | null>(null);
  const [orphaned, setOrphaned] = useState<Array<{
    symbol: string; side: string; quantity: number;
    entry_price: number; unrealized_pnl: number;
  }>>([]);
  const [trackResult, setTrackResult] = useState<{
    tracked: number; updated: number;
    details: Array<{ trade_id: string; status: string; exit_reason?: string }>;
  } | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReconcile = async () => {
    setReconciling(true);
    setError(null);
    try {
      const [reconcileResult, orphanedResult] = await Promise.all([
        api.reconcileTrades(),
        api.getOrphanedPositions(),
      ]);
      setReport(reconcileResult);
      setOrphaned(orphanedResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : '对账失败');
    } finally {
      setReconciling(false);
    }
  };

  const handleTrackOrders = async () => {
    setTracking(true);
    setError(null);
    try {
      const result = await api.trackAllOrders();
      setTrackResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : '追踪失败');
    } finally {
      setTracking(false);
    }
  };

  const hasMismatches = report && report.mismatches && report.mismatches.length > 0;
  const hasOrphaned = orphaned.length > 0;

  return (
    <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Search className="w-5 h-5" />
          数据对账
        </h3>
        <div className="flex gap-2">
          <button
            onClick={handleTrackOrders}
            disabled={tracking || isLoading}
            className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded-lg disabled:opacity-50 flex items-center gap-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${tracking ? 'animate-spin' : ''}`} />
            追踪订单
          </button>
          <button
            onClick={handleReconcile}
            disabled={reconciling || isLoading}
            className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-50 flex items-center gap-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${reconciling ? 'animate-spin' : ''}`} />
            一键对账
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {report && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-700/50 rounded-lg p-3">
              <p className="text-xs text-slate-400">本地交易</p>
              <p className="text-lg font-bold text-white">{report.local_trades}</p>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-3">
              <p className="text-xs text-slate-400">币安持仓</p>
              <p className="text-lg font-bold text-white">{report.binance_positions}</p>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-3">
              <p className="text-xs text-slate-400">状态</p>
              <div className="flex items-center gap-1 mt-1">
                {hasMismatches || hasOrphaned ? (
                  <>
                    <AlertTriangle className="w-4 h-4 text-yellow-400" />
                    <span className="text-yellow-400 text-sm">有差异</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-green-400 text-sm">一致</span>
                  </>
                )}
              </div>
            </div>
          </div>
          {hasMismatches && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
              <p className="text-sm font-medium text-yellow-400 mb-2">差异 ({report.mismatches.length})</p>
              {report.mismatches.map((m, i) => (
                <div key={i} className="text-xs text-slate-300 py-1 border-t border-slate-700 first:border-0">
                  <span className="text-yellow-400">[{m.type}]</span> {m.symbol}: {m.detail}
                </div>
              ))}
            </div>
          )}

          {hasOrphaned && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <p className="text-sm font-medium text-red-400 mb-2">孤儿持仓 ({orphaned.length})</p>
              {orphaned.map((o, i) => (
                <div key={i} className="text-xs text-slate-300 py-1 border-t border-slate-700 first:border-0 flex justify-between">
                  <span>{o.symbol} {o.side}</span>
                  <span className={o.unrealized_pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {o.unrealized_pnl >= 0 ? '+' : ''}{o.unrealized_pnl.toFixed(2)} USDT
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {trackResult && (
        <div className="mt-4 bg-slate-700/50 rounded-lg p-3">
          <p className="text-sm text-slate-300 mb-2">
            订单追踪: 共 {trackResult.tracked} 笔, 更新 {trackResult.updated} 笔
          </p>
          {trackResult.details.length > 0 && (
            <div className="space-y-1">
              {trackResult.details.slice(0, 5).map((d, i) => (
                <div key={i} className="text-xs text-slate-400 flex justify-between">
                  <span>{d.trade_id}</span>
                  <span className={d.status === 'closed' ? 'text-green-400' : 'text-slate-300'}>
                    {d.status}{d.exit_reason ? ` (${d.exit_reason})` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!report && !trackResult && !error && (
        <p className="text-sm text-slate-500">点击"一键对账"比对本地记录与币安实际持仓</p>
      )}
    </div>
  );
};
