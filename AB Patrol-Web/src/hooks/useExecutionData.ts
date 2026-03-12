'use client';

import { useState, useEffect, useCallback } from 'react';
import * as api from '@/lib/executionApi';
import { BOT_IDS } from '@/lib/botConfig';
import type {
  Balance,
  Position,
  RiskStatus,
  ConfigStatus,
  HealthStatus,
  TradingStatus,
  BotSummary,
  EvolutionSummary,
  PatrolStatus,
  AllocationUpdate,
  ExecutionAccountOverview,
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
  const [botSummaries, setBotSummaries] = useState<Record<string, BotSummary>>({});
  const [botEvolutions, setBotEvolutions] = useState<Record<string, EvolutionSummary>>({});
  const [patrolStatus, setPatrolStatus] = useState<PatrolStatus | null>(null);
  const [accountsOverview, setAccountsOverview] = useState<{
    generated_at: string;
    primary: ExecutionAccountOverview;
    secondary: ExecutionAccountOverview | null;
  } | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setError(null);

    try {
      const healthData = await api.checkHealth();
      if (!healthData) {
        setIsConnected(false);
        setError('无法连接到 Execution Service (端口 8092)');
        setIsLoading(false);
        return;
      }

      setHealth(healthData);
      setIsConnected(true);

      const [
        balanceData,
        positionsData,
        riskData,
        configData,
        tradingData,
        patrolData,
        accountsData,
        summariesArr,
        evolutionsArr,
      ] = await Promise.all([
        api.getBalance().catch(() => []),
        api.getPositions().catch(() => []),
        api.getRiskStatus().catch(() => null),
        api.getConfig().catch(() => null),
        api.getTradingStatus().catch(() => null),
        api.getPatrolStatus().catch(() => null),
        api.getExecutionAccounts().catch(() => null),
        Promise.all(BOT_IDS.map((id) => api.getBotSummary(id).catch(() => null))),
        Promise.all(BOT_IDS.map((id) => api.getEvolutionSummary(id).catch(() => null))),
      ]);

      setBalance(balanceData);
      setPositions(positionsData);
      setRiskStatus(riskData);
      setConfig(configData);
      setTradingStatus(tradingData);
      setPatrolStatus(patrolData);
      setAccountsOverview(accountsData);

      const sMap: Record<string, BotSummary> = {};
      const eMap: Record<string, EvolutionSummary> = {};
      BOT_IDS.forEach((id, i) => {
        if (summariesArr[i]) sMap[id] = summariesArr[i]!;
        if (evolutionsArr[i]) eMap[id] = evolutionsArr[i]!;
      });
      setBotSummaries(sMap);
      setBotEvolutions(eMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const toggleTrading = useCallback(async (enabled: boolean) => {
    const result = await api.toggleTrading(enabled);
    if (result.success) await refresh();
    return result;
  }, [refresh]);

  const syncFromBinance = useCallback(async () => {
    const result = await api.syncFromBinance();
    if (result.success) await refresh();
    return result;
  }, [refresh]);

  const updateAllocation = useCallback(async (botId: string, data: AllocationUpdate) => {
    const result = await api.updateAllocation(botId, data);
    if (result.success) await refresh();
    return result;
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
    botSummaries,
    botEvolutions,
    patrolStatus,
    accountsOverview,
    refresh,
    toggleTrading,
    syncFromBinance,
    updateAllocation,
  };
}
