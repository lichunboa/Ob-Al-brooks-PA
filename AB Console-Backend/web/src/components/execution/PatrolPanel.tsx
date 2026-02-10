'use client';

import { useState, useEffect, useCallback } from 'react';
import { Shield, RefreshCw, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import type { PatrolStatus } from '@/lib/executionApi';
import { getPatrolStatus } from '@/lib/executionApi';

export function PatrolPanel() {
  const [status, setStatus] = useState<PatrolStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getPatrolStatus();
    setStatus(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    // 每 30 秒自动刷新
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-slate-400" />
          <h3 className="text-lg font-semibold text-white">持仓巡检</h3>
          {status && (
            <span className="text-xs text-slate-500">
              已巡检 {status.patrol_count} 次
            </span>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="text-slate-400 hover:text-white text-sm flex items-center gap-1"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {status ? (
        <div className="space-y-4">
          {/* 统计卡片 */}
          <div className="grid grid-cols-5 gap-3">
            <StatCard
              icon={<AlertTriangle className="w-4 h-4" />}
              label="裸仓修复"
              value={status.totals.naked_fixed}
              color={status.totals.naked_fixed > 0 ? 'text-yellow-400' : 'text-slate-400'}
            />
            <StatCard
              icon={<Clock className="w-4 h-4" />}
              label="超时平仓"
              value={status.totals.expired_closed}
              color={status.totals.expired_closed > 0 ? 'text-orange-400' : 'text-slate-400'}
            />
            <StatCard
              icon={<Shield className="w-4 h-4" />}
              label="移动止损"
              value={status.totals.trailing_moved}
              color={status.totals.trailing_moved > 0 ? 'text-blue-400' : 'text-slate-400'}
            />
            <StatCard
              icon={<CheckCircle className="w-4 h-4" />}
              label="追踪持仓"
              value={status.tracked_positions}
              color="text-slate-300"
            />
            <StatCard
              icon={<Shield className="w-4 h-4" />}
              label="移动止损中"
              value={status.trailing_active}
              color={status.trailing_active > 0 ? 'text-green-400' : 'text-slate-400'}
            />
          </div>

          {/* 最近事件 */}
          {status.recent_history.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 mb-2 uppercase tracking-wider">最近事件</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {status.recent_history.slice().reverse().map((entry, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-xs bg-slate-800/50 rounded px-3 py-1.5"
                  >
                    <span className="text-slate-500">
                      {new Date(entry.time).toLocaleTimeString('zh-CN')}
                    </span>
                    <div className="flex gap-3">
                      {entry.naked_fixed > 0 && (
                        <span className="text-yellow-400">裸仓+{entry.naked_fixed}</span>
                      )}
                      {entry.expired_closed > 0 && (
                        <span className="text-orange-400">超时+{entry.expired_closed}</span>
                      )}
                      {entry.trailing_moved > 0 && (
                        <span className="text-blue-400">止损+{entry.trailing_moved}</span>
                      )}
                      {entry.errors.length > 0 && (
                        <span className="text-red-400">错误 {entry.errors.length}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {status.recent_history.length === 0 && (
            <p className="text-slate-500 text-sm text-center py-3">
              <CheckCircle className="w-4 h-4 inline mr-1" />
              一切正常，无需干预
            </p>
          )}
        </div>
      ) : (
        <p className="text-slate-500 text-sm">
          {loading ? '加载中...' : '巡检服务未就绪'}
        </p>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-slate-800/50 rounded px-3 py-2">
      <div className="flex items-center gap-1 text-xs text-slate-400 mb-1">
        {icon}
        {label}
      </div>
      <p className={`text-lg font-medium ${color}`}>{value}</p>
    </div>
  );
}
