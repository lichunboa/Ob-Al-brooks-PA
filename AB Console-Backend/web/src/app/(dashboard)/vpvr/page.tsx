'use client';

import React, { useState, useEffect } from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';

const VIS_BASE = '/api/vis';

const TABS = [
  { id: 'kline-envelope', label: 'K线包络', desc: '多周期K线叠加分析' },
  { id: 'vpvr-ridge', label: 'VPVR 山脊图', desc: '成交量分布山脊图' },
  { id: 'templates', label: '全部模板', desc: '可用可视化模板列表' },
] as const;

type TabId = typeof TABS[number]['id'];

interface TemplateMeta {
  id: string;
  name: string;
  description: string;
  outputs: string[];
}

export default function VPVRPage() {
  const [activeTab, setActiveTab] = useState<TabId>('kline-envelope');
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  // 健康检查
  useEffect(() => {
    fetch(`${VIS_BASE}/health`)
      .then((r) => r.json())
      .then((d) => setIsHealthy(d.status === 'ok'))
      .catch(() => setIsHealthy(false));
  }, []);

  // 获取模板列表
  useEffect(() => {
    if (activeTab === 'templates') {
      setLoading(true);
      fetch(`${VIS_BASE}/templates`)
        .then((r) => r.json())
        .then((d) => {
          setTemplates(Array.isArray(d) ? d : []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [activeTab]);

  return (
    <div className="h-full flex flex-col gap-4">
      {/* 顶部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">VPVR 可视化分析</h1>
          <p className="text-sm text-slate-400 mt-1">成交量分布 / K线包络 / 市场结构</p>
        </div>
        <div className="flex items-center gap-3">
          {/* 服务状态 */}
          <div className="flex items-center gap-2 text-xs">
            <div
              className={`w-2 h-2 rounded-full ${
                isHealthy === null ? 'bg-slate-500' : isHealthy ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            <span className="text-slate-400">
              vis-service {isHealthy === null ? '检测中' : isHealthy ? '正常' : '离线'}
            </span>
          </div>
        </div>
      </div>

      {/* Tab 栏 */}
      <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 内容区 */}
      <div className="flex-1 min-h-0">
        {isHealthy === false ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400">
            <AlertCircle className="w-12 h-12 text-red-400" />
            <div className="text-center">
              <p className="text-lg font-medium text-white">vis-service 未运行</p>
              <p className="text-sm mt-2">请先启动 vis-service（端口 8087）</p>
              <code className="block mt-3 px-4 py-2 bg-slate-800 rounded text-xs text-slate-300">
                cd services-preview/vis-service && python -m src
              </code>
            </div>
            <button
              onClick={() => {
                setIsHealthy(null);
                fetch(`${VIS_BASE}/health`)
                  .then((r) => r.json())
                  .then((d) => setIsHealthy(d.status === 'ok'))
                  .catch(() => setIsHealthy(false));
              }}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm"
            >
              <RefreshCw className="w-4 h-4" />
              重试
            </button>
          </div>
        ) : activeTab === 'kline-envelope' ? (
          <iframe
            src={`${VIS_BASE}/kline-envelope`}
            className="w-full h-full rounded-lg border border-slate-800 bg-white"
            title="K线包络图"
          />
        ) : activeTab === 'vpvr-ridge' ? (
          <VPVRRidgeView />
        ) : (
          <TemplateList templates={templates} loading={loading} />
        )}
      </div>
    </div>
  );
}

function VPVRRidgeView() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];

  const renderVPVR = async () => {
    setLoading(true);
    setError(null);
    setImageUrl(null);
    try {
      const resp = await fetch(`${VIS_BASE}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: 'vpvr-ridge',
          params: { symbol, limit: 500 },
          output: 'png',
        }),
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({ detail: resp.statusText }));
        throw new Error(errData.detail || resp.statusText);
      }
      const blob = await resp.blob();
      setImageUrl(URL.createObjectURL(blob));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-400">品种:</label>
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
          >
            {symbols.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <button
          onClick={renderVPVR}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm text-white"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          渲染
        </button>
      </div>

      <div className="flex-1 bg-slate-900 rounded-lg border border-slate-800 flex items-center justify-center overflow-auto">
        {loading ? (
          <div className="text-slate-400 text-sm">渲染中...</div>
        ) : error ? (
          <div className="text-center text-red-400">
            <AlertCircle className="w-8 h-8 mx-auto mb-2" />
            <p className="text-sm">{error}</p>
          </div>
        ) : imageUrl ? (
          <img src={imageUrl} alt="VPVR Ridge" className="max-w-full max-h-full object-contain" />
        ) : (
          <div className="text-slate-500 text-sm">选择品种后点击"渲染"</div>
        )}
      </div>
    </div>
  );
}

function TemplateList({ templates, loading }: { templates: TemplateMeta[]; loading: boolean }) {
  if (loading) {
    return <div className="flex items-center justify-center h-full text-slate-400">加载模板列表...</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {templates.map((t) => (
        <div key={t.id} className="bg-slate-900 rounded-lg border border-slate-800 p-4">
          <h3 className="text-sm font-medium text-white">{t.name}</h3>
          <p className="text-xs text-slate-400 mt-1">{t.description}</p>
          <div className="flex gap-2 mt-3">
            {t.outputs.map((o) => (
              <span key={o} className="text-[10px] px-2 py-0.5 bg-slate-800 text-slate-300 rounded">
                {o}
              </span>
            ))}
          </div>
          <div className="mt-2 text-[10px] text-slate-500 font-mono">{t.id}</div>
        </div>
      ))}
      {templates.length === 0 && (
        <div className="col-span-full text-center text-slate-500 py-8">
          暂无可用模板（vis-service 可能未启动）
        </div>
      )}
    </div>
  );
}
