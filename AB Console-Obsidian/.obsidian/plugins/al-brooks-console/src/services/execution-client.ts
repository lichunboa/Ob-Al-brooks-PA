/**
 * Execution Service Client V2.6.0
 *
 * 连接 execution-service (8092) 获取币安 Demo Trading 数据
 * 用于 Obsidian 插件显示交易状态
 */

const EXECUTION_BASE_URL = 'http://localhost:8092';

// ========== 类型定义 ==========

export interface HealthStatus {
  status: string;
  mode: string;
  service: string;
  version?: string;
  trading_enabled?: boolean;
}

export interface Balance {
  asset: string;
  balance: number;
  available: number;
  unrealized_pnl: number;
}

export interface Position {
  symbol: string;
  side: 'LONG' | 'SHORT';
  quantity: number;
  entry_price: number;
  mark_price: number;
  unrealized_pnl: number;
  leverage: number;
  margin_type: string;
  liquidation_price?: number;
}

export interface BotAllocation {
  bot_id: string;
  name: string;
  allocated_usdt: number;
  max_leverage: number;
  max_positions: number;
  enabled: boolean;
  current_positions?: number;
  used_margin?: number;
}

export interface TradingStatus {
  trading_enabled: boolean;
  last_sync: string | null;
  binance_balance: number;
  binance_available: number;
  total_unrealized_pnl: number;
  total_allocated: number;
  total_used: number;
  total_positions: number;
  allocations: Record<string, BotAllocation>;
}

export interface RiskStatus {
  emergency_stop: boolean;
  daily_pnl: number;
  daily_loss_limit: number;
  remaining_loss_budget: number;
  open_positions: number;
  max_position_size: number;
  can_open_new_position: boolean;
}

export interface ExecutionSummary {
  connected: boolean;
  mode: string;
  trading_enabled: boolean;
  balance: number;
  available: number;
  unrealized_pnl: number;
  positions_count: number;
  last_sync: string | null;
}

// ========== 客户端类 ==========

export class ExecutionClient {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl = EXECUTION_BASE_URL, timeout = 5000) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
  }

  /**
   * 更新配置
   */
  updateConfig(baseUrl?: string, timeout?: number): void {
    if (baseUrl) this.baseUrl = baseUrl;
    if (timeout) this.timeout = timeout;
  }

  /**
   * 发送请求
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`ExecutionClient: ${endpoint} 返回 ${response.status}`);
        return null;
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if ((error as Error).name === 'AbortError') {
        console.warn(`ExecutionClient: ${endpoint} 超时`);
      } else {
        console.warn(`ExecutionClient: ${endpoint} 错误:`, error);
      }
      return null;
    }
  }

  // ========== 健康检查 ==========

  /**
   * 检查服务是否可用
   */
  async isAvailable(): Promise<boolean> {
    const health = await this.request<HealthStatus>('/health');
    return health?.status === 'healthy';
  }

  /**
   * 获取健康状态
   */
  async getHealth(): Promise<HealthStatus | null> {
    return this.request<HealthStatus>('/health');
  }

  // ========== 账户数据 ==========

  /**
   * 获取余额
   */
  async getBalance(): Promise<Balance[]> {
    const result = await this.request<Balance[]>('/balance');
    return result || [];
  }

  /**
   * 获取 USDT 余额
   */
  async getUsdtBalance(): Promise<number> {
    const balances = await this.getBalance();
    const usdt = balances.find((b) => b.asset === 'USDT');
    return usdt?.balance || 0;
  }

  /**
   * 获取持仓
   */
  async getPositions(): Promise<Position[]> {
    const result = await this.request<Position[]>('/positions');
    return result || [];
  }

  // ========== 交易状态 ==========

  /**
   * 获取交易状态
   */
  async getTradingStatus(): Promise<TradingStatus | null> {
    return this.request<TradingStatus>('/trading/status');
  }

  /**
   * 获取风控状态
   */
  async getRiskStatus(): Promise<RiskStatus | null> {
    return this.request<RiskStatus>('/risk/status');
  }

  /**
   * 同步币安数据
   */
  async syncFromBinance(): Promise<boolean> {
    const result = await this.request<{ success: boolean }>('/trading/sync', {
      method: 'POST',
    });
    return result?.success || false;
  }

  // ========== 便捷方法 ==========

  /**
   * 获取执行摘要（用于 Dashboard 显示）
   */
  async getSummary(): Promise<ExecutionSummary> {
    const [health, tradingStatus, positions] = await Promise.all([
      this.getHealth(),
      this.getTradingStatus(),
      this.getPositions(),
    ]);

    if (!health) {
      return {
        connected: false,
        mode: 'unknown',
        trading_enabled: false,
        balance: 0,
        available: 0,
        unrealized_pnl: 0,
        positions_count: 0,
        last_sync: null,
      };
    }

    return {
      connected: true,
      mode: health.mode,
      trading_enabled: tradingStatus?.trading_enabled || false,
      balance: tradingStatus?.binance_balance || 0,
      available: tradingStatus?.binance_available || 0,
      unrealized_pnl: tradingStatus?.total_unrealized_pnl || 0,
      positions_count: positions.length,
      last_sync: tradingStatus?.last_sync || null,
    };
  }

  /**
   * 检查机器人是否可以交易
   */
  async canBotTrade(botId: string): Promise<{
    can_trade: boolean;
    reason: string;
  }> {
    const result = await this.request<{
      can_trade: boolean;
      reason: string;
    }>(`/trading/can-trade/${botId}`);

    return result || { can_trade: false, reason: '服务未连接' };
  }
}

// ========== 单例实例 ==========

let _executionClient: ExecutionClient | null = null;

/**
 * 获取 ExecutionClient 单例
 */
export function getExecutionClient(baseUrl?: string): ExecutionClient {
  if (!_executionClient || baseUrl) {
    _executionClient = new ExecutionClient(baseUrl);
  }
  return _executionClient;
}

/**
 * 重置客户端（用于配置变更）
 */
export function resetExecutionClient(): void {
  _executionClient = null;
}
