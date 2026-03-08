'use client';

import { Shield, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import type { RiskStatus } from '@/lib/executionApi';
import * as api from '@/lib/executionApi';

interface RiskStatusCardProps {
  riskStatus: RiskStatus | null;
  isConnected: boolean;
  isLoading: boolean;
  onRefresh: () => void;
}

export function RiskStatusCard({ riskStatus, isConnected, isLoading, onRefresh }: RiskStatusCardProps) {
  const handleEmergencyStop = async (enabled: boolean) => {
    try {
      await api.setEmergencyStop(enabled);
      onRefresh();
    } catch (err) {
      console.error('设置紧急停止失败:', err);
    }
  };

  return (
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
  );
}
