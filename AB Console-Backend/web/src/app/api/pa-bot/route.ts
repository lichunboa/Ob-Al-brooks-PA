import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), '..', 'data', 'pa_trader');
const LOG_FILE = path.join(DATA_DIR, 'pa_trader.log');

interface CycleLog {
  cycle_id: string;
  timestamp: string;
  bot_status: {
    available_margin: number;
    daily_pnl: { realized: number; unrealized: number };
    remaining_positions: number;
  };
  signals_found: number;
  signals_above_threshold: number;
  top_signals: Signal[];
  executed: ExecutedTrade[];
}

interface Signal {
  symbol: string;
  timeframe: string;
  side: string;
  strategy: string;
  entry: number;
  stop_loss: number;
  take_profit: number;
  score: number;
  scores_detail: Record<string, number>;
  ai_direction: string;
  market_state: string;
  reason: string;
  bars_context: number;
}

interface ExecutedTrade {
  signal: Signal;
  result: {
    success: boolean;
    order_id: string;
    symbol: string;
    side: string;
    quantity: number;
    price: number;
    status: string;
    message: string | null;
    timestamp: string;
    stop_loss_order_id: string;
    take_profit_order_id: string;
    bot_id: string;
  };
}

function loadCycleLogs(limit = 200): CycleLog[] {
  if (!fs.existsSync(DATA_DIR)) return [];

  const files = fs.readdirSync(DATA_DIR)
    .filter(f => f.startsWith('cycle_') && f.endsWith('.json'))
    .sort()
    .slice(-limit);

  const logs: CycleLog[] = [];
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(DATA_DIR, file), 'utf-8');
      logs.push(JSON.parse(raw));
    } catch {
      // skip corrupted files
    }
  }
  return logs;
}

function checkBotAlive(): { alive: boolean; pid: number | null; uptime_cycles: number } {
  // Check if process is running by looking at the log file modification time
  try {
    const stat = fs.statSync(LOG_FILE);
    const ageMs = Date.now() - stat.mtimeMs;
    // If log was modified in the last 10 minutes, bot is probably alive
    const alive = ageMs < 600_000;

    // Count cycles from log
    const logContent = fs.readFileSync(LOG_FILE, 'utf-8');
    const cycleMatch = logContent.match(/已运行 (\d+) 轮/g);
    const lastCycle = cycleMatch ? cycleMatch[cycleMatch.length - 1] : null;
    const uptimeCycles = lastCycle ? parseInt(lastCycle.match(/(\d+)/)?.[1] || '0') : 0;

    // Try to find PID from log
    const pidMatch = logContent.match(/PID[:\s]*(\d+)/);
    const pid = pidMatch ? parseInt(pidMatch[1]) : null;

    return { alive, pid, uptime_cycles: uptimeCycles };
  } catch {
    return { alive: false, pid: null, uptime_cycles: 0 };
  }
}

function buildSummary(logs: CycleLog[]) {
  if (logs.length === 0) return null;

  const allTrades = logs.flatMap(l => l.executed);
  const allSignals = logs.flatMap(l => l.top_signals);
  const latest = logs[logs.length - 1];

  // Group trades by symbol
  const bySymbol: Record<string, ExecutedTrade[]> = {};
  for (const t of allTrades) {
    const sym = t.signal.symbol;
    if (!bySymbol[sym]) bySymbol[sym] = [];
    bySymbol[sym].push(t);
  }

  // Group trades by strategy
  const byStrategy: Record<string, number> = {};
  for (const t of allTrades) {
    const s = t.signal.strategy;
    byStrategy[s] = (byStrategy[s] || 0) + 1;
  }

  // Score distribution
  const scores = allTrades.map(t => t.signal.score);
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  // Signal stats
  const totalSignals = logs.reduce((s, l) => s + l.signals_found, 0);
  const aboveThreshold = logs.reduce((s, l) => s + l.signals_above_threshold, 0);

  // Direction breakdown
  const buyCount = allTrades.filter(t => t.signal.side === 'BUY').length;
  const sellCount = allTrades.filter(t => t.signal.side === 'SELL').length;

  // Market state breakdown
  const byMarketState: Record<string, number> = {};
  for (const t of allTrades) {
    const ms = t.signal.market_state;
    byMarketState[ms] = (byMarketState[ms] || 0) + 1;
  }

  return {
    total_cycles: logs.length,
    total_trades: allTrades.length,
    successful_trades: allTrades.filter(t => t.result.success).length,
    total_signals_scanned: totalSignals,
    signals_above_threshold: aboveThreshold,
    avg_score: Math.round(avgScore * 10) / 10,
    direction: { buy: buyCount, sell: sellCount },
    by_strategy: byStrategy,
    by_symbol: Object.fromEntries(Object.entries(bySymbol).map(([k, v]) => [k, v.length])),
    by_market_state: byMarketState,
    latest_status: latest.bot_status,
    latest_timestamp: latest.timestamp,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('mode') || 'full'; // full | trades | signals | status

  try {
    const logs = loadCycleLogs();
    const botStatus = checkBotAlive();

    if (mode === 'status') {
      const latest = logs.length > 0 ? logs[logs.length - 1] : null;
      return NextResponse.json({
        bot: botStatus,
        latest_cycle: latest ? {
          cycle_id: latest.cycle_id,
          timestamp: latest.timestamp,
          bot_status: latest.bot_status,
          signals_found: latest.signals_found,
          executed_count: latest.executed.length,
        } : null,
      });
    }

    if (mode === 'trades') {
      const trades = logs.flatMap(l =>
        l.executed.map(e => ({
          cycle_id: l.cycle_id,
          cycle_time: l.timestamp,
          ...e,
        }))
      ).reverse();
      return NextResponse.json({ trades, total: trades.length });
    }

    if (mode === 'signals') {
      const limit = parseInt(searchParams.get('limit') || '50');
      const signals = logs.flatMap(l =>
        l.top_signals.map(s => ({
          cycle_id: l.cycle_id,
          cycle_time: l.timestamp,
          executed: l.executed.some(e =>
            e.signal.symbol === s.symbol && e.signal.strategy === s.strategy
          ),
          ...s,
        }))
      ).reverse().slice(0, limit);
      return NextResponse.json({ signals, total: signals.length });
    }

    // mode === 'full'
    const summary = buildSummary(logs);
    const recentTrades = logs.flatMap(l =>
      l.executed.map(e => ({
        cycle_id: l.cycle_id,
        cycle_time: l.timestamp,
        ...e,
      }))
    ).reverse().slice(0, 20);

    const recentSignals = logs.flatMap(l =>
      l.top_signals.map(s => ({
        cycle_id: l.cycle_id,
        cycle_time: l.timestamp,
        executed: l.executed.some(e =>
          e.signal.symbol === s.symbol && e.signal.strategy === s.strategy
        ),
        ...s,
      }))
    ).reverse().slice(0, 30);

    return NextResponse.json({
      bot: botStatus,
      summary,
      recent_trades: recentTrades,
      recent_signals: recentSignals,
      total_cycles: logs.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
