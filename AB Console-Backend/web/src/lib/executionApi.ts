/**
 * Execution Service API
 */
import { config } from './config';

// ========== 类型定义 ==========

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

export interface RiskStatus {
  emergency_stop: boolean;
  daily_pnl: number;
  daily_loss_limit: number;
  remaining_loss_budget: number;
  open_positions: number;
  max_position_size: number;
  can_open_new_position: boolean;
}

export interface ConfigStatus {
  mode: string;
  api_key_configured: boolean;
  api_key_preview: string;
  secret_configured: boolean;
  max_daily_loss: number;
  max_position_size: number;
  max_leverage: number;
}

export interface ConfigUpdate {
  mode?: string;
  api_key?: string;
  api_secret?: string;
  max_daily_loss?: number;
  max_position_size?: number;
  max_leverage?: number;
}

export interface OrderRequest {
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  order_type?: 'MARKET' | 'LIMIT';
  price?: number;
  stop_loss?: number;
  take_profit?: number;
  leverage?: number;
}

export interface OrderResponse {
  success: boolean;
  order_id?: string;
  symbol: string;
  side: string;
  quantity: number;
  price?: number;
  status: string;
  message?: string;
}

export interface HealthStatus {
  status: string;
  mode: string;
  service: string;
  version?: string;
  trading_enabled?: boolean;
}

// ========== V2.6.0 新增类型 ==========

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

export interface AllocationUpdate {
  allocated_usdt?: number;
  max_leverage?: number;
  max_positions?: number;
  enabled?: boolean;
}

// ========== V2.6.3 交易历史类型 ==========

export interface TradeHistory {
  trade_id: string;
  order_id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  realized_pnl: number;
  commission: number;
  commission_asset: string;
  timestamp: string;
  bot_id: string | null;
}

export interface OpenOrder {
  order_id: string;
  symbol: string;
  side: string;
  order_type: string;
  quantity: number;
  price: number | null;
  stop_price: number | null;
  status: string;
  reduce_only: boolean;
  created_at: string | null;
  bot_id: string | null;
  client_order_id: string | null;
}

export interface AccountSummary {
  total_balance: number;
  available_balance: number;
  total_unrealized_pnl: number;
  total_margin_balance: number;
  position_count: number;
  total_position_value: number;
  open_order_count: number;
  today_realized_pnl: number;
  today_trade_count: number;
  today_commission: number;
  margin_ratio: number | null;
  can_trade: boolean;
}

// ========== API 函数 ==========

const getBaseUrl = () => config.executionApiUrl;

export async function checkHealth(): Promise<HealthStatus | null> {
  try {
    const res = await fetch(`${getBaseUrl()}/health`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getBalance(): Promise<Balance[]> {
  const res = await fetch(`${getBaseUrl()}/balance`);
  if (!res.ok) throw new Error('获取余额失败');
  return res.json();
}

export async function getPositions(): Promise<Position[]> {
  const res = await fetch(`${getBaseUrl()}/positions`);
  if (!res.ok) throw new Error('获取持仓失败');
  return res.json();
}

export async function getRiskStatus(): Promise<RiskStatus> {
  const res = await fetch(`${getBaseUrl()}/risk/status`);
  if (!res.ok) throw new Error('获取风控状态失败');
  return res.json();
}

export async function setEmergencyStop(enabled: boolean): Promise<{ success: boolean }> {
  const res = await fetch(`${getBaseUrl()}/risk/emergency-stop?enabled=${enabled}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('设置紧急停止失败');
  return res.json();
}

export async function getConfig(): Promise<ConfigStatus> {
  const res = await fetch(`${getBaseUrl()}/config`);
  if (!res.ok) throw new Error('获取配置失败');
  return res.json();
}

export async function updateConfig(config: ConfigUpdate): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${getBaseUrl()}/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error('更新配置失败');
  return res.json();
}

export async function placeOrder(order: OrderRequest): Promise<OrderResponse> {
  const res = await fetch(`${getBaseUrl()}/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(order),
  });
  if (!res.ok) throw new Error('下单失败');
  return res.json();
}

export async function closePosition(symbol: string, quantity?: number): Promise<OrderResponse> {
  const url = quantity
    ? `${getBaseUrl()}/order/${symbol}/close?quantity=${quantity}`
    : `${getBaseUrl()}/order/${symbol}/close`;
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) throw new Error('平仓失败');
  return res.json();
}

export async function cancelAllOrders(symbol?: string): Promise<{ success: boolean }> {
  const url = symbol
    ? `${getBaseUrl()}/orders?symbol=${symbol}`
    : `${getBaseUrl()}/orders`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error('取消订单失败');
  return res.json();
}

// ========== V2.6.0 交易状态管理 API ==========

export async function getTradingStatus(): Promise<TradingStatus | null> {
  try {
    const res = await fetch(`${getBaseUrl()}/trading/status`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function toggleTrading(enabled: boolean): Promise<{ success: boolean; trading_enabled: boolean; message: string }> {
  const res = await fetch(`${getBaseUrl()}/trading/toggle?enabled=${enabled}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('切换交易状态失败');
  return res.json();
}

export async function syncFromBinance(): Promise<{
  success: boolean;
  balance: number;
  available: number;
  unrealized_pnl: number;
  positions_count: number;
  last_sync: string;
}> {
  const res = await fetch(`${getBaseUrl()}/trading/sync`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('同步失败');
  return res.json();
}

export async function updateAllocation(
  botId: string,
  data: AllocationUpdate
): Promise<{ success: boolean; bot_id: string; allocation: BotAllocation }> {
  const res = await fetch(`${getBaseUrl()}/trading/allocate/${botId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('更新分配失败');
  return res.json();
}

export async function canBotTrade(botId: string): Promise<{
  can_trade: boolean;
  reason: string;
  bot_id: string;
  allocation: BotAllocation | null;
}> {
  const res = await fetch(`${getBaseUrl()}/trading/can-trade/${botId}`);
  if (!res.ok) throw new Error('检查交易状态失败');
  return res.json();
}

export async function calculatePositionSize(
  botId: string,
  entryPrice: number,
  stopLoss: number,
  riskPercent: number = 1.0
): Promise<{
  bot_id: string;
  quantity: number;
  explanation: string;
  entry_price: number;
  stop_loss: number;
  risk_percent: number;
}> {
  const params = new URLSearchParams({
    entry_price: entryPrice.toString(),
    stop_loss: stopLoss.toString(),
    risk_percent: riskPercent.toString(),
  });
  const res = await fetch(`${getBaseUrl()}/trading/calculate-size/${botId}?${params}`);
  if (!res.ok) throw new Error('计算仓位失败');
  return res.json();
}

// ========== V2.6.3 交易历史 API ==========

export async function getTradeHistory(
  symbol?: string,
  limit: number = 200
): Promise<TradeHistory[]> {
  const params = new URLSearchParams({ limit: limit.toString() });
  if (symbol) params.set('symbol', symbol);
  const res = await fetch(`${getBaseUrl()}/trades/history?${params}`);
  if (!res.ok) throw new Error('获取交易历史失败');
  return res.json();
}

export async function getOpenOrders(symbol?: string): Promise<OpenOrder[]> {
  const url = symbol
    ? `${getBaseUrl()}/orders/open?symbol=${symbol}`
    : `${getBaseUrl()}/orders/open`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('获取挂单失败');
  return res.json();
}

export async function getAccountSummary(): Promise<AccountSummary | null> {
  try {
    const res = await fetch(`${getBaseUrl()}/account/summary`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
