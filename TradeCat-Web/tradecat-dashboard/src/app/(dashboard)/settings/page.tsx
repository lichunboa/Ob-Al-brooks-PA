'use client';

import React, { useState, useEffect } from 'react';
import { 
  Settings, Server, Bell, Palette, Database, 
  Shield, Save, RotateCcw, CheckCircle, AlertCircle,
  Moon, Sun, Monitor, Volume2, VolumeX
} from 'lucide-react';

interface AppSettings {
  // API设置
  apiUrl: string;
  apiKey: string;
  
  // 显示设置
  theme: 'dark' | 'light' | 'auto';
  chartType: 'candles' | 'line' | 'area';
  defaultTimeframe: string;
  
  // 通知设置
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  signalAlerts: boolean;
  priceAlerts: boolean;
  
  // 数据设置
  autoRefresh: boolean;
  refreshInterval: number;
  cacheEnabled: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  apiUrl: 'http://localhost:8088',
  apiKey: '',
  theme: 'dark',
  chartType: 'candles',
  defaultTimeframe: '5m',
  notificationsEnabled: true,
  soundEnabled: false,
  signalAlerts: true,
  priceAlerts: false,
  autoRefresh: true,
  refreshInterval: 10,
  cacheEnabled: true
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

  // 从localStorage加载设置
  useEffect(() => {
    const saved = localStorage.getItem('ab-console-settings');
    if (saved) {
      try {
        setSettings(JSON.parse(saved));
      } catch {
        console.error('Failed to parse settings');
      }
    }
  }, []);

  // 保存设置
  const saveSettings = () => {
    localStorage.setItem('ab-console-settings', JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // 重置设置
  const resetSettings = () => {
    if (confirm('确定要重置所有设置吗？')) {
      setSettings(DEFAULT_SETTINGS);
      localStorage.removeItem('ab-console-settings');
    }
  };

  // 测试API连接
  const testConnection = async () => {
    setTestStatus('testing');
    try {
      const res = await fetch(`${settings.apiUrl}/health`, { 
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      if (res.ok) {
        setTestStatus('success');
      } else {
        setTestStatus('error');
      }
    } catch {
      setTestStatus('error');
    }
    setTimeout(() => setTestStatus('idle'), 3000);
  };

  // 更新设置
  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="h-full overflow-auto">
      {/* 标题栏 */}
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
        {/* API设置 */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center">
              <Server className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="font-bold text-white">API设置</h3>
              <p className="text-sm text-slate-400">配置后端服务连接</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm text-slate-400">API地址</label>
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

            <div>
              <label className="text-sm text-slate-400">API密钥 (可选)</label>
              <input
                type="password"
                value={settings.apiKey}
                onChange={(e) => updateSetting('apiKey', e.target.value)}
                className="w-full mt-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                placeholder="输入API密钥"
              />
            </div>
          </div>
        </section>

        {/* 显示设置 */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center">
              <Palette className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h3 className="font-bold text-white">显示设置</h3>
              <p className="text-sm text-slate-400">自定义界面外观</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm text-slate-400">主题</label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {(['dark', 'light', 'auto'] as const).map((theme) => (
                  <button
                    key={theme}
                    onClick={() => updateSetting('theme', theme)}
                    className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                      settings.theme === theme
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {theme === 'dark' && <Moon className="w-4 h-4" />}
                    {theme === 'light' && <Sun className="w-4 h-4" />}
                    {theme === 'auto' && <Monitor className="w-4 h-4" />}
                    {theme === 'dark' ? '深色' : theme === 'light' ? '浅色' : '自动'}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-slate-400">默认图表类型</label>
                <select
                  value={settings.chartType}
                  onChange={(e) => updateSetting('chartType', e.target.value as AppSettings['chartType'])}
                  className="w-full mt-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                >
                  <option value="candles">K线图</option>
                  <option value="line">折线图</option>
                  <option value="area">面积图</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-slate-400">默认时间框架</label>
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
            </div>
          </div>
        </section>

        {/* 通知设置 */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-green-600/20 flex items-center justify-center">
              <Bell className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <h3 className="font-bold text-white">通知设置</h3>
              <p className="text-sm text-slate-400">配置提醒方式</p>
            </div>
          </div>

          <div className="space-y-3">
            {[
              { key: 'notificationsEnabled', label: '启用通知', icon: Bell },
              { key: 'soundEnabled', label: '声音提醒', icon: settings.soundEnabled ? Volume2 : VolumeX },
              { key: 'signalAlerts', label: '信号提醒', icon: AlertCircle },
              { key: 'priceAlerts', label: '价格提醒', icon: Database },
            ].map(({ key, label, icon: Icon }) => (
              <label key={key} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg cursor-pointer hover:bg-slate-800 transition-colors">
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-white">{label}</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings[key as keyof AppSettings] as boolean}
                  onChange={(e) => updateSetting(key as keyof AppSettings, e.target.checked as any)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-blue-600"
                />
              </label>
            ))}
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
              <p className="text-sm text-slate-400">配置数据刷新和缓存</p>
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

            <label className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg cursor-pointer hover:bg-slate-800 transition-colors">
              <span className="text-sm text-white">启用缓存</span>
              <input
                type="checkbox"
                checked={settings.cacheEnabled}
                onChange={(e) => updateSetting('cacheEnabled', e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-blue-600"
              />
            </label>
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
            <p>版本: v2.0.0-beta</p>
            <p>构建时间: 2026-01-29</p>
            <p>技术栈: Next.js + Tailwind CSS + Lightweight Charts</p>
          </div>
        </section>
      </div>
    </div>
  );
}
