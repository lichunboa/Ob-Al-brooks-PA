'use client';

import React, { useMemo, useState } from 'react';
import type { AccountPanel } from '../types';
import {
  BADGE_BASE_CLASS,
  LABEL_CLASS,
  MUTED_CLASS,
  TABLE_CLASS,
  TABLE_HEAD_CLASS,
  TABLE_ROW_CLASS,
  TABLE_STICKY_CELL_CLASS,
  TABLE_STICKY_HEAD_CLASS,
  EmptyState,
  TableScroll,
  cn,
  statusTone,
} from '../ui';
import { accountRoleLabel, formatMoney, translateHealthStatusLabel, translateStatusLabel } from '../formatters';

type AccountsViewProps = {
  updatedAt: string;
  accountPanels: AccountPanel[];
  tradableAccountCount: number;
  staleAccountCount: number;
  trackedSymbols: string[];
  symbolBuckets: Record<string, number>;
  accountBalanceSummary: string;
};

export const AccountsView = React.memo(function AccountsView({
  updatedAt,
  accountPanels,
  tradableAccountCount,
  staleAccountCount,
  trackedSymbols,
  symbolBuckets,
  accountBalanceSummary,
}: AccountsViewProps) {
  if (accountPanels.length === 0) return <EmptyState text="当前没有账户快照。" />;

  const [activeExchange, setActiveExchange] = useState('ALL');
  const exchangeTabs = useMemo(
    () => ['ALL', ...Array.from(new Set(accountPanels.map((panel) => String(panel.account.exchange || '').trim().toUpperCase()).filter(Boolean)))],
    [accountPanels],
  );
  const resolvedExchange = exchangeTabs.includes(activeExchange) ? activeExchange : 'ALL';
  const visiblePanels =
    resolvedExchange === 'ALL'
      ? accountPanels
      : accountPanels.filter((panel) => String(panel.account.exchange || '').trim().toUpperCase() === resolvedExchange);

  const primaryAsset = accountPanels[0]?.account.accountAsset || 'USD';
  const totalEquity = accountPanels.reduce((sum, panel) => sum + (panel.account.balanceTotal || 0), 0);
  const totalAvailable = accountPanels.reduce((sum, panel) => sum + (panel.account.balanceAvailable || 0), 0);
  const totalPositions = accountPanels.reduce((sum, panel) => sum + (panel.account.positionsCount || 0), 0);
  const totalOrders = accountPanels.reduce((sum, panel) => sum + (panel.account.ordersCount || 0), 0);
  const blockedAccountCount = accountPanels.filter((panel) => panel.account.canTrade === false).length;
  const visibleEquity = visiblePanels.reduce((sum, panel) => sum + (panel.account.balanceTotal || 0), 0);
  const visibleAvailable = visiblePanels.reduce((sum, panel) => sum + (panel.account.balanceAvailable || 0), 0);
  const visiblePositions = visiblePanels.reduce((sum, panel) => sum + (panel.account.positionsCount || 0), 0);
  const visibleOrders = visiblePanels.reduce((sum, panel) => sum + (panel.account.ordersCount || 0), 0);
  const updatedAtLabel = updatedAt
    ? new Date(updatedAt).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '-';
  const exchangeSnapshots = exchangeTabs
    .filter((item) => item !== 'ALL')
    .map((exchange) => {
      const panels = accountPanels.filter((panel) => String(panel.account.exchange || '').trim().toUpperCase() === exchange);
      return {
        exchange,
        equity: panels.reduce((sum, panel) => sum + (panel.account.balanceTotal || 0), 0),
        available: panels.reduce((sum, panel) => sum + (panel.account.balanceAvailable || 0), 0),
        tradable: panels.filter((panel) => panel.account.canTrade === true).length,
        positions: panels.reduce((sum, panel) => sum + (panel.account.positionsCount || 0), 0),
        orders: panels.reduce((sum, panel) => sum + (panel.account.ordersCount || 0), 0),
      };
    });

  return (
    <div className="flex flex-col gap-4">
      <section className={cn(TABLE_CLASS, 'px-4 py-3')}>
        <div className="grid gap-3 lg:grid-cols-5">
          <div className="rounded-lg border border-border bg-white/[0.02] px-4 py-3">
            <div className={LABEL_CLASS}>Last Update</div>
            <div className="mt-2 font-mono text-sm text-foreground">{updatedAtLabel}</div>
            <div className="mt-1 text-xs text-foreground-faint">账户与执行快照同步时间</div>
          </div>
          <div className="rounded-lg border border-border bg-white/[0.02] px-4 py-3">
            <div className={LABEL_CLASS}>Total Equity</div>
            <div className="mt-2 font-mono text-lg text-foreground">{formatMoney(totalEquity, primaryAsset)}</div>
            <div className="mt-1 text-xs text-foreground-faint">{accountBalanceSummary || '按账户快照聚合'}</div>
          </div>
          <div className="rounded-lg border border-border bg-white/[0.02] px-4 py-3">
            <div className={LABEL_CLASS}>Available</div>
            <div className="mt-2 font-mono text-lg text-foreground">{formatMoney(totalAvailable, primaryAsset)}</div>
            <div className="mt-1 text-xs text-foreground-faint">可用于新开仓的合计余额</div>
          </div>
          <div className="rounded-lg border border-border bg-white/[0.02] px-4 py-3">
            <div className={LABEL_CLASS}>Positions / Orders</div>
            <div className="mt-2 font-mono text-lg text-foreground">{totalPositions} / {totalOrders}</div>
            <div className="mt-1 text-xs text-foreground-faint">交易所实时账户视角</div>
          </div>
          <div className="rounded-lg border border-border bg-white/[0.02] px-4 py-3">
            <div className={LABEL_CLASS}>Tradable</div>
            <div className="mt-2 font-mono text-lg text-foreground">{tradableAccountCount}/{accountPanels.length}</div>
            <div className="mt-1 text-xs text-foreground-faint">阻塞 {blockedAccountCount} / 回退 {staleAccountCount}</div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-foreground-faint">
          <span className="rounded-full border border-border bg-white/[0.02] px-2.5 py-1">
            已接入 {accountPanels.length} 个账户
          </span>
          <span className="rounded-full border border-border bg-white/[0.02] px-2.5 py-1">
            覆盖 {trackedSymbols.length} 个监控品种
          </span>
          <span className="rounded-full border border-border bg-white/[0.02] px-2.5 py-1">
            分桶 {Object.entries(symbolBuckets).map(([key, count]) => `${key} ${count}`).join(' / ') || '暂无'}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-white/[0.025] px-3 py-2 text-xs text-foreground-faint">
          <div className="flex flex-wrap items-center gap-2">
            {exchangeTabs.map((exchange) => {
              const active = exchange === resolvedExchange;
              return (
                <button
                  key={exchange}
                  type="button"
                  className={cn(
                    'rounded-full border px-2.5 py-1 transition',
                    active
                      ? 'border-cyan-400/40 bg-cyan-400/12 text-cyan-100'
                      : 'border-border bg-white/[0.03] text-foreground-faint hover:border-cyan-400/25 hover:text-foreground',
                  )}
                  onClick={() => setActiveExchange(exchange)}
                >
                  {exchange === 'ALL' ? '全部账户' : exchange}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>当前视图 {visiblePanels.length} 账户</span>
            <span>权益 {formatMoney(visibleEquity, primaryAsset)}</span>
            <span>可用 {formatMoney(visibleAvailable, primaryAsset)}</span>
            <span>持仓 / 挂单 {visiblePositions} / {visibleOrders}</span>
          </div>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {exchangeSnapshots.map((snapshot) => (
            <button
              key={snapshot.exchange}
              type="button"
              className={cn(
                'rounded-xl border px-4 py-3 text-left transition',
                snapshot.exchange === resolvedExchange
                  ? 'border-cyan-400/35 bg-cyan-400/[0.07]'
                  : 'border-border bg-white/[0.02] hover:border-cyan-400/20',
              )}
              onClick={() => setActiveExchange(snapshot.exchange)}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-foreground">{snapshot.exchange}</div>
                <span className={cn(BADGE_BASE_CLASS, snapshot.tradable > 0 ? 'bg-emerald-400/[0.12] text-emerald-100' : 'bg-rose-400/[0.12] text-rose-100')}>
                  {snapshot.tradable}/{accountPanels.filter((panel) => String(panel.account.exchange || '').trim().toUpperCase() === snapshot.exchange).length} 可交易
                </span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-4">
                <div>
                  <div className={LABEL_CLASS}>权益</div>
                  <div className="mt-1 font-mono text-sm text-foreground">{formatMoney(snapshot.equity, primaryAsset)}</div>
                </div>
                <div>
                  <div className={LABEL_CLASS}>可用</div>
                  <div className="mt-1 font-mono text-sm text-foreground">{formatMoney(snapshot.available, primaryAsset)}</div>
                </div>
                <div>
                  <div className={LABEL_CLASS}>持仓</div>
                  <div className="mt-1 font-mono text-sm text-foreground">{snapshot.positions}</div>
                </div>
                <div>
                  <div className={LABEL_CLASS}>挂单</div>
                  <div className="mt-1 font-mono text-sm text-foreground">{snapshot.orders}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        {visiblePanels.map((panel) => {
          const account = panel.account;
          const tradeLabel = account.canTrade === true ? '可交易' : account.canTrade === false ? '阻塞' : '待确认';
          const tradeTone =
            account.canTrade === true
              ? 'text-success'
              : account.canTrade === false
                ? 'text-danger'
                : 'text-warning';
          return (
            <article
              key={`${account.exchange}-${account.accountId || account.label || 'card'}`}
              className={cn(TABLE_CLASS, 'px-4 py-4')}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-foreground-faint">{account.exchange}</div>
                  <div className="mt-2 text-lg font-semibold text-foreground">{account.label || account.exchange}</div>
                  <div className="mt-1 text-xs text-foreground-faint">{account.baseUrl || '-'}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className={cn(BADGE_BASE_CLASS, 'bg-white/[0.045] text-foreground')}>
                    {accountRoleLabel(account.role)}
                  </span>
                  <span
                    className={cn(
                      BADGE_BASE_CLASS,
                      account.stale ? 'bg-amber-400/[0.12] text-amber-100' : 'bg-emerald-400/[0.10] text-emerald-100',
                    )}
                  >
                    {account.stale ? '回退快照' : '实时快照'}
                  </span>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border border-border bg-white/[0.02] px-3 py-3">
                  <div className={LABEL_CLASS}>总资产</div>
                  <div className="mt-2 font-mono text-base text-foreground">{formatMoney(account.balanceTotal, account.accountAsset || 'USD')}</div>
                </div>
                <div className="rounded-lg border border-border bg-white/[0.02] px-3 py-3">
                  <div className={LABEL_CLASS}>可用</div>
                  <div className="mt-2 font-mono text-base text-foreground">{formatMoney(account.balanceAvailable, account.accountAsset || 'USD')}</div>
                </div>
                <div className="rounded-lg border border-border bg-white/[0.02] px-3 py-3">
                  <div className={LABEL_CLASS}>持仓 / 挂单</div>
                  <div className="mt-2 font-mono text-base text-foreground">{account.positionsCount} / {account.ordersCount}</div>
                </div>
                <div className="rounded-lg border border-border bg-white/[0.02] px-3 py-3">
                  <div className={LABEL_CLASS}>状态</div>
                  <div className={cn('mt-2 text-sm font-medium', tradeTone)}>{tradeLabel}</div>
                  <div className="mt-1 text-xs text-foreground-faint">{translateHealthStatusLabel(account.healthStatus || '-')}</div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-foreground-faint">
                <span className={cn(BADGE_BASE_CLASS, 'bg-white/[0.04] text-foreground')}>
                  覆盖 {panel.configuredSymbols.length} 个品种
                </span>
                <span className={cn(BADGE_BASE_CLASS, 'bg-white/[0.04] text-foreground')}>
                  焦点 {panel.scopedFocus.length}
                </span>
                <span className={cn(BADGE_BASE_CLASS, 'bg-white/[0.04] text-foreground')}>
                  候选 {panel.scopedCandidateCount}
                </span>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-[0.88fr_1.12fr]">
                <div className="rounded-lg border border-border bg-white/[0.02] px-3 py-3">
                  <div className={LABEL_CLASS}>账户覆盖</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {panel.bucketCounts.length === 0 ? (
                      <span className="text-xs text-foreground-faint">暂无</span>
                    ) : (
                      panel.bucketCounts.map((item) => (
                        <span
                          key={`${account.exchange}-${item.label}`}
                          className={cn(BADGE_BASE_CLASS, 'bg-white/[0.038] text-foreground')}
                        >
                          {item.label} {item.count}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-white/[0.02] px-3 py-3">
                  <div className={LABEL_CLASS}>焦点结构</div>
                  <div className="mt-2 space-y-2">
                    {panel.topStates.length === 0 ? (
                      <div className="text-sm text-foreground-faint">当前没有结构摘要。</div>
                    ) : (
                      panel.topStates.slice(0, 3).map((item) => (
                        <div key={`${panel.account.exchange}-state-card-${item.symbol}`} className="flex items-start justify-between gap-3 text-sm">
                          <div className="min-w-0">
                            <div className="font-medium text-foreground">{item.symbol}</div>
                            <div className="mt-1 text-xs leading-5 text-foreground-faint">
                              {item.execution_summary || item.planned_action || '-'}
                            </div>
                          </div>
                          <span className={cn(BADGE_BASE_CLASS, statusTone(item.status || 'watch'))}>
                            {translateStatusLabel(item.status || '-')}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className={TABLE_CLASS}>
        <TableScroll className="max-h-[520px]">
          <div className="sticky top-0 z-10 hidden grid-cols-[minmax(170px,1.05fr)_0.9fr_1fr_0.95fr_0.85fr_0.7fr_0.7fr] gap-4 border-b border-border bg-surface px-4 py-3 text-[10px] uppercase tracking-[0.24em] text-foreground-faint lg:grid">
            <div className={cn('lg:sticky lg:left-0', TABLE_STICKY_HEAD_CLASS)}>账户</div>
            <div>角色 / 快照</div>
            <div>资产 / 可用</div>
            <div>覆盖市场</div>
            <div>监控 / 焦点</div>
            <div>持仓 / 挂单</div>
            <div>状态</div>
          </div>

          {accountPanels.map((panel, index) => {
            const account = panel.account;
            const tradeLabel = account.canTrade === true ? '可交易' : account.canTrade === false ? '阻塞' : '待确认';
            const tradeTone =
              account.canTrade === true
                ? 'text-success'
                : account.canTrade === false
                  ? 'text-danger'
                  : 'text-warning';

            return (
              <article
                key={`${account.exchange}-${account.accountId || account.label || 'account'}`}
                className={cn(
                  'px-4 py-4',
                  TABLE_ROW_CLASS,
                  index > 0 && 'border-t',
                  index % 2 === 1 && 'bg-white/[0.015]',
                )}
              >
                <div className="grid gap-4 lg:grid-cols-[minmax(170px,1.05fr)_0.9fr_1fr_0.95fr_0.85fr_0.7fr_0.7fr]">
                  <div
                    className={cn(
                      'lg:sticky lg:left-0',
                      index % 2 === 1 ? TABLE_STICKY_CELL_CLASS : TABLE_STICKY_CELL_CLASS,
                    )}
                  >
                    <div className="text-sm font-semibold text-foreground">{account.label || account.exchange}</div>
                    <div className="mt-1 text-xs text-foreground-faint">{account.exchange} · {account.baseUrl || '-'}</div>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:flex-col lg:items-start">
                    <span className={cn(BADGE_BASE_CLASS, 'bg-white/[0.045] text-foreground')}>
                      {accountRoleLabel(account.role)}
                    </span>
                    <span
                      className={cn(
                        BADGE_BASE_CLASS,
                        account.stale ? 'bg-amber-400/[0.12] text-amber-100' : 'bg-emerald-400/[0.10] text-emerald-100',
                      )}
                    >
                      {account.stale ? '回退快照' : '实时快照'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 text-sm">
                    <div className="font-mono tabular-nums text-foreground">
                      {formatMoney(account.balanceTotal, account.accountAsset || 'USD')}
                    </div>
                    <div className="font-mono tabular-nums text-foreground-muted">
                      可用 {formatMoney(account.balanceAvailable, account.accountAsset || 'USD')}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {panel.bucketCounts.length === 0 ? (
                      <span className="text-xs text-foreground-faint">暂无</span>
                    ) : (
                      panel.bucketCounts.map((item) => (
                        <span
                          key={`${account.exchange}-${item.label}`}
                          className={cn(BADGE_BASE_CLASS, 'bg-white/[0.038] text-foreground')}
                        >
                          {item.label} {item.count}
                        </span>
                      ))
                    )}
                  </div>
                  <div className="flex flex-col gap-1 text-sm text-foreground-muted">
                    <div>监控 {panel.configuredSymbols.length}</div>
                    <div>焦点 {panel.scopedFocus.length}</div>
                    <div>候选 {panel.scopedCandidateCount}</div>
                  </div>
                  <div className="flex flex-col gap-1 text-sm text-foreground-muted">
                    <div>持仓 {account.positionsCount}</div>
                    <div>挂单 {account.ordersCount}</div>
                  </div>
                  <div>
                    <div className={cn('text-sm font-medium', tradeTone)}>{tradeLabel}</div>
                    <div className="mt-1 text-xs text-foreground-faint">{translateHealthStatusLabel(account.healthStatus || '-')}</div>
                  </div>
                </div>
              </article>
            );
          })}
        </TableScroll>
      </div>

      <div className={TABLE_CLASS}>
        <TableScroll className="max-h-[560px]">
          <div className={cn(TABLE_HEAD_CLASS, 'sticky top-0 z-10 grid grid-cols-[0.85fr_1.2fr_1fr] gap-4 bg-surface px-4 py-3')}>
            <div className={cn('lg:sticky lg:left-0', TABLE_STICKY_HEAD_CLASS)}>账户覆盖明细</div>
            <div>监控品种</div>
            <div>当前结构</div>
          </div>
          {accountPanels.map((panel, index) => (
            <article
              key={`${panel.account.exchange}-coverage-detail`}
              className={cn(
                'grid gap-4 px-4 py-4 lg:grid-cols-[0.85fr_1.2fr_1fr]',
                TABLE_ROW_CLASS,
                index > 0 && 'border-t',
                index % 2 === 1 && 'bg-white/[0.015]',
              )}
            >
              <div
                className={cn(
                  'lg:sticky lg:left-0',
                  index % 2 === 1 ? TABLE_STICKY_CELL_CLASS : TABLE_STICKY_CELL_CLASS,
                )}
              >
                <div className="font-medium text-foreground">{panel.account.label || panel.account.exchange}</div>
                <div className={MUTED_CLASS}>{panel.account.exchange} · {panel.account.baseUrl || '-'}</div>
              </div>
              <div className="text-sm leading-7 text-foreground-muted">
                {panel.groupedSymbols.length === 0
                  ? '当前没有配置监控品种。'
                  : panel.groupedSymbols.map((group) => `${group.label}: ${group.symbols.join(' / ')}`).join('  |  ')}
              </div>
              <div className="flex flex-col gap-2">
                {panel.topStates.length === 0 ? (
                  <div className="text-sm text-foreground-faint">当前没有结构摘要。</div>
                ) : (
                  panel.topStates.map((item) => (
                    <div
                      key={`${panel.account.exchange}-state-inline-${item.symbol}`}
                      className="flex items-start justify-between gap-3 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-foreground">{item.symbol}</div>
                        <div className="mt-1 text-xs leading-5 text-foreground-faint">
                          {item.execution_summary || item.planned_action || '-'}
                        </div>
                      </div>
                      <span className={cn(BADGE_BASE_CLASS, statusTone(item.status || 'watch'))}>
                        {translateStatusLabel(item.status || '-')}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </article>
          ))}
        </TableScroll>
      </div>
    </div>
  );
});
