'use client';

import { useState, useEffect, useCallback } from 'react';
import * as api from '@/lib/executionApi';
import type {
  Balance,
  Position,
  RiskStatus,
  ConfigStatus,
  HealthStatus,
} from '@/lib/executionApi';

export function useExecutionData() {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [balance, setBalance] = useState<Balance[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [riskStatus, setRiskStatus] = useState<RiskStatus | null>(null);
  const [config, setConfig] = useState<ConfigStatus | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // 先检查健康状态
      const healthData = await api.checkHealth();
      if (!healthData) {
        setIsConnected(false);
        setError('无法连接到 Execution Service (端口 8091)');
        setIsLoading(false);
        return;
      }

      setHealth(healthData);
      setIsConnected(true);

      // 并行获取其他数据
      const [balanceData, positionsData, riskData, configData] = await Promise.all([
        api.getBalance().catch(() => []),
        api.getPositions().catch(() => []),
        api.getRiskStatus().catch(() => null),
        api.getConfig().catch(() => null),
      ]);

      setBalance(balanceData);
      setPositions(positionsData);
      setRiskStatus(riskData);
      setConfig(configData);
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 初始加载
  useEffect(() => {
    refresh();
  }, [refresh]);

  // 定时刷新（每 10 秒）
  useEffect(() => {
    if (!isConnected) return;

    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, [isConnected, refresh]);

  return {
    isConnected,
    isLoading,
    error,
    health,
    balance,
    positions,
    riskStatus,
    config,
    refresh,
  };
}
