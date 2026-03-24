'use client';

import React from 'react';
import type { AccountPanel } from '../types';
import {
  BADGE_BASE_CLASS,
  LABEL_CLASS,
  MUTED_CLASS,
  TABLE_CLASS,
  TABLE_HEAD_CLASS,
  TABLE_ROW_CLASS,
  TABLE_STICKY_CELL_ALT_CLASS,
  TABLE_STICKY_CELL_CLASS,
  TABLE_STICKY_HEAD_CLASS,
  EmptyState,
  TableScroll,
  cn,
  statusTone,
} from '../ui';
import { accountRoleLabel, formatMoney, translateHealthStatusLabel, translateStatusLabel } from '../formatters';

type AccountsViewProps = {
  accountPanels: AccountPanel[];
  tradableAccountCount: number;
  staleAccountCount: number;
  trackedSymbols: string[];
  symbolBuckets: Record<string, number>;
  accountBalanceSummary: string;
};

export function AccountsView({
  accountPanels,
  tradableAccountCount,
  staleAccountCount,
  trackedSymbols,
  symbolBuckets,
  accountBalanceSummary,
}: AccountsViewProps) {
  if (accountPanels.length === 0) return <EmptyState text="当前没有账户快照。" />;

  return (
    <div className="space-y-4">
      <div className={TABLE_CLASS}>
        <div className="grid gap-0 border-b border-white/[0.05] md:grid-cols-4">
          <div className="px-4 py-4">
            <div className={LABEL_CLASS}>在线账户</div>
            <div className="mt-2 font-mono text-2xl font-semibold text-white">{accountPanels.length}</div>
            <div className="mt-2 text-sm text-slate-400">{accountPanels.map((panel) => panel.account.label || panel.account.exchange).join(' / ')}</div>
          </div>
          <div className="border-t border-white/[0.05] px-4 py-4 md:border-l md:border-t-0">
            <div className={LABEL_CLASS}>可交易</div>
            <div className="mt-2 font-mono text-2xl font-semibold text-white">{tradableAccountCount}</div>
            <div className="mt-2 text-sm text-slate-400">{staleAccountCount > 0 ? `回退快照 ${staleAccountCount}` : '全部实时快照'}</div>
          </div>
          <div className="border-t border-white/[0.05] px-4 py-4 xl:border-l xl:border-t-0">
            <div className={LABEL_CLASS}>监控覆盖</div>
            <div className="mt-2 font-mono text-2xl font-semibold text-white">{trackedSymbols.length}</div>
            <div className="mt-2 text-sm text-slate-400">{Object.entries(symbolBuckets).map(([key, count]) => `${key} ${count}`).join(' / ') || '暂无覆盖'}</div>
          </div>
          <div className="border-t border-white/[0.05] px-4 py-4 md:border-l xl:border-t-0">
            <div className={LABEL_CLASS}>资产摘要</div>
            <div className="mt-2 font-mono text-xl font-semibold text-white">{accountPanels.map((panel) => panel.account.accountAsset || 'USD').join(' / ')}</div>
            <div className="mt-2 text-sm text-slate-400">{accountBalanceSummary || '暂无资产快照'}</div>
          </div>
        </div>
      </div>

      <div className={TABLE_CLASS}>
        <TableScroll className="max-h-[520px]">
          <div className="sticky top-0 z-10 hidden grid-cols-[minmax(170px,1.05fr)_0.9fr_1fr_0.95fr_0.85fr_0.7fr_0.7fr] gap-4 border-b border-white/[0.05] bg-[#091019]/95 px-4 py-3 text-[10px] uppercase tracking-[0.24em] text-slate-500 lg:grid">
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
                ? 'text-emerald-300'
                : account.canTrade === false
                  ? 'text-rose-300'
                  : 'text-amber-300';

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
                      index % 2 === 1 ? TABLE_STICKY_CELL_ALT_CLASS : TABLE_STICKY_CELL_CLASS,
                    )}
                  >
                    <div className="text-sm font-semibold text-white">{account.label || account.exchange}</div>
                    <div className="mt-1 text-xs text-slate-500">{account.exchange} · {account.baseUrl || '-'}</div>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:flex-col lg:items-start">
                    <span className={cn(BADGE_BASE_CLASS, 'bg-white/[0.045] text-slate-200')}>
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
                  <div className="space-y-1 text-sm">
                    <div className="font-mono tabular-nums text-white">
                      {formatMoney(account.balanceTotal, account.accountAsset || 'USD')}
                    </div>
                    <div className="font-mono tabular-nums text-slate-400">
                      可用 {formatMoney(account.balanceAvailable, account.accountAsset || 'USD')}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {panel.bucketCounts.length === 0 ? (
                      <span className="text-xs text-slate-500">暂无</span>
                    ) : (
                      panel.bucketCounts.map((item) => (
                        <span
                          key={`${account.exchange}-${item.label}`}
                          className={cn(BADGE_BASE_CLASS, 'bg-white/[0.038] text-slate-200')}
                        >
                          {item.label} {item.count}
                        </span>
                      ))
                    )}
                  </div>
                  <div className="space-y-1 text-sm text-slate-300">
                    <div>监控 {panel.configuredSymbols.length}</div>
                    <div>焦点 {panel.scopedFocus.length}</div>
                    <div>候选 {panel.scopedCandidateCount}</div>
                  </div>
                  <div className="space-y-1 text-sm text-slate-300">
                    <div>持仓 {account.positionsCount}</div>
                    <div>挂单 {account.ordersCount}</div>
                  </div>
                  <div>
                    <div className={cn('text-sm font-medium', tradeTone)}>{tradeLabel}</div>
                    <div className="mt-1 text-xs text-slate-500">{translateHealthStatusLabel(account.healthStatus || '-')}</div>
                  </div>
                </div>
              </article>
            );
          })}
        </TableScroll>
      </div>

      <div className={TABLE_CLASS}>
        <TableScroll className="max-h-[560px]">
          <div className={cn(TABLE_HEAD_CLASS, 'sticky top-0 z-10 grid grid-cols-[0.85fr_1.2fr_1fr] gap-4 bg-[#091019]/95 px-4 py-3')}>
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
                  index % 2 === 1 ? TABLE_STICKY_CELL_ALT_CLASS : TABLE_STICKY_CELL_CLASS,
                )}
              >
                <div className="font-medium text-white">{panel.account.label || panel.account.exchange}</div>
                <div className={MUTED_CLASS}>{panel.account.exchange} · {panel.account.baseUrl || '-'}</div>
              </div>
              <div className="text-sm leading-7 text-slate-300">
                {panel.groupedSymbols.length === 0
                  ? '当前没有配置监控品种。'
                  : panel.groupedSymbols.map((group) => `${group.label}: ${group.symbols.join(' / ')}`).join('  |  ')}
              </div>
              <div className="space-y-2">
                {panel.topStates.length === 0 ? (
                  <div className="text-sm text-slate-500">当前没有结构摘要。</div>
                ) : (
                  panel.topStates.map((item) => (
                    <div
                      key={`${panel.account.exchange}-state-inline-${item.symbol}`}
                      className="flex items-start justify-between gap-3 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-white">{item.symbol}</div>
                        <div className="mt-1 text-xs leading-5 text-slate-500">
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
}
