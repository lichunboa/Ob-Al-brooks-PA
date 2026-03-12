import { NextRequest, NextResponse } from 'next/server';

type ScanSymbol = {
  id: string;
  ticker: string;
  name: string;
  category: 'crypto' | 'forex' | 'index' | 'metal';
};

const MULTI_ASSET_SYMBOLS: ScanSymbol[] = [
  { id: 'EURUSD', ticker: 'EURUSD', name: 'Euro / Dollar', category: 'forex' },
  { id: 'GBPUSD', ticker: 'GBPUSD', name: 'Pound / Dollar', category: 'forex' },
  { id: 'USDJPY', ticker: 'USDJPY', name: 'Dollar / Yen', category: 'forex' },
  { id: 'XAUUSD', ticker: 'XAUUSD', name: 'Gold Spot', category: 'metal' },
  { id: 'US30', ticker: 'US 30', name: 'US 30', category: 'index' },
  { id: 'NAS100', ticker: 'US TECH 100', name: 'US Tech 100', category: 'index' },
];

const CRYPTO_SYMBOLS: ScanSymbol[] = [
  { id: 'BTC', ticker: 'BTCUSDT', name: 'Bitcoin', category: 'crypto' },
  { id: 'SOL', ticker: 'SOLUSDT', name: 'Solana', category: 'crypto' },
];

async function fetchExecutionBars(baseUrl: string, ticker: string, interval: string) {
  const url = `${baseUrl.replace(/\/$/, '')}/klines/${encodeURIComponent(ticker)}?interval=${encodeURIComponent(interval)}&limit=2`;
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`execution http ${response.status}`);
  }
  return response.json();
}

async function fetchApiCandles(baseUrl: string, ticker: string, interval: string) {
  const url = `${baseUrl.replace(/\/$/, '')}/api/v1/candles/${encodeURIComponent(ticker)}?interval=${encodeURIComponent(interval)}&limit=2`;
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`api http ${response.status}`);
  }
  return response.json();
}

async function scanGroup(
  symbols: ScanSymbol[],
  {
    groupId,
    groupLabel,
    interval,
    executionBase,
    apiBase,
  }: {
    groupId: string;
    groupLabel: string;
    interval: string;
    executionBase: string;
    apiBase?: string;
  },
) {
  const items = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        let bars: Array<Record<string, unknown>> = [];
        let source = 'execution-service';
        try {
          const payload = await fetchExecutionBars(executionBase, symbol.ticker, interval);
          bars = Array.isArray(payload?.bars) ? payload.bars : [];
        } catch (error) {
          if (!apiBase) {
            throw error;
          }
          source = 'api-service';
          const payload = await fetchApiCandles(apiBase, symbol.ticker, interval);
          bars = Array.isArray(payload?.candles)
            ? payload.candles.map((bar: Record<string, unknown>) => ({
                C: Number(bar.close ?? 0),
              }))
            : [];
        }

        const current = bars[bars.length - 1];
        const previous = bars[bars.length - 2];
        const currentClose = Number(current?.C ?? 0);
        const previousClose = Number(previous?.C ?? currentClose);
        const change = currentClose - previousClose;
        const changePercent = previousClose ? (change / previousClose) * 100 : 0;

        return {
          ...symbol,
          market: groupId,
          source,
          price: currentClose,
          change,
          changePercent,
          trend: change > 0 ? 'bullish' : change < 0 ? 'bearish' : 'neutral',
          loading: false,
        };
      } catch (error) {
        return {
          ...symbol,
          market: groupId,
          source: 'unavailable',
          price: 0,
          change: 0,
          changePercent: 0,
          trend: 'neutral',
          loading: false,
          error: error instanceof Error ? error.message : 'unknown error',
        };
      }
    }),
  );

  return {
    id: groupId,
    label: groupLabel,
    interval,
    items,
  };
}

export async function GET(request: NextRequest) {
  const interval = request.nextUrl.searchParams.get('interval') || '5m';
  const executionBase = (process.env.NEXT_PUBLIC_EXECUTION_API_URL || 'http://127.0.0.1:8092').trim();
  const cryptoExecutionBase = (
    process.env.NEXT_PUBLIC_EXECUTION_CRYPTO_API_URL ||
    process.env.AB_PATROL_EXECUTION_CRYPTO_BASE ||
    'http://127.0.0.1:8094'
  ).trim();
  const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8088').trim();

  const [multiAsset, crypto] = await Promise.all([
    scanGroup(MULTI_ASSET_SYMBOLS, {
      groupId: 'multi_asset',
      groupLabel: '多资产主栈',
      interval,
      executionBase,
    }),
    scanGroup(CRYPTO_SYMBOLS, {
      groupId: 'crypto',
      groupLabel: 'Binance Demo',
      interval,
      executionBase: cryptoExecutionBase,
      apiBase,
    }),
  ]);

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    interval,
    groups: [multiAsset, crypto],
  });
}
