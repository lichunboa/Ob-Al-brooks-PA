'use client';

import { useState } from 'react';
import { Bot, Edit2, Save, X, Check, Ban, ChevronDown, ChevronUp } from 'lucide-react';

export interface BotAllocation {
  bot_id: string;
  name: string;
  allocated_usdt: number;
  max_leverage: number;
  max_positions: number;
  enabled: boolean;
  current_positions?: number;
  used_margin?: number;
  risk_percent: number;
  fee_rate_maker: number;
  fee_rate_taker: number;
  allowed_symbols: string[];
  min_risk_reward: number;
  daily_loss_limit: number;
  daily_loss_pct: number;
  trailing_stop_enabled: boolean;
  trailing_stop_trigger: number;
  max_hold_hours: number;
  cooldown_minutes: number;
}

interface BotAllocationsProps {
  allocations: Record<string, BotAllocation>;
  totalBalance: number;
  onUpdate: (botId: string, data: Partial<BotAllocation>) => Promise<void>;
  isLoading?: boolean;
}

const BOT_EMOJIS: Record<string, string> = {
  'al-brooks': '🦁',
  trader: '📊',
  wyckoff: '🔮',
};

const BOT_COLORS: Record<string, string> = {
  'al-brooks': 'from-amber-900/30 to-amber-900/10 border-amber-700/50',
  trader: 'from-blue-900/30 to-blue-900/10 border-blue-700/50',
  wyckoff: 'from-purple-900/30 to-purple-900/10 border-purple-700/50',
};

export function BotAllocations({
  allocations,
  totalBalance,
  onUpdate,
  isLoading = false,
}: BotAllocationsProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<BotAllocation>>({});
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const totalAllocated = Object.values(allocations).reduce(
    (sum, a) => sum + a.allocated_usdt,
    0
  );

  const totalUsed = Object.values(allocations).reduce(
    (sum, a) => sum + (a.used_margin || 0),
    0
  );

  const handleSave = async (botId: string) => {
    setSaving(true);
    try {
      await onUpdate(botId, editData);
      setEditing(null);
      setEditData({});
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async (botId: string, currentEnabled: boolean) => {
    await onUpdate(botId, { enabled: !currentEnabled });
  };

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-slate-400" />
          <h3 className="text-lg font-semibold text-white">机器人资金分配</h3>
        </div>
        <div className="text-sm">
          <span className="text-slate-400">已分配: </span>
          <span className="text-white font-medium">
            ${totalAllocated.toLocaleString()}
          </span>
          <span className="text-slate-500"> / ${totalBalance.toLocaleString()}</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-green-500 to-green-400 transition-all"
            style={{ width: `${Math.min((totalAllocated / totalBalance) * 100, 100)}%` }}
          />
        </div>
        <div className="flex justify-between mt-1 text-xs text-slate-500">
          <span>已用: ${totalUsed.toLocaleString()}</span>
          <span>剩余: ${(totalBalance - totalAllocated).toLocaleString()}</span>
        </div>
      </div>

      {/* Bot Cards */}
      <div className="space-y-3">
        {Object.values(allocations).map((alloc) => (
          <div
            key={alloc.bot_id}
            className={`p-4 rounded-lg border transition-all ${
              alloc.enabled
                ? `bg-gradient-to-br ${BOT_COLORS[alloc.bot_id] || 'from-slate-800/50 to-slate-800/30 border-slate-700'}`
                : 'bg-slate-800/20 border-slate-800 opacity-60'
            }`}
          >
            {editing === alloc.bot_id ? (
              /* 编辑模式 - 分组布局 */
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-white font-medium flex items-center gap-2">
                    <span className="text-2xl">{BOT_EMOJIS[alloc.bot_id]}</span>
                    {alloc.name}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSave(alloc.bot_id)}
                      disabled={saving}
                      className="p-1.5 text-green-400 hover:bg-green-900/30 rounded transition-colors disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => { setEditing(null); setEditData({}); }}
                      className="p-1.5 text-slate-400 hover:bg-slate-700 rounded transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {/* 基础配置 */}
                <div>
                  <p className="text-xs text-slate-500 mb-1.5 uppercase tracking-wider">基础配置</p>
                  <div className="grid grid-cols-3 gap-3">
                    <EditField label="资金 (USDT)" value={editData.allocated_usdt ?? alloc.allocated_usdt} onChange={(v) => setEditData({ ...editData, allocated_usdt: v })} />
                    <EditField label="最大杠杆" value={editData.max_leverage ?? alloc.max_leverage} onChange={(v) => setEditData({ ...editData, max_leverage: v })} isInt />
                    <EditField label="最大持仓" value={editData.max_positions ?? alloc.max_positions} onChange={(v) => setEditData({ ...editData, max_positions: v })} isInt />
                  </div>
                </div>
                {/* 风控配置 */}
                <div>
                  <p className="text-xs text-slate-500 mb-1.5 uppercase tracking-wider">风控配置</p>
                  <div className="grid grid-cols-4 gap-3">
                    <EditField label="单笔风险%" value={editData.risk_percent ?? alloc.risk_percent} onChange={(v) => setEditData({ ...editData, risk_percent: v })} step={0.5} />
                    <EditField label="最小盈亏比" value={editData.min_risk_reward ?? alloc.min_risk_reward} onChange={(v) => setEditData({ ...editData, min_risk_reward: v })} step={0.5} />
                    <EditField label="日亏限(固定$)" value={editData.daily_loss_limit ?? alloc.daily_loss_limit} onChange={(v) => setEditData({ ...editData, daily_loss_limit: v })} />
                    <EditField label="日亏限(%资金)" value={editData.daily_loss_pct ?? alloc.daily_loss_pct} onChange={(v) => setEditData({ ...editData, daily_loss_pct: v })} step={0.5} />
                  </div>
                </div>
                {/* 交易控制 */}
                <div>
                  <p className="text-xs text-slate-500 mb-1.5 uppercase tracking-wider">交易控制</p>
                  <div className="grid grid-cols-3 gap-3">
                    <EditField label="冷却期(分)" value={editData.cooldown_minutes ?? alloc.cooldown_minutes} onChange={(v) => setEditData({ ...editData, cooldown_minutes: v })} isInt />
                    <EditField label="最大持仓(时)" value={editData.max_hold_hours ?? alloc.max_hold_hours} onChange={(v) => setEditData({ ...editData, max_hold_hours: v })} isInt />
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">允许品种</label>
                      <input
                        type="text"
                        value={(editData.allowed_symbols ?? alloc.allowed_symbols ?? []).join(',')}
                        onChange={(e) => setEditData({ ...editData, allowed_symbols: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                        className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:border-blue-500 focus:outline-none"
                        placeholder="BTC,ETH,SOL"
                      />
                    </div>
                  </div>
                </div>
                {/* 高级 */}
                <div>
                  <p className="text-xs text-slate-500 mb-1.5 uppercase tracking-wider">高级</p>
                  <div className="grid grid-cols-3 gap-3">
                    <EditField label="Maker费率" value={editData.fee_rate_maker ?? alloc.fee_rate_maker} onChange={(v) => setEditData({ ...editData, fee_rate_maker: v })} step={0.0001} />
                    <EditField label="Taker费率" value={editData.fee_rate_taker ?? alloc.fee_rate_taker} onChange={(v) => setEditData({ ...editData, fee_rate_taker: v })} step={0.0001} />
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <label className="text-xs text-slate-400 block mb-1">移动止损</label>
                        <button
                          onClick={() => setEditData({ ...editData, trailing_stop_enabled: !(editData.trailing_stop_enabled ?? alloc.trailing_stop_enabled) })}
                          className={`w-full px-2 py-1.5 rounded text-sm border ${
                            (editData.trailing_stop_enabled ?? alloc.trailing_stop_enabled)
                              ? 'bg-green-900/30 border-green-700 text-green-400'
                              : 'bg-slate-700 border-slate-600 text-slate-400'
                          }`}
                        >
                          {(editData.trailing_stop_enabled ?? alloc.trailing_stop_enabled) ? '开启' : '关闭'}
                        </button>
                      </div>
                      {(editData.trailing_stop_enabled ?? alloc.trailing_stop_enabled) && (
                        <EditField label="触发%" value={editData.trailing_stop_trigger ?? alloc.trailing_stop_trigger} onChange={(v) => setEditData({ ...editData, trailing_stop_trigger: v })} step={0.5} />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* 显示模式 */
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{BOT_EMOJIS[alloc.bot_id]}</span>
                  <div>
                    <p className="text-white font-medium">{alloc.name}</p>
                    <p className="text-slate-400 text-sm">
                      ${alloc.allocated_usdt.toLocaleString()} · {alloc.max_leverage}x ·{' '}
                      {alloc.current_positions || 0}/{alloc.max_positions} 仓 · 风险{alloc.risk_percent}% · 日亏限{alloc.daily_loss_pct}%($
                      {Math.max(alloc.daily_loss_limit, alloc.allocated_usdt * alloc.daily_loss_pct / 100).toFixed(0)})
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* 使用进度 */}
                  {alloc.used_margin !== undefined && alloc.used_margin > 0 && (
                    <div className="text-xs text-slate-400 mr-2">
                      已用 ${alloc.used_margin.toLocaleString()}
                    </div>
                  )}
                  {/* 启用/禁用按钮 */}
                  <button
                    onClick={() => handleToggleEnabled(alloc.bot_id, alloc.enabled)}
                    disabled={isLoading}
                    className={`p-1.5 rounded transition-colors ${
                      alloc.enabled
                        ? 'text-green-400 hover:bg-green-900/30'
                        : 'text-red-400 hover:bg-red-900/30'
                    }`}
                    title={alloc.enabled ? '点击禁用' : '点击启用'}
                  >
                    {alloc.enabled ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Ban className="w-4 h-4" />
                    )}
                  </button>
                  {/* 编辑按钮 */}
                  <button
                    onClick={() => {
                      setEditing(alloc.bot_id);
                      setEditData({});
                    }}
                    disabled={isLoading}
                    className="p-1.5 text-slate-400 hover:bg-slate-700 rounded transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* 编辑字段辅助组件 */
function EditField({
  label,
  value,
  onChange,
  isInt = false,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  isInt?: boolean;
  step?: number;
}) {
  return (
    <div>
      <label className="text-xs text-slate-400 block mb-1">{label}</label>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) =>
          onChange(isInt ? parseInt(e.target.value) || 0 : parseFloat(e.target.value) || 0)
        }
        className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:border-blue-500 focus:outline-none"
      />
    </div>
  );
}
