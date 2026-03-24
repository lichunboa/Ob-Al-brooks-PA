import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { AGENT_ROOT, loadMonitoringConfig } from '../../../../lib/pa-bot/live-monitoring';
import { buildChartCommand } from '../../../../lib/pa-bot/chart-command';

export const dynamic = 'force-dynamic';

type LiveChartRequest = {
  symbol?: string;
  timeframe?: string;
  baseUrl?: string;
  limit?: number;
  events?: unknown[];
  eventIndex?: number | null;
};

const CHARTS_ROOT = path.join(AGENT_ROOT, 'data', 'charts');
const LIVE_CHART_ROOT = path.join(CHARTS_ROOT, 'live-review');
const TMP_ROOT = path.join(LIVE_CHART_ROOT, 'tmp');
const CHART_SCRIPT = path.join(AGENT_ROOT, 'tools', 'diagnostics', 'trade_chart_data.py');

function normalizeChartTimeframe(value: unknown): string {
  const text = String(value || '').trim().toLowerCase();
  const matched = text.match(/^(1m|5m|15m|1h|1d)/i);
  return matched?.[1]?.toLowerCase() || '15m';
}

function resolveBaseUrl(symbol: string, candidate: unknown): string {
  const explicit = String(candidate || '').trim();
  if (explicit) {
    return explicit;
  }
  const config = loadMonitoringConfig();
  const upperSymbol = symbol.trim().toUpperCase();
  for (const account of config.accounts || []) {
    const symbols = (account.symbols || []).map((item) => String(item || '').trim().toUpperCase());
    if (symbols.includes(upperSymbol) && account.base_url) {
      return account.base_url;
    }
  }
  if (upperSymbol.endsWith('USDT')) {
    return 'http://127.0.0.1:8093';
  }
  return 'http://127.0.0.1:8092';
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function POST(request: Request) {
  try {
    const payload = asObject(await request.json()) as LiveChartRequest;
    const symbol = String(payload.symbol || '').trim().toUpperCase();
    const timeframe = normalizeChartTimeframe(payload.timeframe);
    const events = Array.isArray(payload.events) ? payload.events : [];
    if (!symbol || events.length === 0) {
      return NextResponse.json({ ok: false, error: '实盘图表参数不完整，至少需要 symbol/events。' }, { status: 400 });
    }

    fs.mkdirSync(TMP_ROOT, { recursive: true });
    const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const baseUrl = resolveBaseUrl(symbol, payload.baseUrl);
    const payloadPath = path.join(TMP_ROOT, `${uniqueId}.json`);
    const outputPath = path.join(TMP_ROOT, `${symbol}_${timeframe}_${uniqueId}.chart.json`);
    fs.writeFileSync(
      payloadPath,
      JSON.stringify(
        {
          ...payload,
          symbol,
          timeframe,
          baseUrl,
        },
        null,
        2,
      ),
      'utf-8',
    );

    try {
      const chartCommand = buildChartCommand(AGENT_ROOT, CHART_SCRIPT, payloadPath, outputPath);
      const stdout = execFileSync(chartCommand.command, chartCommand.args, {
        cwd: AGENT_ROOT,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 16 * 1024 * 1024,
      }).trim();
      const result = JSON.parse(fs.readFileSync(outputPath, 'utf-8')) as Record<string, unknown>;
      if (!stdout && !result) {
        throw new Error('图表脚本没有返回有效数据');
      }
      return NextResponse.json({
        ok: true,
        chart: result,
      });
    } finally {
      fs.rmSync(payloadPath, { force: true });
      fs.rmSync(outputPath, { force: true });
    }
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : '实盘图表生成失败',
      },
      { status: 500 },
    );
  }
}
