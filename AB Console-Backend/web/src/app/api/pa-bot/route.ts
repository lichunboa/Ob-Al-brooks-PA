import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const EXEC_API = 'http://localhost:8092';
const BOT_ID = 'claude-pa';
const LOG_FILE = path.join(process.cwd(), '..', 'data', 'pa_trader', 'pa_trader.log');

// ===== 从 execution-service 获取数据 =====

async function fetchJSON(url: string) {
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) return null;
  return res.json();
}

async function getBotSummary() {
  return fetchJSON(`${EXEC_API}/trading/bot-summary/${BOT_ID}`);
}

async function getBalance() {
  const data = await fetchJSON(`${EXEC_API}/balance`);
  if (!data || !Array.isArray(data)) return 0;
  const usdt = data.find((a: { asset: string }) => a.asset === 'USDT');
  return usdt?.balance ?? 0;
}

async function getTradeHistory() {
  const data = await fetchJSON(`${EXEC_API}/trades/history`);
  if (!data || !Array.isArray(data)) return [];
  // 只返回 claude-pa 的交易
  return data.filter((t: { bot_id?: string }) => t.bot_id === BOT_ID);
}

async function getOrders() {
  const data = await fetchJSON(`${EXEC_API}/trades/history`);
  if (!data || !Array.isArray(data)) return [];
  return data.filter((o: { bot_id?: string }) => o.bot_id === BOT_ID);
}

// ===== 从日志解析信号 =====

interface LogSignal {
  time: string;
  symbol: string;
  side: string;
  strategy: string;
  reason: string;
  ai_direction: string;
  p_r: string;
  executed: boolean;
}

function parseSignalsFromLog(limit = 50): LogSignal[] {
  try {
    if (!fs.existsSync(LOG_FILE)) return [];
    const content = fs.readFileSync(LOG_FILE, 'utf-8');
    const lines = content.split('\n').filter(l => l.includes('[SIGNAL]') || l.includes('[TRADE]'));

    const signals: LogSignal[] = [];
    const executedSymbols = new Set<string>();

    // 先收集所有已执行的交易
    for (const line of lines) {
      if (line.includes('[TRADE]')) {
        const symMatch = line.match(/(?:TRADE|开仓)\s*(\w+USDT)/);
        if (symMatch) executedSymbols.add(symMatch[1]);
      }
    }

    // 解析信号
    for (const line of lines) {
      if (!line.includes('[SIGNAL]')) continue;
      const timeMatch = line.match(/^(\d{2}:\d{2}:\d{2})/);
      const symMatch = line.match(/(\w+USDT)/);
      const sideMatch = line.match(/\b(BUY|SELL|LONG|SHORT)\b/i);
      const stratMatch = line.match(/策略[:\s]*(\S+)|strategy[:\s]*(\S+)/i);
      const aiMatch = line.match(/AI[LS]|AIL|AIS/);
      const prMatch = line.match(/P×R[=:\s]*([\d.]+)/);

      signals.push({
        time: timeMatch?.[1] ?? '',
        symbol: symMatch?.[1] ?? '',
        side: sideMatch?.[1]?.toUpperCase() ?? '',
        strategy: stratMatch?.[1] ?? stratMatch?.[2] ?? '',
        reason: line.substring(line.indexOf('[SIGNAL]') + 9).trim().substring(0, 200),
        ai_direction: aiMatch?.[0] ?? '',
        p_r: prMatch?.[1] ?? '',
        executed: symMatch ? executedSymbols.has(symMatch[1]) : false,
      });
    }

    return signals.reverse().slice(0, limit);
  } catch {
    return [];
  }
}

// ===== 检查 bot 存活 =====

function checkBotAlive(): { alive: boolean; last_active: string } {
  try {
    const stat = fs.statSync(LOG_FILE);
    const ageMs = Date.now() - stat.mtimeMs;
    return {
      alive: ageMs < 600_000, // 10分钟内有活动
      last_active: stat.mtime.toISOString(),
    };
  } catch {
    return { alive: false, last_active: '' };
  }
}

// ===== 构建摘要 =====

function buildSummary(
  orders: Record<string, unknown>[],
  botSummary: Record<string, unknown> | null,
  balance: number,
) {
  const trades = orders.filter((o: Record<string, unknown>) => o.status === 'FILLED' || o.status === 'filled');

  const bySymbol: Record<string, number> = {};
  const byStrategy: Record<string, number> = {};
  let buyCount = 0;
  let sellCount = 0;

  for (const t of trades) {
    const sym = String(t.symbol ?? '');
    const strat = String(t.strategy ?? 'unknown');
    const side = String(t.side ?? '').toUpperCase();

    bySymbol[sym] = (bySymbol[sym] || 0) + 1;
    byStrategy[strat] = (byStrategy[strat] || 0) + 1;
    if (side === 'BUY') buyCount++;
    if (side === 'SELL') sellCount++;
  }

  const config = (botSummary as Record<string, unknown>)?.config as Record<string, unknown> | undefined;
  const dailyPnl = (botSummary as Record<string, unknown>)?.daily_pnl as { realized: number; unrealized: number } | undefined;

  return {
    total_trades: trades.length,
    successful_trades: trades.length,
    direction: { buy: buyCount, sell: sellCount },
    by_strategy: byStrategy,
    by_symbol: Object.fromEntries(
      Object.entries(bySymbol).map(([k, v]) => [k.replace('USDT', ''), v])
    ),
    balance,
    available_margin: Number((botSummary as Record<string, unknown>)?.available_margin ?? 0),
    daily_pnl: dailyPnl ?? { realized: 0, unrealized: 0 },
    remaining_positions: Number((botSummary as Record<string, unknown>)?.remaining_positions ?? 0),
    risk_percent: Number(config?.risk_percent ?? 1),
    max_leverage: Number(config?.max_leverage ?? 100),
  };
}

// ===== API 处理 =====

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('mode') || 'full';

  try {
    const [botSummary, balance, orders] = await Promise.all([
      getBotSummary(),
      getBalance(),
      getOrders(),
    ]);

    const botStatus = checkBotAlive();

    if (mode === 'status') {
      return NextResponse.json({
        bot: botStatus,
        bot_id: BOT_ID,
        balance,
        summary: botSummary,
      });
    }

    if (mode === 'trades') {
      const trades = await getTradeHistory();
      return NextResponse.json({ trades, total: trades.length });
    }

    if (mode === 'signals') {
      const limit = parseInt(searchParams.get('limit') || '50');
      const signals = parseSignalsFromLog(limit);
      return NextResponse.json({ signals, total: signals.length });
    }

    // mode === 'full'
    const summary = buildSummary(orders, botSummary, balance);
    const signals = parseSignalsFromLog(30);

    // 从 orders 构造 recent trades（兼容前端格式）
    const recentTrades = orders
      .filter((o: Record<string, unknown>) => o.status === 'FILLED' || o.status === 'filled')
      .slice(-20)
      .reverse()
      .map((o: Record<string, unknown>) => ({
        signal: {
          symbol: String(o.symbol ?? ''),
          side: String(o.side ?? ''),
          strategy: String(o.strategy ?? ''),
          entry: Number(o.price ?? 0),
          stop_loss: Number(o.stop_loss ?? 0),
          take_profit: Number(o.take_profit ?? 0),
          score: 0,
          scores_detail: {},
          ai_direction: '',
          market_state: '',
          reason: String(o.strategy ?? ''),
        },
        result: {
          success: true,
          order_id: String(o.order_id ?? o.id ?? ''),
          symbol: String(o.symbol ?? ''),
          side: String(o.side ?? ''),
          quantity: Number(o.quantity ?? 0),
          price: Number(o.price ?? 0),
          timestamp: String(o.timestamp ?? o.created_at ?? new Date().toISOString()),
          bot_id: BOT_ID,
        },
      }));

    return NextResponse.json({
      bot: {
        alive: botStatus.alive,
        pid: null,
        uptime_cycles: 0,
      },
      summary: {
        total_cycles: 0,
        total_trades: summary.total_trades,
        successful_trades: summary.successful_trades,
        total_signals_scanned: signals.length,
        signals_above_threshold: signals.filter(s => s.executed).length,
        avg_score: 0,
        direction: summary.direction,
        by_strategy: summary.by_strategy,
        by_symbol: summary.by_symbol,
        by_market_state: {},
        latest_status: {
          available_margin: summary.available_margin,
          daily_pnl: summary.daily_pnl,
          remaining_positions: summary.remaining_positions,
        },
        latest_timestamp: new Date().toISOString(),
        // 额外字段供页面使用
        balance: summary.balance,
        risk_percent: summary.risk_percent,
        max_leverage: summary.max_leverage,
      },
      recent_trades: recentTrades,
      recent_signals: signals.map(s => ({
        cycle_id: '',
        cycle_time: s.time ? `${new Date().toISOString().slice(0, 11)}${s.time}` : new Date().toISOString(),
        symbol: s.symbol,
        timeframe: '5m',
        side: s.side,
        strategy: s.strategy,
        entry: 0,
        stop_loss: 0,
        take_profit: 0,
        score: 0,
        scores_detail: {},
        ai_direction: s.ai_direction,
        market_state: '',
        reason: s.reason,
        executed: s.executed,
      })),
      total_cycles: 0,
    });
  } catch (err) {
    console.error('PA Bot API error:', err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
