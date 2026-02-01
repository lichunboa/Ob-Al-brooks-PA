/**
 * 统一配置模块
 *
 * 所有环境变量和默认值集中管理，避免各页面重复硬编码。
 * 使用方式：import { config } from '@/lib/config';
 */

export const config = {
  /** 后端 HTTP API 地址 */
  apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8088',

  /** WebSocket 地址 */
  wsUrl: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8088',

  /** Sync Service 地址 */
  syncApiUrl: process.env.NEXT_PUBLIC_SYNC_API_URL || 'http://localhost:8089',

  /** 默认交易对列表 */
  defaultSymbols: [
    'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT',
  ] as const,

  /** 支持的时间周期 */
  timeframes: ['1m', '5m', '15m', '1h', '4h', '1d'] as const,
} as const;
