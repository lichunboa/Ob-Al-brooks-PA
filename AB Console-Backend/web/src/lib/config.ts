/**
 * 统一配置模块
 *
 * 浏览器端使用相对路径 /api/backend (走 Next.js rewrite 代理到后端)，
 * 这样局域网设备（手机等）也能正常访问。
 * 服务端（SSR）使用绝对地址直连后端。
 *
 * 使用方式：import { config } from '@/lib/config';
 */

const isBrowser = typeof window !== 'undefined';

export const config = {
  /** 后端 HTTP API 地址（浏览器走代理，SSR 直连） */
  apiUrl: isBrowser
    ? '/api/backend'
    : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8088'),

  /** WebSocket 地址（WS 不走代理，需要绝对地址） */
  wsUrl: isBrowser
    ? `ws://${window.location.hostname}:8088`
    : (process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8088'),

  /** Sync Service 地址（浏览器走代理） */
  syncApiUrl: isBrowser
    ? '/api/sync'
    : (process.env.NEXT_PUBLIC_SYNC_API_URL || 'http://localhost:8089'),

  /** 默认交易对列表 */
  defaultSymbols: [
    'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT',
  ] as const,

  /** 支持的时间周期 */
  timeframes: ['1m', '5m', '15m', '1h', '4h', '1d'] as const,
} as const;
