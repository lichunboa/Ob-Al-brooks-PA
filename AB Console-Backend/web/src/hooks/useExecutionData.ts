'use client';

import { useState, useEffect, useCallback } from 'react';
import * as api from '@/lib/executionApi';
import type {
  Balance,
  Position,
  RiskStatus,
  ConfigStatus,
  HealthStatus,
  TradingStatus,
  BotAllocation,
  AllocationUpdate,
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
  const [tradingStatus, setTradingStatus] = useState<TradingStatus | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setError(null);

    try {
      // 先检查健康状态
      const healthData = await api.checkHealth();
      if (!healthData) {
        setIsConnected(false);
        setError('无法连接到 Execution Service (端口 8092)');
        setIsLoading(false);
        return;
      }

      setHealth(healthData);
      setIsConnected(true);

      // 并行获取其他数据
      const [balanceData, positionsData, riskData, configData, tradingData] = await Promise.all([
        api.getBalance().catch(() => []),
        api.getPositions().catch(() => []),
        api.getRiskStatus().catch(() => null),
        api.getConfig().catch(() => null),
        api.getTradingStatus().catch(() => null),
      ]);

      setBalance(balanceData);
      setPositions(positionsData);
      setRiskStatus(riskData);
      setConfig(configData);
      setTradingStatus(tradingData);
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 切换交易状态
  const toggleTrading = useCallback(async (enabled: boolean) => {
    const result = await api.toggleTrading(enabled);
    if (result.success) {
      // 刷新数据
      await refresh();
    }
    return result;
  }, [refresh]);

  // 同步币安数据
  const syncFromBinance = useCallback(async () => {
    const result = await api.syncFromBinance();
    if (result.success) {
      await refresh();
    }
    return result;
  }, [refresh]);

  // 更新机器人分配
  const updateAllocation = useCallback(async (botId: string, data: AllocationUpdate) => {
    const result = await api.updateAllocation(botId, data);
    if (result.success) {
      await refresh();
    }
    return result;
  }, [refresh]);

  // 初始加载
  useEffect(() => {
    refresh();
  }, [refresh]);

  // 定时刷新（每 10 秒）
  useEffect(() => {
    if (!isConnected) return;

    const interval = setInterval(() => refresh(true), 10000);
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
    tradingStatus,
    refresh,
    toggleTrading,
    syncFromBinance,
    updateAllocation,
  };
}
