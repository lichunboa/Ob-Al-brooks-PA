/**
 * Sync Service API Client
 * Connects to sync-service (port 8089)
 */

import { config } from '@/lib/config';

// 使用 Next.js 代理避免 CORS 问题
// 浏览器 → localhost:3000/api/sync/... → Next.js → localhost:8089/api/v1/...
const SYNC_SERVICE_URL = typeof window !== 'undefined'
  ? '/api/sync'  // 浏览器端使用代理
  : config.syncApiUrl;  // 服务端直接连接

// 是否为浏览器环境（使用代理）
const IS_BROWSER = typeof window !== 'undefined';

// Types
export interface TradeStats {
  total_trades: number;
  win_count: number;
  loss_count: number;
  breakeven_count: number;
  win_rate: number;
  total_pnl_r: number;
  total_pnl_money: number;
  avg_pnl_r: number;
}

export interface AccountStats {
  account_type: string;
  total_trades: number;
  win_count: number;
  loss_count: number;
  win_rate: number;
  total_pnl_money: number;
}

export interface StrategyPerformance {
  strategy_name: string;
  trade_count: number;
  win_count: number;
  loss_count: number;
  win_rate: number;
  total_pnl_r: number;
  avg_pnl_r: number;
  total_pnl_money: number;
}

export interface SyncStatus {
  status: string;
  stats: {
    total_trades: number;
    total_strategies: number;
  };
  last_sync: {
    trades: string | null;
    strategies: string | null;
  };
}

export interface TradeRecord {
  id: string;
  trade_date: string;
  symbol: string;
  direction: 'long' | 'short';
  entry_price: number;
  exit_price?: number;
  result?: 'win' | 'loss' | 'breakeven';
  pnl_r?: number;
  pnl_money?: number;
  strategy_name?: string;
  account_type?: 'Live' | 'Demo' | 'Backtest';
}

// API Client
class SyncApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = SYNC_SERVICE_URL) {
    this.baseUrl = baseUrl;
  }

  // 构建完整路径
  private buildPath(path: string): string {
    // 浏览器环境使用代理，不需要 /api/v1 前缀
    // 服务端直接连接，需要完整路径
    if (IS_BROWSER) {
      // 移除 /api/v1 前缀
      return path.replace(/^\/api\/v1/, '');
    }
    return path;
  }

  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const path = this.buildPath(endpoint);
    const url = `${this.baseUrl}${path}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  // Health check
  async checkHealth(): Promise<{ status: string; service: string; version: string }> {
    return this.fetch('/api/v1/health');
  }

  // Sync status
  async getStatus(): Promise<SyncStatus> {
    return this.fetch('/api/v1/status');
  }

  // Trade stats
  async getTradeStats(): Promise<TradeStats> {
    return this.fetch('/api/v1/trades/stats');
  }

  // Account stats (by Live/Demo/Backtest)
  async getAccountStats(): Promise<{ Live: AccountStats; Demo: AccountStats; Backtest: AccountStats; All: AccountStats }> {
    const defaultStats = (type: string): AccountStats => ({
      account_type: type, total_trades: 0, win_count: 0, loss_count: 0, win_rate: 0, total_pnl_money: 0
    });
    
    try {
      return await this.fetch('/api/v1/trades/stats/by-account');
    } catch {
      // Fallback: calculate from trades list
      const trades = await this.getRecentTrades(1000);
      const result = {
        Live: defaultStats('Live'),
        Demo: defaultStats('Demo'),
        Backtest: defaultStats('Backtest'),
        All: defaultStats('All')
      };
      
      trades.forEach(t => {
        const type = t.account_type || 'Live';
        if (type in result) {
          result[type as keyof typeof result].total_trades++;
        }
        result.All.total_trades++;
        
        if (t.result === 'win') {
          if (type in result) result[type as keyof typeof result].win_count++;
          result.All.win_count++;
        } else if (t.result === 'loss') {
          if (type in result) result[type as keyof typeof result].loss_count++;
          result.All.loss_count++;
        }
        
        const pnl = t.pnl_money || 0;
        if (type in result) result[type as keyof typeof result].total_pnl_money += pnl;
        result.All.total_pnl_money += pnl;
      });
      
      // Calculate win rates
      (Object.keys(result) as Array<keyof typeof result>).forEach(key => {
        const s = result[key];
        s.win_rate = s.total_trades > 0 ? Math.round((s.win_count / s.total_trades) * 100) : 0;
      });
      
      return result;
    }
  }

  // Strategy performance
  async getStrategyPerformance(): Promise<StrategyPerformance[]> {
    return this.fetch('/api/v1/strategies/performance');
  }

  // Recent trades
  async getRecentTrades(limit: number = 10): Promise<TradeRecord[]> {
    return this.fetch(`/api/v1/trades/list?limit=${limit}`);
  }

  // Trigger sync
  async triggerFullSync(): Promise<{ success: boolean; message: string }> {
    return this.fetch('/api/v1/sync/obsidian/full', { method: 'POST' });
  }
}

export const syncApi = new SyncApiClient();
