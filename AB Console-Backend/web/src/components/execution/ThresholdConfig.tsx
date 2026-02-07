'use client';

import { useState, useEffect } from 'react';
import { Sliders, Save, RefreshCw } from 'lucide-react';

interface BotThreshold {
  min_score: number;
  trade_score: number;
}

interface Thresholds {
  min_strength: number;
  bot_thresholds: {
    'al-brooks': BotThreshold;
    trader: BotThreshold;
    wyckoff: BotThreshold;
  };
  updated_at?: string;
}

interface ThresholdConfigProps {
  isLoading?: boolean;
}

const BOT_NAMES: Record<string, string> = {
  'al-brooks': 'PA交易',
  trader: '量化分析师',
  wyckoff: '威科夫大师',
};

const BOT_EMOJIS: Record<string, string> = {
  'al-brooks': '🦁',
  trader: '📊',
  wyckoff: '🔮',
};

export function ThresholdConfig({ isLoading: parentLoading }: ThresholdConfigProps) {
  const [thresholds, setThresholds] = useState<Thresholds | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editedThresholds, setEditedThresholds] = useState<Thresholds | null>(null);

  const fetchThresholds = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('http://localhost:8092/thresholds');
      if (res.ok) {
        const data = await res.json();
        setThresholds(data);
        setEditedThresholds(data);
      }
    } catch (err) {
      console.error('获取阈值失败:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchThresholds();
  }, []);

  const handleSave = async () => {
    if (!editedThresholds) return;

    setIsSaving(true);
    setMessage(null);

    try {
      // 保存全局阈值
      await fetch('http://localhost:8092/thresholds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ min_strength: editedThresholds.min_strength }),
      });

      // 保存各机器人阈值
      for (const botId of Object.keys(editedThresholds.bot_thresholds) as Array<keyof typeof editedThresholds.bot_thresholds>) {
        const botThreshold = editedThresholds.bot_thresholds[botId];
        await fetch('http://localhost:8092/thresholds', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bot_id: botId,
            min_score: botThreshold.min_score,
            trade_score: botThreshold.trade_score,
          }),
        });
      }

      setMessage({ type: 'success', text: '阈值已保存' });
      setThresholds(editedThresholds);
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setMessage({ type: 'error', text: '保存失败' });
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = JSON.stringify(thresholds) !== JSON.stringify(editedThresholds);

  if (isLoading || parentLoading) {
    return (
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
        <div className="flex items-center gap-2 text-slate-400">
          <RefreshCw className="w-4 h-4 animate-spin" />
          加载阈值配置...
        </div>
      </div>
    );
  }

  if (!editedThresholds) {
    return (
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
        <p className="text-slate-500">无法加载阈值配置</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Sliders className="w-5 h-5 text-purple-400" />
          <h3 className="text-lg font-semibold text-white">信号阈值配置</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchThresholds}
            className="p-2 text-slate-400 hover:text-white transition-colors"
            title="刷新"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {hasChanges && (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isSaving ? '保存中...' : '保存'}
            </button>
          )}
        </div>
      </div>

      {message && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-900/30 text-green-400 border border-green-800'
              : 'bg-red-900/30 text-red-400 border border-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* 全局阈值 */}
      <div className="mb-6">
        <label className="block text-slate-400 text-sm mb-2">
          全局最低信号强度
        </label>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={40}
            max={90}
            value={editedThresholds.min_strength}
            onChange={(e) =>
              setEditedThresholds({
                ...editedThresholds,
                min_strength: parseInt(e.target.value),
              })
            }
            className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
          />
          <div className="w-16 text-center">
            <span className="text-2xl font-bold text-purple-400">
              {editedThresholds.min_strength}
            </span>
          </div>
        </div>
        <p className="text-slate-500 text-xs mt-1">
          低于此强度的信号将被直接过滤
        </p>
      </div>

      {/* 各机器人阈值 */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-slate-300">机器人阈值</h4>
        {(Object.keys(editedThresholds.bot_thresholds) as Array<keyof typeof editedThresholds.bot_thresholds>).map((botId) => {
          const botThreshold = editedThresholds.bot_thresholds[botId];
          return (
            <div
              key={botId}
              className="bg-slate-800/50 rounded-lg p-4"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">{BOT_EMOJIS[botId]}</span>
                <span className="font-medium text-white">{BOT_NAMES[botId]}</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 text-xs mb-1">
                    推送阈值
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={50}
                      max={95}
                      value={botThreshold.min_score}
                      onChange={(e) =>
                        setEditedThresholds({
                          ...editedThresholds,
                          bot_thresholds: {
                            ...editedThresholds.bot_thresholds,
                            [botId]: {
                              ...botThreshold,
                              min_score: parseInt(e.target.value) || 70,
                            },
                          },
                        })
                      }
                      className="w-20 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-center"
                    />
                    <span className="text-slate-500 text-xs">分以上推送</span>
                  </div>
                </div>
                <div>
                  <label className="block text-slate-400 text-xs mb-1">
                    开仓阈值
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={50}
                      max={95}
                      value={botThreshold.trade_score}
                      onChange={(e) =>
                        setEditedThresholds({
                          ...editedThresholds,
                          bot_thresholds: {
                            ...editedThresholds.bot_thresholds,
                            [botId]: {
                              ...botThreshold,
                              trade_score: parseInt(e.target.value) || 80,
                            },
                          },
                        })
                      }
                      className="w-20 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-center"
                    />
                    <span className="text-slate-500 text-xs">分以上开仓</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {thresholds?.updated_at && (
        <p className="text-slate-500 text-xs mt-4">
          上次更新: {new Date(thresholds.updated_at).toLocaleString('zh-CN')}
        </p>
      )}
    </div>
  );
}
