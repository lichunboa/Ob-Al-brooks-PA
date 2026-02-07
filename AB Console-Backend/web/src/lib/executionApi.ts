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
