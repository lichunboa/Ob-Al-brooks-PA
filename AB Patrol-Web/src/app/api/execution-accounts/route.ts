import { NextResponse } from 'next/server';

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

async function fetchJson<T extends JsonValue>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function normalizeTradingStatus(
  tradingStatus: Record<string, unknown> | null,
  health: Record<string, unknown> | null,
  balance: unknown[] | null,
) {
  const next = { ...(tradingStatus || {}) } as Record<string, unknown>;
  const firstBalance =
    Array.isArray(balance) && balance.length > 0 && typeof balance[0] === 'object' && balance[0] !== null
      ? (balance[0] as Record<string, unknown>)
      : null;

  if (health?.exchange) {
    next.exchange = health.exchange;
  }
  if (health?.account_asset) {
    next.account_asset = health.account_asset;
  }
  if (firstBalance?.asset) {
    next.account_asset = firstBalance.asset;
  }
  if (typeof firstBalance?.balance === 'number' && Number(firstBalance.balance) >= 0) {
    next.account_balance = firstBalance.balance;
  }
  if (typeof firstBalance?.available === 'number' && Number(firstBalance.available) >= 0) {
    next.account_available = firstBalance.available;
  }
  return next;
}

async function buildAccount(baseUrl: string, label: string, key: string) {
  const normalizedBase = baseUrl.replace(/\/$/, '');
  const [health, balance, positions, tradingStatus] = await Promise.all([
    fetchJson<Record<string, unknown>>(`${normalizedBase}/health`),
    fetchJson<unknown[]>(`${normalizedBase}/balance`),
    fetchJson<unknown[]>(`${normalizedBase}/positions`),
    fetchJson<Record<string, unknown>>(`${normalizedBase}/trading/status`),
  ]);

  return {
    key,
    label,
    base_url: normalizedBase,
    healthy: Boolean(health && health['status'] === 'healthy'),
    health,
    balance: Array.isArray(balance) ? balance : [],
    positions: Array.isArray(positions) ? positions : [],
    trading_status: normalizeTradingStatus(
      tradingStatus,
      health,
      Array.isArray(balance) ? balance : [],
    ),
  };
}

export async function GET() {
  const primaryBase = (process.env.NEXT_PUBLIC_EXECUTION_API_URL || 'http://127.0.0.1:8092').trim();
  const secondaryBase = (
    process.env.NEXT_PUBLIC_EXECUTION_CRYPTO_API_URL ||
    process.env.AB_PATROL_EXECUTION_CRYPTO_BASE ||
    'http://127.0.0.1:8094'
  ).trim();

  const [primary, secondary] = await Promise.all([
    buildAccount(primaryBase, '多资产主栈', 'primary'),
    buildAccount(secondaryBase, 'Binance Demo', 'secondary'),
  ]);

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    primary,
    secondary: secondary.healthy || secondary.balance.length > 0 || secondary.positions.length > 0 ? secondary : null,
  });
}
