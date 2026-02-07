'use client';

import { useState } from 'react';
import { Bot, Edit2, Save, X, Check, Ban } from 'lucide-react';

export interface BotAllocation {
  bot_id: string;
  name: string;
  allocated_usdt: number;
  max_leverage: number;
  max_positions: number;
  enabled: boolean;
  current_positions?: number;
  used_margin?: number;
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
              /* 编辑模式 */
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
                      onClick={() => {
                        setEditing(null);
                        setEditData({});
                      }}
                      className="p-1.5 text-slate-400 hover:bg-slate-700 rounded transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">
                      资金 (USDT)
                    </label>
                    <input
                      type="number"
                      value={editData.allocated_usdt ?? alloc.allocated_usdt}
                      onChange={(e) =>
                        setEditData({
                          ...editData,
                          allocated_usdt: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">
                      最大杠杆
                    </label>
                    <input
                      type="number"
                      value={editData.max_leverage ?? alloc.max_leverage}
                      onChange={(e) =>
                        setEditData({
                          ...editData,
                          max_leverage: parseInt(e.target.value) || 1,
                        })
                      }
                      className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">
                      最大持仓
                    </label>
                    <input
                      type="number"
                      value={editData.max_positions ?? alloc.max_positions}
                      onChange={(e) =>
                        setEditData({
                          ...editData,
                          max_positions: parseInt(e.target.value) || 1,
                        })
                      }
                      className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:border-blue-500 focus:outline-none"
                    />
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
                      {alloc.current_positions || 0}/{alloc.max_positions} 仓
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
