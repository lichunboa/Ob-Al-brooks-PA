'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Expand, RefreshCw, Shrink, TrendingUp } from 'lucide-react';
import { cn } from './console/ui';
import { normalizeChartSymbol } from '../../lib/pa-bot/runtime-symbols';

type MarketKind = 'crypto' | 'forex';

type TradingViewExchange = {
  id: string;
  name: string;
  prefix: string;
  suffix?: string;
  markets: MarketKind[];
};

const TRADINGVIEW_EXCHANGES: readonly TradingViewExchange[] = [
  { id: 'BINANCE', name: 'Binance', prefix: 'BINANCE:', suffix: '.P', markets: ['crypto'] },
  { id: 'BYBIT', name: 'Bybit', prefix: 'BYBIT:', suffix: '.P', markets: ['crypto'] },
  { id: 'OKX', name: 'OKX', prefix: 'OKX:', suffix: '.P', markets: ['crypto'] },
  { id: 'BITGET', name: 'Bitget', prefix: 'BITGET:', suffix: '.P', markets: ['crypto'] },
  { id: 'OANDA', name: 'OANDA', prefix: 'OANDA:', markets: ['forex'] },
  { id: 'FX_IDC', name: 'FX_IDC', prefix: 'FX_IDC:', markets: ['forex'] },
] as const;

const QUICK_SYMBOLS: Record<MarketKind, string[]> = {
  crypto: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT'],
  forex: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF'],
};

const INTERVAL_MAP: Record<string, string> = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '30m': '30',
  '1h': '60',
  '4h': '240',
  '1d': 'D',
};

type TradingViewMarketChartProps = {
  symbol: string;
  timeframe?: string;
  exchangeHint?: string;
  height?: number;
  availableSymbols?: string[];
  onSymbolChange?: (symbol: string) => void;
};

function normalizeSymbol(raw: string): string {
  return normalizeChartSymbol(String(raw || ''))
    .replace(/\s+/g, '')
    .replace('/', '');
}

function inferMarketKind(symbol: string, exchangeHint: string): MarketKind {
  const upperSymbol = normalizeSymbol(symbol);
  const hint = String(exchangeHint || '').trim().toUpperCase();
  if (upperSymbol.endsWith('USDT') || ['BINANCE', 'BYBIT', 'OKX', 'BITGET'].includes(hint)) {
    return 'crypto';
  }
  return 'forex';
}

function inferDefaultExchange(symbol: string, exchangeHint: string): string {
  const upperHint = String(exchangeHint || '').trim().toUpperCase();
  if (TRADINGVIEW_EXCHANGES.some((item) => item.id === upperHint)) {
    return upperHint;
  }
  return inferMarketKind(symbol, upperHint) === 'crypto' ? 'BINANCE' : 'OANDA';
}

function groupSymbolsByMarket(symbols: string[]): Record<MarketKind, string[]> {
  return {
    crypto: symbols.filter((item) => inferMarketKind(item, '') === 'crypto'),
    forex: symbols.filter((item) => inferMarketKind(item, '') === 'forex'),
  };
}

function buildTradingViewSymbol(symbol: string, exchangeId: string): string {
  const normalizedSymbol = normalizeSymbol(symbol);
  const exchange = TRADINGVIEW_EXCHANGES.find((item) => item.id === exchangeId);
  if (!exchange) {
    return normalizedSymbol;
  }
  return `${exchange.prefix}${normalizedSymbol}${exchange.suffix || ''}`;
}

export function TradingViewMarketChart({
  symbol,
  timeframe = '15m',
  exchangeHint = '',
  height = 820,
  availableSymbols = [],
  onSymbolChange,
}: TradingViewMarketChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const normalizedExternalSymbol = normalizeSymbol(symbol);
  const [selectedSymbol, setSelectedSymbol] = useState(normalizedExternalSymbol);
  const [selectedExchange, setSelectedExchange] = useState(inferDefaultExchange(symbol, exchangeHint));
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [showExchangeMenu, setShowExchangeMenu] = useState(false);
  const [showSymbolMenu, setShowSymbolMenu] = useState(false);
  const [customSymbol, setCustomSymbol] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const normalizedAvailableSymbols = useMemo(
    () =>
      Array.from(
        new Set(
          availableSymbols
            .map((item) => normalizeSymbol(item))
            .filter(Boolean),
        ),
      ),
    [availableSymbols],
  );

  const marketKind = useMemo(
    () => inferMarketKind(selectedSymbol || normalizedExternalSymbol, selectedExchange || exchangeHint),
    [exchangeHint, normalizedExternalSymbol, selectedExchange, selectedSymbol],
  );
  const groupedAvailableSymbols = useMemo(() => {
    const grouped = groupSymbolsByMarket(normalizedAvailableSymbols);
    return {
      crypto: grouped.crypto.length > 0 ? grouped.crypto : QUICK_SYMBOLS.crypto,
      forex: grouped.forex.length > 0 ? grouped.forex : QUICK_SYMBOLS.forex,
    };
  }, [normalizedAvailableSymbols]);
  const preferredSymbols = groupedAvailableSymbols[marketKind];
  const exchangeOptions = useMemo(
    () => TRADINGVIEW_EXCHANGES.filter((item) => item.markets.includes(marketKind)),
    [marketKind],
  );
  const fullSymbol = useMemo(
    () => buildTradingViewSymbol(selectedSymbol || normalizedExternalSymbol, selectedExchange),
    [normalizedExternalSymbol, selectedExchange, selectedSymbol],
  );

  useEffect(() => {
    setSelectedSymbol(normalizedExternalSymbol);
  }, [normalizedExternalSymbol]);

  useEffect(() => {
    const nextExchange = inferDefaultExchange(normalizedExternalSymbol, exchangeHint);
    setSelectedExchange((current) => {
      if (current && exchangeOptions.some((item) => item.id === current)) {
        return current;
      }
      return nextExchange;
    });
  }, [exchangeHint, exchangeOptions, normalizedExternalSymbol]);

  function applySelectedSymbol(nextSymbol: string) {
    const normalized = normalizeSymbol(nextSymbol);
    if (!normalized) return;
    setSelectedSymbol(normalized);
    setSelectedExchange(inferDefaultExchange(normalized, exchangeHint));
    onSymbolChange?.(normalized);
  }

  useEffect(() => {
    if (!containerRef.current || !fullSymbol) {
      return;
    }

    const container = containerRef.current;
    container.innerHTML = '';

    const widgetContainer = document.createElement('div');
    widgetContainer.className = 'tradingview-widget-container';
    widgetContainer.style.height = '100%';
    widgetContainer.style.width = '100%';

    const widget = document.createElement('div');
    widget.className = 'tradingview-widget-container__widget';
    widget.style.height = '100%';
    widget.style.width = '100%';
    widgetContainer.appendChild(widget);
    container.appendChild(widgetContainer);

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: fullSymbol,
      interval: INTERVAL_MAP[timeframe] || '15',
      timezone: 'Asia/Shanghai',
      theme: 'dark',
      style: '1',
      locale: 'zh_CN',
      withdateranges: true,
      hide_side_toolbar: false,
      allow_symbol_change: false,
      details: true,
      hotlist: false,
      calendar: false,
      hide_volume: false,
      save_image: true,
      backgroundColor: '#080d14',
      gridColor: 'rgba(31, 41, 55, 0.65)',
      watchlist: [],
      support_host: 'https://www.tradingview.com',
    });
    widgetContainer.appendChild(script);

    return () => {
      container.innerHTML = '';
    };
  }, [fullSymbol, refreshNonce, timeframe]);

  function commitCustomSymbol() {
    const normalized = normalizeSymbol(customSymbol);
    if (!normalized) return;
    applySelectedSymbol(normalized);
    setCustomSymbol('');
    setShowSymbolMenu(false);
  }

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-[#080d14]',
        isFullscreen && 'fixed inset-3 z-50 rounded-2xl border-slate-700/80 shadow-2xl',
      )}
      style={isFullscreen ? undefined : { height }}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400/10">
            <TrendingUp className="size-4 text-amber-300" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-foreground-faint">Market</div>
            <div className="text-sm font-medium text-foreground">原始行情图</div>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-white/[0.04] px-3 py-2 text-sm text-foreground transition hover:border-cyan-400/25 hover:text-cyan-100"
              onClick={() => {
                setShowExchangeMenu((current) => !current);
                setShowSymbolMenu(false);
              }}
            >
              {exchangeOptions.find((item) => item.id === selectedExchange)?.name || selectedExchange}
              <ChevronDown className="size-4 text-foreground-faint" />
            </button>
            {showExchangeMenu ? (
              <div className="absolute right-0 top-[calc(100%+8px)] z-20 min-w-[148px] rounded-xl border border-border bg-[#101722] p-1 shadow-2xl">
                {exchangeOptions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      'flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition',
                      item.id === selectedExchange
                        ? 'bg-cyan-400/12 text-cyan-100'
                        : 'text-foreground-muted hover:bg-white/[0.04] hover:text-foreground',
                    )}
                    onClick={() => {
                      setSelectedExchange(item.id);
                      setShowExchangeMenu(false);
                    }}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="relative">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm font-medium text-amber-200 transition hover:border-amber-300/50"
              onClick={() => {
                setShowSymbolMenu((current) => !current);
                setShowExchangeMenu(false);
              }}
            >
              {selectedSymbol}
              <ChevronDown className="size-4" />
            </button>
            {showSymbolMenu ? (
              <div className="absolute right-0 top-[calc(100%+8px)] z-20 min-w-[240px] rounded-xl border border-border bg-[#101722] p-3 shadow-2xl">
                <div className="text-[10px] uppercase tracking-[0.22em] text-foreground-faint">快捷品种</div>
                <div className="mt-2 space-y-3">
                  {(['crypto', 'forex'] as const).map((bucket) => (
                    <div key={bucket}>
                      <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-foreground-faint">
                        {bucket === 'crypto' ? '加密' : '外汇'}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {groupedAvailableSymbols[bucket].map((item) => (
                          <button
                            key={`${bucket}_${item}`}
                            type="button"
                            className={cn(
                              'rounded-full border px-2.5 py-1 text-[11px] transition',
                              item === selectedSymbol
                                ? 'border-cyan-400/40 bg-cyan-400/12 text-cyan-100'
                                : 'border-border bg-white/[0.04] text-foreground-faint hover:border-cyan-400/25 hover:text-foreground',
                            )}
                            onClick={() => {
                              applySelectedSymbol(item);
                              setShowSymbolMenu(false);
                            }}
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 border-t border-border pt-3">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-foreground-faint">自定义</div>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      value={customSymbol}
                      onChange={(event) => setCustomSymbol(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          commitCustomSymbol();
                        }
                      }}
                      className="flex-1 rounded-lg border border-border bg-black/20 px-3 py-2 text-sm text-foreground outline-none transition focus:border-cyan-400/35"
                      placeholder={marketKind === 'crypto' ? '例如 BTCUSDT' : '例如 EURUSD'}
                    />
                    <button
                      type="button"
                      className="rounded-lg border border-border px-3 py-2 text-sm text-foreground-muted transition hover:border-cyan-400/25 hover:text-foreground"
                      onClick={commitCustomSymbol}
                    >
                      应用
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-white/[0.04] px-3 py-2 text-sm text-foreground-muted transition hover:border-cyan-400/25 hover:text-foreground"
            onClick={() => setRefreshNonce((current) => current + 1)}
          >
            <RefreshCw className="size-4" />
            刷新
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-white/[0.04] px-3 py-2 text-sm text-foreground-muted transition hover:border-cyan-400/25 hover:text-foreground"
            onClick={() => setIsFullscreen((current) => !current)}
          >
            {isFullscreen ? <Shrink className="size-4" /> : <Expand className="size-4" />}
            {isFullscreen ? '退出全屏' : '全屏'}
          </button>
        </div>
      </div>

      <div className="border-b border-border px-3 py-2 text-xs text-foreground-faint">
        当前使用 TradingView 原始行情浏览器，适合叠加你从社区找来的指标做目测对照；策略识别、计划价和回测事件仍以“策略图”为准。
      </div>
      <div className="border-b border-border px-3 py-2">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[10px] uppercase tracking-[0.18em] text-foreground-faint">
          <span>快捷品种</span>
          <span>{normalizedAvailableSymbols.length > 0 ? normalizedAvailableSymbols.length : preferredSymbols.length} 个可切换品种</span>
        </div>
        <div className="space-y-2">
          {(['crypto', 'forex'] as const).map((bucket) => (
            <div key={bucket} className="rounded-lg border border-border bg-white/[0.02] px-2 py-2">
              <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-foreground-faint">
                {bucket === 'crypto' ? '加密监控池' : '外汇监控池'}
              </div>
              <div className="flex flex-wrap gap-1">
                {groupedAvailableSymbols[bucket].map((item) => {
                  const active = item === selectedSymbol;
                  return (
                    <button
                      key={`${bucket}_chip_${item}`}
                      type="button"
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-[11px] transition',
                        active
                          ? 'border-amber-300/45 bg-amber-400/12 text-amber-100'
                          : 'border-border bg-white/[0.04] text-foreground-faint hover:border-cyan-400/25 hover:text-foreground',
                      )}
                      onClick={() => applySelectedSymbol(item)}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        ref={containerRef}
        className="w-full"
        style={{ height: isFullscreen ? 'calc(100vh - 196px)' : height - 152 }}
      />
    </div>
  );
}
