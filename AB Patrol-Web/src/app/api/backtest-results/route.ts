/**
 * 回测历史结果 API Route
 *
 * 读取本地 data/backtest_results/ 目录下的 JSON 文件
 * 即使回测服务离线也可以查看历史结果
 *
 * GET /api/backtest-results          — 列出所有结果文件
 * GET /api/backtest-results?file=xxx — 加载指定文件内容
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// data/backtest_results/ 相对于 web/ 目录的路径
const RESULTS_DIR = path.resolve(
  process.cwd(),
  '..',
  'data',
  'backtest_results'
);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fileName = searchParams.get('file');

  // 安全检查：确保目录存在
  if (!fs.existsSync(RESULTS_DIR)) {
    return NextResponse.json(
      { error: '结果目录不存在', path: RESULTS_DIR },
      { status: 404 }
    );
  }

  // 加载单个文件
  if (fileName) {
    // 防止路径穿越攻击
    const safeName = path.basename(fileName);
    if (safeName !== fileName || !fileName.endsWith('.json')) {
      return NextResponse.json(
        { error: '无效的文件名' },
        { status: 400 }
      );
    }

    const filePath = path.join(RESULTS_DIR, safeName);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: `文件不存在: ${safeName}` },
        { status: 404 }
      );
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);
      return NextResponse.json({
        file: safeName,
        data,
      });
    } catch (e) {
      return NextResponse.json(
        { error: `解析失败: ${safeName}` },
        { status: 500 }
      );
    }
  }

  // 列出所有文件
  try {
    const files = fs.readdirSync(RESULTS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const filePath = path.join(RESULTS_DIR, f);
        const stat = fs.statSync(filePath);

        // 尝试快速读取文件获取摘要信息
        let summary: Record<string, unknown> = {};
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const data = JSON.parse(content);
          const keys = Object.keys(data);
          const entries: Array<{
            key: string;
            total: number;
            win_rate: number;
            total_pnl: number;
            compound_return_pct: number;
            timeframe: string;
          }> = [];

          for (const key of keys) {
            const v = data[key];
            if (v && typeof v === 'object' && 'total' in v) {
              entries.push({
                key,
                total: v.total || 0,
                win_rate: v.win_rate || 0,
                total_pnl: v.total_pnl || 0,
                compound_return_pct: v.compound_return_pct || 0,
                timeframe: v.timeframe || '',
              });
            }
          }

          summary = {
            entries_count: entries.length,
            entries,
          };
        } catch {
          // 忽略解析失败的文件
        }

        return {
          name: f,
          size: stat.size,
          modified: stat.mtime.toISOString(),
          ...summary,
        };
      })
      // 按修改时间倒序
      .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());

    return NextResponse.json({
      directory: RESULTS_DIR,
      total: files.length,
      files,
    });
  } catch (e) {
    return NextResponse.json(
      { error: '读取目录失败' },
      { status: 500 }
    );
  }
}
