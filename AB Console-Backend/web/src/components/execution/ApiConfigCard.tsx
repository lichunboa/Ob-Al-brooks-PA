'use client';

import { useState } from 'react';
import { Settings, Eye, EyeOff, Save, CheckCircle, XCircle } from 'lucide-react';
import * as api from '@/lib/executionApi';
import type { ConfigStatus } from '@/lib/executionApi';

interface ApiConfigCardProps {
  config: ConfigStatus | null;
  isConnected: boolean;
  isLoading: boolean;
  onRefresh: () => void;
}

export function ApiConfigCard({ config, isLoading, onRefresh }: ApiConfigCardProps) {
  const [showConfigForm, setShowConfigForm] = useState(false);
  const [configForm, setConfigForm] = useState({
    mode: 'demo',
    api_key: '',
    api_secret: '',
    max_daily_loss: 100,
    max_position_size: 50,
    max_leverage: 5,
  });
  const [showSecrets, setShowSecrets] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const handleSaveConfig = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const result = await api.updateConfig(configForm);
      setSaveMessage(result.message);
      setShowConfigForm(false);
      setTimeout(() => setSaveMessage(null), 5000);
      onRefresh();
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">API 配置</h3>
          <Settings className="w-5 h-5 text-slate-500" />
        </div>
        {config ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-800/50 rounded-lg p-3">
                <p className="text-slate-400 text-xs">模式</p>
                <p
                  className={`text-lg font-semibold ${
                    config.mode === 'demo'
                      ? 'text-blue-400'
                      : config.mode === 'testnet'
                      ? 'text-yellow-400'
                      : 'text-green-400'
                  }`}
                >
                  {config.mode === 'demo' ? 'Demo' : config.mode === 'testnet' ? '测试网' : '主网'}
                </p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3">
                <p className="text-slate-400 text-xs">最大杠杆</p>
                <p className="text-lg font-semibold text-white">
                  {config.max_leverage}x
                </p>
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-lg p-3">
              <p className="text-slate-400 text-xs mb-1">API Key</p>
              <div className="flex items-center gap-2">
                {config.api_key_configured ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-green-400 font-mono text-sm">
                      {config.api_key_preview}
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-red-400" />
                    <span className="text-red-400">未配置</span>
                  </>
                )}
              </div>
            </div>

            <button
              onClick={() => setShowConfigForm(!showConfigForm)}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-medium transition-colors"
            >
              {showConfigForm ? '取消' : '修改配置'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-slate-500">
              {isLoading ? '加载中...' : '服务未连接'}
            </p>
            <button
              onClick={() => setShowConfigForm(!showConfigForm)}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-medium transition-colors"
            >
              配置 API Key
            </button>
          </div>
        )}
      </div>

      {/* Save Message */}
      {saveMessage && (
        <div className="bg-blue-900/20 border border-blue-800/50 rounded-xl p-4">
          <p className="text-blue-300">{saveMessage}</p>
        </div>
      )}

      {/* Config Form */}
      {showConfigForm && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">配置 API</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 text-sm mb-1">模式</label>
              <select
                value={configForm.mode}
                onChange={(e) =>
                  setConfigForm({ ...configForm, mode: e.target.value })
                }
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
              >
                <option value="demo">Demo Trading</option>
                <option value="testnet">测试网 (Testnet)</option>
                <option value="mainnet">主网 (Mainnet)</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-400 text-sm mb-1">最大杠杆</label>
              <input
                type="number"
                value={configForm.max_leverage}
                onChange={(e) =>
                  setConfigForm({
                    ...configForm,
                    max_leverage: parseInt(e.target.value) || 5,
                  })
                }
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
              />
            </div>
            <div>
              <label className="block text-slate-400 text-sm mb-1">API Key</label>
              <div className="relative">
                <input
                  type={showSecrets ? 'text' : 'password'}
                  value={configForm.api_key}
                  onChange={(e) =>
                    setConfigForm({ ...configForm, api_key: e.target.value })
                  }
                  placeholder="输入 API Key"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowSecrets(!showSecrets)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showSecrets ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-slate-400 text-sm mb-1">API Secret</label>
              <input
                type={showSecrets ? 'text' : 'password'}
                value={configForm.api_secret}
                onChange={(e) =>
                  setConfigForm({ ...configForm, api_secret: e.target.value })
                }
                placeholder="输入 API Secret"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
              />
            </div>
            <div>
              <label className="block text-slate-400 text-sm mb-1">
                每日最大亏损 (USDT)
              </label>
              <input
                type="number"
                value={configForm.max_daily_loss}
                onChange={(e) =>
                  setConfigForm({
                    ...configForm,
                    max_daily_loss: parseFloat(e.target.value) || 100,
                  })
                }
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
              />
            </div>
            <div>
              <label className="block text-slate-400 text-sm mb-1">
                单笔最大仓位 (USDT)
              </label>
              <input
                type="number"
                value={configForm.max_position_size}
                onChange={(e) =>
                  setConfigForm({
                    ...configForm,
                    max_position_size: parseFloat(e.target.value) || 50,
                  })
                }
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-3">
            <button
              onClick={() => setShowConfigForm(false)}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSaveConfig}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-white font-medium transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? '保存中...' : '保存配置'}
            </button>
          </div>
          <p className="mt-3 text-slate-500 text-sm">
            注意：保存后需要重启 Execution Service 才能生效
          </p>
        </div>
      )}
    </>
  );
}
