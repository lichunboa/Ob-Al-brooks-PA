'use client';

import React, { useState, useEffect } from 'react';
import {
  Server, Database, Save, RotateCcw, CheckCircle,
} from 'lucide-react';
import { config } from '@/lib/config';

interface AppSettings {
  apiUrl: string;
  defaultTimeframe: string;
  defaultCandleCount: number;
  autoRefresh: boolean;
  refreshInterval: number;
}

const DEFAULT_SETTINGS: AppSettings = {
  apiUrl: config.apiUrl,
  defaultTimeframe: '5m',
  defaultCandleCount: 200,
  autoRefresh: true,
  refreshInterval: 10,
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

  useEffect(() => {
    const stored = localStorage.getItem('ab-console-settings');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSettings(prev => ({ ...prev, ...parsed }));
      } catch {
        console.error('Failed to parse settings');
      }
    }
  }, []);

  const saveSettings = () => {
    localStorage.setItem('ab-console-settings', JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const resetSettings = () => {
    if (confirm('确定要重置所有设置吗？')) {
      setSettings(DEFAULT_SETTINGS);
      localStorage.removeItem('ab-console-settings');
    }
  };

  const testConnection = async () => {
    setTestStatus('testing');
    try {
      const res = await fetch(`${settings.apiUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      setTestStatus(res.ok ? 'success' : 'error');
    } catch {
      setTestStatus('error');
    }
    setTimeout(() => setTestStatus('idle'), 3000);
  };

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">设置</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={resetSettings}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            重置
          </button>
          <button
            onClick={saveSettings}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
          >
            {saved ? (
              <>
                <CheckCircle className="w-4 h-4" />
                已保存
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                保存
              </>
            )}
          </button>
        </div>
      </div>

      <div className="space-y-6 max-w-3xl">
        {/* 连接设置 */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center">
              <Server className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="font-bold text-white">连接设置</h3>
              <p className="text-sm text-slate-400">配置后端服务连接</p>
            </div>
          </div>

          <div>
            <label className="text-sm text-slate-400">后端地址</label>
            <div className="flex gap-2 mt-1">
              <input
                type="text"
                value={settings.apiUrl}
                onChange={(e) => updateSetting('apiUrl', e.target.value)}
                className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                placeholder="http://localhost:8088"
              />
              <button
                onClick={testConnection}
                disabled={testStatus === 'testing'}
                className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                  testStatus === 'success'
                    ? 'bg-green-600/20 text-green-400 border border-green-600/50'
                    : testStatus === 'error'
                    ? 'bg-red-600/20 text-red-400 border border-red-600/50'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {testStatus === 'testing' ? '测试中...' :
                 testStatus === 'success' ? '连接成功' :
                 testStatus === 'error' ? '连接失败' : '测试连接'}
              </button>
            </div>
          </div>
        </section>

        {/* 图表设置 */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center text-lg">
              📊
            </div>
            <div>
              <h3 className="font-bold text-white">图表设置</h3>
              <p className="text-sm text-slate-400">K线图默认参数</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-slate-400">默认时间周期</label>
              <select
                value={settings.defaultTimeframe}
                onChange={(e) => updateSetting('defaultTimeframe', e.target.value)}
                className="w-full mt-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
              >
                <option value="1m">1分钟</option>
                <option value="5m">5分钟</option>
                <option value="15m">15分钟</option>
                <option value="1h">1小时</option>
                <option value="4h">4小时</option>
                <option value="1d">日线</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-slate-400">默认K线数量</label>
              <select
                value={settings.defaultCandleCount}
                onChange={(e) => updateSetting('defaultCandleCount', parseInt(e.target.value))}
                className="w-full mt-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
              >
                <option value={100}>100</option>
                <option value={200}>200</option>
                <option value={500}>500</option>
                <option value={1000}>1000</option>
              </select>
            </div>
          </div>
        </section>

        {/* 数据设置 */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-orange-600/20 flex items-center justify-center">
              <Database className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h3 className="font-bold text-white">数据设置</h3>
              <p className="text-sm text-slate-400">数据刷新策略</p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg cursor-pointer hover:bg-slate-800 transition-colors">
              <span className="text-sm text-white">自动刷新</span>
              <input
                type="checkbox"
                checked={settings.autoRefresh}
                onChange={(e) => updateSetting('autoRefresh', e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-blue-600"
              />
            </label>

            {settings.autoRefresh && (
              <div>
                <label className="text-sm text-slate-400">刷新间隔 (秒)</label>
                <div className="flex items-center gap-3 mt-1">
                  <input
                    type="range"
                    min={5}
                    max={60}
                    step={5}
                    value={settings.refreshInterval}
                    onChange={(e) => updateSetting('refreshInterval', parseInt(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-sm text-white w-12 text-right">{settings.refreshInterval}s</span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* 关于 */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center text-xl">
              🦁
            </div>
            <div>
              <h3 className="font-bold text-white">AB Console</h3>
              <p className="text-sm text-slate-400">Al Brooks 价格行为交易系统</p>
            </div>
          </div>

          <div className="text-sm text-slate-500 space-y-1">
            <p>版本: v2.7.0</p>
            <p>技术栈: Next.js + Tailwind CSS + Lightweight Charts</p>
          </div>
        </section>
      </div>
    </div>
  );
}
