'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Play, Pause, TrendingUp, TrendingDown, 
  Activity, RefreshCw, BookOpen, CheckCircle, 
  Clock, Target, AlertCircle, ExternalLink
} from 'lucide-react';

// 策略定义 - 与 Obsidian 策略卡片 frontmatter 对齐
interface Strategy {
  id: string;
  name: string;  // 策略名称/strategy_name
  description: string;
  status: string;  // 策略状态/strategy_status
  directions: string[];  // 方向/direction
  timeframes: string[];  // 时间周期/timeframe
  risk_level: string;  // 风险等级/risk_level
  source?: string;  // 来源/source
  enabled: boolean;
  // Obsidian 特有属性
  setup_category?: string;  // 设置类别/setup_category
  patterns?: string[];  // 观察到的形态/patterns_observed
  entry_criteria?: string[];  // 入场条件/entry_criteria
  stop_loss?: string[];  // 止损建议/stop_loss_recommendation
  take_profit?: string[];  // 目标建议/take_profit_recommendation
  risk_reward?: string;  // 盈亏比/risk_reward
}

export default function StrategiesPage() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced'>('idle');

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8088';

  // 从后端加载策略列表（后端从 Obsidian 策略仓库同步）
  const fetchStrategies = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/v1/strategies`);
      if (res.ok) {
        const data = await res.json();
        setStrategies(data.strategies || []);
        setLastUpdate(new Date());
      } else {
        setError('加载策略失败');
      }
    } catch (e) {
      setError('网络错误，无法连接后端');
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl]);

  // 触发与 Obsidian 同步
  const syncWithObsidian = useCallback(async () => {
    setSyncStatus('syncing');
    try {
      const res = await fetch(`${apiUrl}/api/v1/strategies/sync`, {
        method: 'POST'
      });
      if (res.ok) {
        await fetchStrategies();
        setSyncStatus('synced');
        setTimeout(() => setSyncStatus('idle'), 3000);
      } else {
        setError('同步失败');
        setSyncStatus('idle');
      }
    } catch (e) {
      setError('同步请求失败');
      setSyncStatus('idle');
    }
  }, [apiUrl, fetchStrategies]);

  // 初始加载
  useEffect(() => {
    fetchStrategies();
  }, [fetchStrategies]);

  // 切换策略启用状态（仅 Web 端状态，不影响 Obsidian）
  const toggleStrategy = async (strategy: Strategy) => {
    const updated = { ...strategy, enabled: !strategy.enabled };
    
    try {
      const res = await fetch(`${apiUrl}/api/v1/strategies/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: strategy.id, enabled: updated.enabled })
      });
      
      if (res.ok) {
        setStrategies(prev => prev.map(s => s.id === strategy.id ? updated : s));
        if (selectedStrategy?.id === strategy.id) {
          setSelectedStrategy(updated);
        }
      }
    } catch (e) {
      console.error('Failed to toggle strategy:', e);
    }
  };

  // 打开 Obsidian 策略卡片
  const openInObsidian = (strategy: Strategy) => {
    // 构建 Obsidian URI
    const vault = 'Al-brooks-PA';
    const path = `策略仓库 (Strategy Repository)/Al Brooks 策略/${strategy.name}.md`;
    const uri = `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(path)}`;
    window.open(uri, '_blank');
  };

  // 策略类型图标
  const getDirectionIcon = (directions: string[]) => {
    if (directions.includes('做多') && directions.includes('做空')) {
      return <Activity className="w-4 h-4 text-blue-500" />;
    }
    if (directions.includes('做多') || directions.includes('Long')) {
      return <TrendingUp className="w-4 h-4 text-green-500" />;
    }
    return <TrendingDown className="w-4 h-4 text-red-500" />;
  };

  const enabledCount = strategies.filter(s => s.enabled).length;

  return (
    <div className="h-full flex flex-col lg:flex-row gap-4">
      {/* 左侧：策略列表 */}
      <div className="flex-1 min-w-0">
        {/* 标题栏 */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-white">策略管理</h2>
            <span className="px-2 py-0.5 bg-slate-800 text-slate-400 text-xs rounded-full">
              {enabledCount}/{strategies.length} 启用
            </span>
            {syncStatus === 'synced' && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-green-900/30 text-green-400 text-xs rounded-full">
                <CheckCircle className="w-3 h-3" />
                已同步
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchStrategies}
              disabled={isLoading}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 text-sm rounded-lg transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              刷新
            </button>
            <button 
              onClick={syncWithObsidian}
              disabled={syncStatus === 'syncing'}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-700 text-white text-sm rounded-lg transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
              {syncStatus === 'syncing' ? '同步中...' : '从Obsidian同步'}
            </button>
          </div>
        </div>

        {/* 提示信息 */}
        <div className="mb-4 p-3 bg-blue-900/20 border border-blue-800 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-300">
            <p className="font-medium mb-1">策略数据源：Obsidian 策略仓库</p>
            <p>策略卡片在 Obsidian 中编辑，Web端仅支持启用/停用和查看。点击策略可跳转至 Obsidian 编辑。</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded-lg flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        {/* 策略列表 */}
        <div className="space-y-3">
          {strategies.map((strategy) => (
            <div
              key={strategy.id}
              onClick={() => setSelectedStrategy(strategy)}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                selectedStrategy?.id === strategy.id
                  ? 'bg-slate-800 border-blue-600'
                  : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
              } ${!strategy.enabled && 'opacity-50'}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    strategy.enabled ? 'bg-blue-600/20 text-blue-400' : 'bg-slate-800 text-slate-500'
                  }`}>
                    {getDirectionIcon(strategy.directions)}
                  </div>

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white">{strategy.name}</span>
                      {!strategy.enabled && (
                        <span className="px-1.5 py-0.5 bg-slate-700 text-slate-400 text-xs rounded">
                          已停用
                        </span>
                      )}
                      <span className={`px-1.5 py-0.5 text-xs rounded ${
                        strategy.status === '活跃' || strategy.status === '活跃 (Active)'
                          ? 'bg-green-600/20 text-green-400' 
                          : 'bg-yellow-600/20 text-yellow-400'
                      }`}>
                        {strategy.status}
                      </span>
                    </div>
                    <p className="text-sm text-slate-400 mt-0.5 line-clamp-1">
                      {strategy.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleStrategy(strategy);
                    }}
                    className={`p-2 rounded-lg transition-colors ${
                      strategy.enabled
                        ? 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
                        : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
                    }`}
                  >
                    {strategy.enabled ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openInObsidian(strategy);
                    }}
                    className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
                    title="在 Obsidian 中打开"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-4 mt-3 text-xs text-slate-500 flex-wrap">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {Array.isArray(strategy.timeframes) ? strategy.timeframes.join(', ') : strategy.timeframes}
                </span>
                <span className="flex items-center gap-1">
                  <Target className="w-3 h-3" />
                  风险: {strategy.risk_level}
                </span>
                {strategy.source && (
                  <span className="flex items-center gap-1">
                    <BookOpen className="w-3 h-3" />
                    {strategy.source}
                  </span>
                )}
                {strategy.risk_reward && (
                  <span className="text-blue-400">
                    盈亏比: {strategy.risk_reward}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 右侧：策略详情 */}
      {selectedStrategy ? (
        <div className="w-full lg:w-96 flex-shrink-0">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sticky top-0">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white">策略详情</h3>
              <button
                onClick={() => openInObsidian(selectedStrategy)}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                在Obsidian中编辑
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <div className="text-xs text-slate-500 mb-1">描述</div>
                <p className="text-sm text-white">{selectedStrategy.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-slate-500">状态</div>
                  <div className="text-sm text-white">{selectedStrategy.status}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">风险等级</div>
                  <div className="text-sm text-white">{selectedStrategy.risk_level}</div>
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-500">适用时间框架</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(Array.isArray(selectedStrategy.timeframes) ? selectedStrategy.timeframes : []).map(tf => (
                    <span key={tf} className="px-2 py-0.5 bg-slate-800 text-slate-300 text-xs rounded">
                      {tf}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-500">方向</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(Array.isArray(selectedStrategy.directions) ? selectedStrategy.directions : []).map(dir => (
                    <span key={dir} className={`px-2 py-0.5 text-xs rounded ${
                      dir === 'Long' || dir === '做多'
                        ? 'bg-green-600/20 text-green-400' 
                        : 'bg-red-600/20 text-red-400'
                    }`}>
                      {dir === 'Long' ? '做多' : dir === 'Short' ? '做空' : dir}
                    </span>
                  ))}
                </div>
              </div>

              {selectedStrategy.setup_category && (
                <div>
                  <div className="text-xs text-slate-500">设置类别</div>
                  <div className="text-sm text-white">{selectedStrategy.setup_category}</div>
                </div>
              )}

              {selectedStrategy.patterns && selectedStrategy.patterns.length > 0 && (
                <div>
                  <div className="text-xs text-slate-500">观察到的形态</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedStrategy.patterns.map(p => (
                      <span key={p} className="px-2 py-0.5 bg-slate-800 text-slate-300 text-xs rounded">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedStrategy.risk_reward && (
                <div>
                  <div className="text-xs text-slate-500">盈亏比</div>
                  <div className="text-sm text-green-400 font-medium">{selectedStrategy.risk_reward}</div>
                </div>
              )}

              {selectedStrategy.source && (
                <div>
                  <div className="text-xs text-slate-500">来源</div>
                  <div className="text-sm text-white">{selectedStrategy.source}</div>
                </div>
              )}

              <div className="pt-4 border-t border-slate-800">
                <div className="text-xs text-slate-500 mb-2">Web 端控制</div>
                <button
                  onClick={() => toggleStrategy(selectedStrategy)}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                    selectedStrategy.enabled
                      ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30'
                      : 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
                  }`}
                >
                  {selectedStrategy.enabled ? (
                    <>
                      <Pause className="w-4 h-4" />
                      停用策略
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      启用策略
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="w-full lg:w-96 flex-shrink-0">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
            <BookOpen className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">选择一个策略查看详情</p>
            <p className="text-xs text-slate-500 mt-2">点击"在Obsidian中编辑"可修改策略</p>
          </div>
        </div>
      )}

      {lastUpdate && (
        <div className="fixed bottom-4 right-4 text-xs text-slate-500">
          更新于: {lastUpdate.toLocaleTimeString('zh-CN')}
        </div>
      )}
    </div>
  );
}
