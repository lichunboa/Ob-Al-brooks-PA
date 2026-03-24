'use client';

import React from 'react';
import { BarChart3, Bot, Plus, Save, Trash2, Wallet } from 'lucide-react';
import type { MonitoringAccount, MonitoringConfig } from '../types';
import { accountRoleLabel, bucketCountsForSymbols, groupSymbolsByBucket } from '../formatters';
import { normalizeSymbolText } from '../derived';
import {
  BUTTON_ACCENT_CLASS,
  BUTTON_GHOST_CLASS,
  INPUT_CLASS,
  LABEL_CLASS,
  TABLE_CLASS,
  TABLE_HEAD_CLASS,
  TableScroll,
  Section,
  TerminalBadge,
  cn,
} from '../ui';

type SettingsViewProps = {
  config: MonitoringConfig | null;
  saving: boolean;
  message: string;
  onAddAccount: () => void;
  onSave: () => void;
  onRemoveAccount: (index: number) => void;
  onPatchAccount: (index: number, patch: Partial<MonitoringAccount>) => void;
};

export function SettingsView({
  config,
  saving,
  message,
  onAddAccount,
  onSave,
  onRemoveAccount,
  onPatchAccount,
}: SettingsViewProps) {
  const enabledAccounts = config?.accounts.filter((item) => item.enabled).length || 0;
  const totalSymbols = (config?.accounts || []).reduce((sum, item) => sum + item.symbols.length, 0);
  const totalAccounts = config?.accounts.length || 0;

  return (
    <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <Section title="账户路由配置" icon={Bot} subtitle="保存后下一轮自动读取">
        <div className={TABLE_CLASS}>
          <div className="grid gap-0 border-b border-white/[0.05] md:grid-cols-[0.75fr_0.75fr_1fr_auto]">
            <div className="px-4 py-3.5">
              <div className={LABEL_CLASS}>账户</div>
              <div className="mt-2 font-mono text-2xl font-semibold text-white">{totalAccounts}</div>
              <div className="mt-1 text-xs text-slate-500">已配置账户</div>
            </div>
            <div className="border-t border-white/[0.05] px-4 py-3.5 md:border-l md:border-t-0">
              <div className={LABEL_CLASS}>启用</div>
              <div className="mt-2 font-mono text-2xl font-semibold text-white">{enabledAccounts}</div>
              <div className="mt-1 text-xs text-slate-500">当前启用账户</div>
            </div>
            <div className="border-t border-white/[0.05] px-4 py-3.5 md:border-l md:border-t-0">
              <div className={LABEL_CLASS}>监控品种</div>
              <div className="mt-2 font-mono text-2xl font-semibold text-white">{totalSymbols}</div>
              <div className="mt-1 text-xs text-slate-500">下一轮直接读取</div>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-white/[0.05] px-4 py-3.5 md:justify-end md:border-l md:border-t-0">
              <button type="button" onClick={onAddAccount} className={BUTTON_GHOST_CLASS}>
                <Plus className="h-4 w-4" />
                添加账户
              </button>
              <button type="button" onClick={onSave} disabled={saving || !config} className={BUTTON_ACCENT_CLASS}>
                <Save className="h-4 w-4" />
                {saving ? '保存中' : '保存配置'}
              </button>
            </div>
          </div>
          {message ? (
            <div className="px-4 py-3 text-sm text-slate-300">
              <span className="rounded-full bg-white/[0.05] px-3 py-1.5">{message}</span>
            </div>
          ) : null}
        </div>

        <div className="mt-5 space-y-4">
          {!config || config.accounts.length === 0 ? (
            <div className="rounded-[16px] border border-dashed border-white/[0.08] bg-black/18 px-4 py-8 text-center text-sm text-slate-400">
              当前没有配置账户。
            </div>
          ) : null}

          {(config?.accounts || []).map((account, index) => {
            const bucketCounts = bucketCountsForSymbols(account.symbols);
            return (
              <article key={account.id} className="rounded-[16px] border border-white/[0.06] bg-white/[0.02]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.05] px-4 py-3.5">
                  <div>
                    <div className="text-base font-semibold text-white">{account.label || account.id}</div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <TerminalBadge>{account.exchange || '-'}</TerminalBadge>
                      <TerminalBadge kind="info">{accountRoleLabel(account.role)}</TerminalBadge>
                      <TerminalBadge kind={account.enabled ? 'success' : 'neutral'}>
                        {account.enabled ? '启用' : '停用'}
                      </TerminalBadge>
                      <TerminalBadge>{`品种 ${account.symbols.length}`}</TerminalBadge>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveAccount(index)}
                    className="inline-flex items-center gap-2 rounded-full bg-rose-400/[0.12] px-3 py-2 text-sm text-rose-100 transition duration-150 hover:bg-rose-400/[0.18] active:scale-[0.99]"
                  >
                    <Trash2 className="h-4 w-4" />
                    删除
                  </button>
                </div>

                <div className="grid gap-4 px-4 py-4 xl:grid-cols-[minmax(0,1.08fr)_280px]">
                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="space-y-2 text-sm text-slate-300">
                        <span className={LABEL_CLASS}>显示名称</span>
                        <input
                          value={account.label}
                          onChange={(event) => onPatchAccount(index, { label: event.target.value })}
                          className={INPUT_CLASS}
                          placeholder="例如 cTrader Demo"
                        />
                      </label>
                      <label className="space-y-2 text-sm text-slate-300">
                        <span className={LABEL_CLASS}>交易所</span>
                        <input
                          value={account.exchange}
                          onChange={(event) => onPatchAccount(index, { exchange: event.target.value.toLowerCase() })}
                          className={cn(INPUT_CLASS, 'font-mono text-sm')}
                          placeholder="例如 ctrader / binance"
                        />
                      </label>
                      <label className="space-y-2 text-sm text-slate-300">
                        <span className={LABEL_CLASS}>服务地址</span>
                        <input
                          value={account.base_url}
                          onChange={(event) => onPatchAccount(index, { base_url: event.target.value })}
                          className={cn(INPUT_CLASS, 'font-mono text-sm')}
                          placeholder="http://127.0.0.1:8092"
                        />
                      </label>
                      <label className="space-y-2 text-sm text-slate-300">
                        <span className={LABEL_CLASS}>角色</span>
                        <select
                          value={account.role}
                          onChange={(event) =>
                            onPatchAccount(index, { role: event.target.value as MonitoringAccount['role'] })
                          }
                          className={INPUT_CLASS}
                        >
                          <option value="primary">主路由账户</option>
                          <option value="monitor">辅助路由账户</option>
                        </select>
                      </label>
                    </div>

                    <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={account.enabled}
                        onChange={(event) => onPatchAccount(index, { enabled: event.target.checked })}
                        className="h-4 w-4 rounded border-white/10 bg-[#0a1017] text-cyan-400 focus:ring-cyan-400/20"
                      />
                      启用账户
                    </label>

                    <label className="block space-y-2 text-sm text-slate-300">
                      <span className={LABEL_CLASS}>监控品种（逗号或换行分隔）</span>
                      <textarea
                        value={account.symbols.join('\n')}
                        onChange={(event) => onPatchAccount(index, { symbols: normalizeSymbolText(event.target.value) })}
                        rows={4}
                        className={cn(INPUT_CLASS, 'min-h-[150px] font-mono text-sm leading-6')}
                        placeholder={'EURUSD\nGBPUSD\nBTCUSDT'}
                      />
                    </label>
                  </div>

                  <div className={TABLE_CLASS}>
                    <div className="border-b border-white/[0.05] px-4 py-3">
                      <div className={LABEL_CLASS}>配置侧写</div>
                      <div className="mt-2 text-sm font-medium text-white">{account.label || account.id}</div>
                    </div>
                    <div className="space-y-3 px-4 py-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <div className={LABEL_CLASS}>角色</div>
                          <div className="mt-2 text-sm text-slate-200">{accountRoleLabel(account.role)}</div>
                        </div>
                        <div>
                          <div className={LABEL_CLASS}>服务</div>
                          <div className="mt-2 break-all font-mono text-xs text-slate-400">{account.base_url || '-'}</div>
                        </div>
                      </div>
                      <div>
                        <div className={LABEL_CLASS}>覆盖分类</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {bucketCounts.length === 0 ? (
                            <span className="text-sm text-slate-500">暂无品种</span>
                          ) : (
                            bucketCounts.map((item) => (
                              <span
                                key={`${account.id}-${item.label}`}
                                className="rounded-full bg-white/[0.045] px-3 py-1 text-xs text-slate-200"
                              >
                                {item.label} {item.count}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                      <div>
                        <div className={LABEL_CLASS}>状态</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <TerminalBadge kind={account.enabled ? 'success' : 'neutral'}>
                            {account.enabled ? '启用' : '停用'}
                          </TerminalBadge>
                          <TerminalBadge kind="info">{account.exchange || '-'}</TerminalBadge>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </Section>

      <div className="space-y-5 xl:sticky xl:top-6">
        <Section title="配置说明" icon={Wallet} subtitle="只保留执行配置与覆盖预览">
          <div className={TABLE_CLASS}>
            <div className={cn(TABLE_HEAD_CLASS, 'grid grid-cols-[0.5fr_1fr] gap-3 border-b border-white/[0.05] px-4 py-3')}>
              <div>项目</div>
              <div>说明</div>
            </div>
            {[
              ['生效方式', '保存后不会重启服务，runtime 会在下一轮读取新账户、角色和品种配置。'],
              ['角色语义', '主路由决定默认摘要与默认路由，辅助路由仍然可以交易。'],
              ['当前配置', `启用账户 ${enabledAccounts} 个 · 监控品种 ${totalSymbols} 个`],
            ].map(([label, value], index) => (
              <div
                key={label}
                className={cn(
                  'grid gap-3 px-4 py-3 text-sm md:grid-cols-[0.5fr_1fr]',
                  index > 0 && 'border-t border-white/[0.05]',
                )}
              >
                <div className="text-slate-500">{label}</div>
                <div className="text-slate-300">{value}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="品种预览" icon={BarChart3} subtitle="按账户查看最终覆盖范围">
          {!config || config.accounts.length === 0 ? (
            <div className="rounded-[16px] border border-dashed border-white/[0.08] bg-black/18 px-4 py-8 text-center text-sm text-slate-400">
              当前没有配置账户。
            </div>
          ) : (
            <div className="space-y-3">
              {config.accounts.map((account) => (
                <article key={account.id} className={TABLE_CLASS}>
                  <div className="flex items-center justify-between gap-3 border-b border-white/[0.05] px-4 py-3">
                    <div>
                      <div className="text-sm font-semibold text-white">{account.label}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {account.enabled ? '启用' : '停用'} · {accountRoleLabel(account.role)}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {bucketCountsForSymbols(account.symbols).map((item) => (
                        <span
                          key={`${account.id}-${item.label}`}
                          className="rounded-full bg-white/[0.045] px-3 py-1 text-xs text-slate-200"
                        >
                          {item.label} {item.count}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="px-4 py-3">
                    <TableScroll className="max-h-[260px]">
                      <div className={cn(TABLE_HEAD_CLASS, 'grid grid-cols-[0.4fr_1fr] gap-3 px-0 py-0')}>
                        <div>分类</div>
                        <div>品种</div>
                      </div>
                      <div className="mt-3 space-y-2">
                        {groupSymbolsByBucket(account.symbols).length === 0 ? (
                          <div className="text-sm text-slate-500">暂无品种</div>
                        ) : (
                          groupSymbolsByBucket(account.symbols).map((group, index) => (
                            <div
                              key={`${account.id}-${group.label}`}
                              className={cn(
                                'grid gap-3 rounded-[12px] bg-white/[0.02] px-3 py-3 text-sm md:grid-cols-[0.4fr_1fr]',
                                index > 0 && 'border-t border-white/[0.05]',
                              )}
                            >
                              <div className="text-slate-500">{group.label}</div>
                              <div className="text-slate-200">{group.symbols.join(' / ')}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </TableScroll>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
