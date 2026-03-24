'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { ConsoleView, MonitoringAccount, MonitoringConfig, RuntimeBundle, RuntimeData } from './console/types';
import {
  buildAccountPanels,
  buildAuditSymbolMap,
  buildSymbolBuckets,
  buildTrackedSymbols,
  filterRealExecutionEvents,
  pickBestCandidateCard,
  summarizeBalances,
} from './console/derived';
import { ErrorCard, LoadingShell, PageIntro } from './console/ui';
import { AccountsView } from './console/views/accounts-view';
import { AuditView } from './console/views/audit-view';
import { OrdersView } from './console/views/orders-view';
import { OverviewView } from './console/views/overview-view';
import { SettingsView } from './console/views/settings-view';
import { SystemView } from './console/views/system-view';

function runtimeCacheKey(view: ConsoleView) {
  return `ab_patrol_runtime_bundle_v9:${view}`;
}

function isRuntimeBundleShape(payload: unknown): payload is RuntimeBundle {
  if (!payload || typeof payload !== 'object') return false;
  const candidate = payload as Partial<RuntimeBundle>;
  return Array.isArray(candidate.runtimes) || Object.prototype.hasOwnProperty.call(candidate, 'primary');
}

const PAGE_META: Record<ConsoleView, { title: string; subtitle: string }> = {
  overview: {
    title: '实盘总览',
    subtitle: '先看执行结论，再看焦点结构与状态板。',
  },
  accounts: {
    title: '账户矩阵',
    subtitle: '账户状态、覆盖市场与实时性。',
  },
  orders: {
    title: '订单面板',
    subtitle: '持仓、挂单与真实订单变化。',
  },
  audit: {
    title: '机会审计',
    subtitle: '监控与归因，不回写规则。',
  },
  system: {
    title: '系统运行态',
    subtitle: '链路、调度与耗时。',
  },
  settings: {
    title: '实盘配置',
    subtitle: '这里只编辑配置。',
  },
};

type ConsoleRenderBoundaryProps = {
  children: React.ReactNode;
};

type ConsoleRenderBoundaryState = {
  hasError: boolean;
  message: string;
};

class ConsoleRenderBoundary extends React.Component<ConsoleRenderBoundaryProps, ConsoleRenderBoundaryState> {
  constructor(props: ConsoleRenderBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ConsoleRenderBoundaryState {
    return {
      hasError: true,
      message: error?.message || '页面渲染失败',
    };
  }

  componentDidCatch(error: Error) {
    console.error('PatrolConsole 渲染异常', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-[18px] border border-rose-400/18 bg-rose-400/8 px-4 py-4 text-sm text-rose-100">
          控制台渲染失败，已拦截客户端异常，避免整页白屏。原因：{this.state.message || '未知异常'}
        </div>
      );
    }
    return this.props.children;
  }
}

export function PatrolConsole({ view }: { view: ConsoleView }) {
  const [bundle, setBundle] = useState<RuntimeBundle | null>(null);
  const [config, setConfig] = useState<MonitoringConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const cacheKey = runtimeCacheKey(view);

    try {
      const cached = window.sessionStorage.getItem(cacheKey);
      if (cached) {
        const payload = JSON.parse(cached) as RuntimeBundle;
        if (isRuntimeBundleShape(payload)) {
          setBundle(payload);
          setLoading(false);
        } else {
          window.sessionStorage.removeItem(cacheKey);
        }
      }
    } catch {
      window.sessionStorage.removeItem(cacheKey);
    }

    async function loadRuntime() {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 30_000);
      try {
        const response = await fetch(`/api/pa-bot/runtime?view=${view}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = (await response.json()) as RuntimeBundle;
        if (!isRuntimeBundleShape(payload)) {
          throw new Error('运行态数据结构无效');
        }
        if (!cancelled) {
          setBundle(payload);
          window.sessionStorage.setItem(cacheKey, JSON.stringify(payload));
          setError('');
          setLoading(false);
        }
      } catch (runtimeError) {
        if (!cancelled) {
          setError(runtimeError instanceof Error ? runtimeError.message : '运行态加载失败');
          setLoading(false);
        }
      } finally {
        window.clearTimeout(timer);
      }
    }

    loadRuntime();
    const timer = window.setInterval(loadRuntime, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [view]);

  useEffect(() => {
    if (view !== 'settings') return undefined;
    let cancelled = false;

    async function loadConfig() {
      try {
        const response = await fetch('/api/pa-bot/config', { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        if (!cancelled) {
          setConfig(payload.config as MonitoringConfig);
        }
      } catch (configError) {
        if (!cancelled) {
          setMessage(configError instanceof Error ? configError.message : '配置加载失败');
        }
      }
    }

    loadConfig();
    return () => {
      cancelled = true;
    };
  }, [view]);

  const data = bundle?.primary ?? bundle?.runtimes?.[0] ?? null;

  const trackedSymbols = useMemo(() => buildTrackedSymbols(data), [data]);
  const accountSnapshots = data?.system.accounts || [];
  const symbolBuckets = useMemo(() => buildSymbolBuckets(trackedSymbols), [trackedSymbols]);
  const accountBalanceSummary = useMemo(() => summarizeBalances(accountSnapshots), [accountSnapshots]);
  const tradableAccountCount = useMemo(
    () => accountSnapshots.filter((item) => item.canTrade === true).length,
    [accountSnapshots],
  );
  const staleAccountCount = useMemo(
    () => accountSnapshots.filter((item) => item.stale).length,
    [accountSnapshots],
  );

  const symbolCards = data?.symbols || [];
  const auditSymbols = data?.audit.symbols || [];
  const auditSymbolMap = useMemo(() => buildAuditSymbolMap(auditSymbols), [auditSymbols]);
  const bestCandidateCard = useMemo(() => pickBestCandidateCard(data, symbolCards), [data, symbolCards]);

  const accountPanels = useMemo(
    () => buildAccountPanels(accountSnapshots, symbolCards, trackedSymbols, auditSymbolMap),
    [accountSnapshots, symbolCards, trackedSymbols, auditSymbolMap],
  );

  const realExecutionEvents = useMemo(
    () => filterRealExecutionEvents(data?.recentExecutions || []),
    [data?.recentExecutions],
  );
  const hiddenLogOnlyEvents = useMemo(
    () => (data?.recentExecutions || []).length - realExecutionEvents.length,
    [data?.recentExecutions, realExecutionEvents.length],
  );

  async function saveConfig() {
    if (!config) return;
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/pa-bot/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      setConfig(payload.config as MonitoringConfig);
      setMessage('账户与品种配置已保存，下一轮巡逻会自动读取。');
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : '配置保存失败');
    } finally {
      setSaving(false);
    }
  }

  function patchAccount(index: number, patch: Partial<MonitoringAccount>) {
    setConfig((current) => {
      if (!current) return current;
      const accounts = current.accounts.map((account, accountIndex) =>
        accountIndex === index ? { ...account, ...patch } : account,
      );
      return { ...current, accounts };
    });
  }

  function addAccount() {
    setConfig((current) => ({
      version: current?.version || 1,
      accounts: [
        ...(current?.accounts || []),
        {
          id: `account-${Date.now()}`,
          label: '新账户',
          exchange: 'okx',
          enabled: true,
          role: 'monitor',
          base_url: 'http://127.0.0.1:8095',
          symbols: [],
        },
      ],
    }));
  }

  function removeAccount(index: number) {
    setConfig((current) => {
      if (!current) return current;
      return {
        ...current,
        accounts: current.accounts.filter((_, accountIndex) => accountIndex !== index),
      };
    });
  }

  if (loading && !data) {
    return <LoadingShell />;
  }

  if (!data) {
    return <ErrorCard text={error || '当前没有拿到运行态数据。'} />;
  }

  const runtimeData: RuntimeData = data;

  const contentMap: Record<ConsoleView, React.ReactNode> = {
    overview: (
      <OverviewView
        runtimeData={runtimeData}
        trackedSymbols={trackedSymbols}
        accountSnapshots={accountSnapshots}
        symbolBuckets={symbolBuckets}
        tradableAccountCount={tradableAccountCount}
        accountPanels={accountPanels}
        bestCandidateCard={bestCandidateCard}
      />
    ),
    accounts: (
      <AccountsView
        accountPanels={accountPanels}
        tradableAccountCount={tradableAccountCount}
        staleAccountCount={staleAccountCount}
        trackedSymbols={trackedSymbols}
        symbolBuckets={symbolBuckets}
        accountBalanceSummary={accountBalanceSummary}
      />
    ),
    orders: (
      <OrdersView
        runtimeData={runtimeData}
        realExecutionEvents={realExecutionEvents}
        hiddenLogOnlyEvents={hiddenLogOnlyEvents}
      />
    ),
    audit: <AuditView audit={runtimeData.audit} />,
    system: <SystemView runtimeData={runtimeData} />,
    settings: (
      <SettingsView
        config={config}
        saving={saving}
        message={message}
        onAddAccount={addAccount}
        onSave={saveConfig}
        onRemoveAccount={removeAccount}
        onPatchAccount={patchAccount}
      />
    ),
  };

  return (
    <ConsoleRenderBoundary>
      <div className="space-y-6">
        {error ? (
          <div className="rounded-[18px] border border-amber-400/18 bg-amber-400/8 px-4 py-3 text-sm text-amber-100">
            运行态刷新失败，当前展示的是上一份可用数据。原因：{error}
          </div>
        ) : null}
        {view === 'overview' ? null : (
          <PageIntro
            title={PAGE_META[view].title}
            subtitle={PAGE_META[view].subtitle}
            runtimeData={runtimeData}
          />
        )}
        {contentMap[view]}
      </div>
    </ConsoleRenderBoundary>
  );
}
