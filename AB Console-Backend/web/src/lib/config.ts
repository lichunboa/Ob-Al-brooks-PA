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

// Docker 环境下，尝试从 window 对象获取运行时配置
const getRuntimeApiUrl = () => {
  if (typeof window !== 'undefined') {
    // 使用当前主机名，配合 Next.js rewrite 规则
    return '/api/backend';
  }
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8088';
};

const getRuntimeWsUrl = () => {
  if (typeof window !== 'undefined') {
    // WebSocket 使用当前主机名
    const host = window.location.hostname;
    return `ws://${host}:8088`;
  }
  return process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8088';
};

const getRuntimeSyncUrl = () => {
  if (typeof window !== 'undefined') {
    return '/api/sync';
  }
  return process.env.NEXT_PUBLIC_SYNC_API_URL || 'http://localhost:8089';
};

export const config = {
  /** 后端 HTTP API 地址（浏览器走代理，SSR 直连） */
  apiUrl: getRuntimeApiUrl(),

  /** WebSocket 地址（WS 不走代理，需要绝对地址） */
  wsUrl: getRuntimeWsUrl(),

  /** Sync Service 地址（浏览器走代理） */
  syncApiUrl: getRuntimeSyncUrl(),

  /** 默认交易对列表 */
  defaultSymbols: [
    'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT',
  ] as const,

  /** 支持的时间周期 */
  timeframes: ['1m', '5m', '15m', '1h', '4h', '1d'] as const,
} as const;
