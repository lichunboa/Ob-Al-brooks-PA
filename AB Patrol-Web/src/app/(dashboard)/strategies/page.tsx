'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Play, Pause, TrendingUp, TrendingDown,
  Activity, RefreshCw, BookOpen, CheckCircle,
  Clock, Target, AlertCircle, ExternalLink, Plus, X
} from 'lucide-react';
import { config } from '@/lib/config';

// 策略定义 - 与 Obsidian 策略卡片 frontmatter 对齐
interface Strategy {
  id: string;
  name: string;
  description: string;
  status: string;
  directions: string[];
  timeframes: string[];
  risk_level: string;
  source?: string;
  enabled: boolean;
  risk_reward?: string;
  setup_category?: string;
  patterns?: string[];
  entry_criteria?: string[];
}

export default function StrategiesPage() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced'>('idle');

  // 创建策略弹窗
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newStrategy, setNewStrategy] = useState({
    name: '',
    description: '',
    status: '学习中 (Learning)',
    directions: ['做多 (Long)'] as string[],
    timeframes: ['5m', '15m'] as string[],
    risk_level: '中 (Medium)',
    risk_reward: '2:1',
  });
  const [isCreating, setIsCreating] = useState(false);

  // 编辑策略弹窗
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<Strategy | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    status: '学习中 (Learning)',
    directions: ['做多 (Long)'] as string[],
    timeframes: ['5m', '15m'] as string[],
    risk_level: '中 (Medium)',
    risk_reward: '2:1',
  });
  const [isUpdating, setIsUpdating] = useState(false);

  const apiUrl = config.apiUrl;

  // 加载策略列表（从 Obsidian 同步）
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
      const res = await fetch(`${apiUrl}/api/v1/strategies/sync`);
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

  // 创建新策略
  const createStrategy = async () => {
    if (!newStrategy.name || !newStrategy.description) {
      alert('请填写策略名称和描述');
      return;
    }

    setIsCreating(true);
    try {
      const res = await fetch(`${apiUrl}/api/v1/strategies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy: {
            ...newStrategy,
            entry_criteria: ['满足策略条件时入场'],
          }
        })
      });

      if (res.ok) {
        const data = await res.json();
        alert(`策略创建成功！文件: ${data.file_path}`);
        setShowCreateModal(false);
        setNewStrategy({
          name: '',
          description: '',
          status: '学习中 (Learning)',
          directions: ['做多 (Long)'],
          timeframes: ['5m', '15m'],
          risk_level: '中 (Medium)',
          risk_reward: '2:1',
        });
        await fetchStrategies();
      } else {
        const err = await res.json();
        alert(`创建失败: ${err.error || '未知错误'}`);
      }
    } catch (e) {
      alert('网络错误');
    } finally {
      setIsCreating(false);
    }
  };

  // 初始加载
  useEffect(() => {
    fetchStrategies();
  }, [fetchStrategies]);

  // 切换策略启用状态
  const toggleStrategy = async (strategy: Strategy) => {
    // Web 端状态存储在本地
    const updated = { ...strategy, enabled: !strategy.enabled };
    setStrategies(prev => prev.map(s => s.id === strategy.id ? updated : s));
    if (selectedStrategy?.id === strategy.id) {
      setSelectedStrategy(updated);
    }
  };

  // 打开 Obsidian 策略卡片
  const openInObsidian = (strategy: Strategy) => {
    const vault = 'Al-brooks-PA';
    const path = `策略仓库 (Strategy Repository)/Al Brooks 策略/${strategy.name}.md`;
    const uri = `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(path)}`;
    window.open(uri, '_blank');
  };

  // 打开编辑弹窗
  const openEditModal = (strategy: Strategy) => {
    setEditingStrategy(strategy);
    setEditForm({
      name: strategy.name,
      description: strategy.description?.replace('# 🎯 策略概览', '').trim() || '',
      status: Array.isArray(strategy.status) ? strategy.status[0] : strategy.status,
      directions: strategy.directions || ['做多 (Long)'],
      timeframes: strategy.timeframes || ['5m', '15m'],
      risk_level: strategy.risk_level || '中 (Medium)',
      risk_reward: strategy.risk_reward || '2:1',
    });
    setShowEditModal(true);
  };

  // 更新策略
  const updateStrategy = async () => {
    if (!editingStrategy || !editForm.name || !editForm.description) {
      alert('请填写策略名称和描述');
      return;
    }

    setIsUpdating(true);
    try {
      const res = await fetch(`${apiUrl}/api/v1/strategies/${editingStrategy.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy: {
            ...editForm,
            original_name: editingStrategy.name, // 用于查找原文件
          }
        })
      });

      if (res.ok) {
        const data = await res.json();
        alert(`策略更新成功！文件: ${data.file_path}`);
        setShowEditModal(false);
        setEditingStrategy(null);
        await fetchStrategies();
      } else {
        const err = await res.json();
        alert(`更新失败: ${err.error || '未知错误'}`);
      }
    } catch (e) {
      alert('网络错误');
    } finally {
      setIsUpdating(false);
    }
  };

  // 策略类型图标
  const getDirectionIcon = (directions: string[]) => {
    const hasLong = directions.some(d => d.includes('Long') || d.includes('做多'));
    const hasShort = directions.some(d => d.includes('Short') || d.includes('做空'));

    if (hasLong && hasShort) return <Activity className="w-4 h-4 text-blue-500" />;
    if (hasLong) return <TrendingUp className="w-4 h-4 text-green-500" />;
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
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-sm rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              新建策略
            </button>
          </div>
        </div>

        {/* 提示信息 */}
        <div className="mb-4 p-3 bg-blue-900/20 border border-blue-800 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-300">
            <p className="font-medium mb-1">策略数据源：Obsidian 策略仓库</p>
            <p>策略卡片在 Obsidian 中存储。Web端可查看、启用/停用，也可创建新策略。</p>
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
                        <span className="px-1.5 py-0.5 bg-slate-700 text-slate-400 text-xs rounded">已停用</span>
                      )}
                      <span className={`px-1.5 py-0.5 text-xs rounded ${
                        String(strategy.status).includes('活跃')
                          ? 'bg-green-600/20 text-green-400'
                          : 'bg-yellow-600/20 text-yellow-400'
                      }`}>
                        {Array.isArray(strategy.status) ? strategy.status[0] : strategy.status}
                      </span>
                    </div>
                    <p className="text-sm text-slate-400 mt-0.5 line-clamp-1">
                      {strategy.description?.replace('# 🎯 策略概览', '').trim() || '暂无描述'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleStrategy(strategy); }}
                    className={`p-2 rounded-lg transition-colors ${
                      strategy.enabled
                        ? 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
                        : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
                    }`}
                  >
                    {strategy.enabled ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); openInObsidian(strategy); }}
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
                {strategy.risk_reward && (
                  <span className="text-blue-400">盈亏比: {strategy.risk_reward}</span>
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
              <div className="flex gap-2">
                <button
                  onClick={() => openEditModal(selectedStrategy)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs rounded-lg transition-colors"
                >
                  编辑
                </button>
                <button
                  onClick={() => openInObsidian(selectedStrategy)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  在Obsidian中打开
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <div className="text-xs text-slate-500 mb-1">描述</div>
                <p className="text-sm text-white">{selectedStrategy.description?.replace('# 🎯 策略概览', '').trim() || '暂无描述'}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-slate-500">状态</div>
                  <div className="text-sm text-white">
                    {Array.isArray(selectedStrategy.status) ? selectedStrategy.status[0] : selectedStrategy.status}
                  </div>
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
                    <span key={tf} className="px-2 py-0.5 bg-slate-800 text-slate-300 text-xs rounded">{tf}</span>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-500">方向</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(Array.isArray(selectedStrategy.directions) ? selectedStrategy.directions : []).map(dir => (
                    <span key={dir} className={`px-2 py-0.5 text-xs rounded ${
                      dir.includes('Long') || dir.includes('做多')
                        ? 'bg-green-600/20 text-green-400'
                        : 'bg-red-600/20 text-red-400'
                    }`}>
                      {dir.includes('Long') ? '做多' : dir.includes('Short') ? '做空' : dir}
                    </span>
                  ))}
                </div>
              </div>

              {selectedStrategy.patterns && selectedStrategy.patterns.length > 0 && (
                <div>
                  <div className="text-xs text-slate-500">观察到的形态</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedStrategy.patterns.map(p => (
                      <span key={p} className="px-2 py-0.5 bg-slate-800 text-slate-300 text-xs rounded">{p}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="w-full lg:w-96 flex-shrink-0">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
            <BookOpen className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">选择一个策略查看详情</p>
          </div>
        </div>
      )}

      {/* 创建策略弹窗 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white">新建策略</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-500">策略名称 *</label>
                <input
                  type="text"
                  value={newStrategy.name}
                  onChange={(e) => setNewStrategy({ ...newStrategy, name: e.target.value })}
                  className="w-full mt-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                  placeholder="例如：20均线缺口"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">描述 *</label>
                <textarea
                  value={newStrategy.description}
                  onChange={(e) => setNewStrategy({ ...newStrategy, description: e.target.value })}
                  rows={3}
                  className="w-full mt-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm resize-none"
                  placeholder="一句话描述策略..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500">状态</label>
                  <select
                    value={newStrategy.status}
                    onChange={(e) => setNewStrategy({ ...newStrategy, status: e.target.value })}
                    className="w-full mt-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                  >
                    <option value="学习中 (Learning)">学习中</option>
                    <option value="活跃 (Active)">活跃</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500">风险等级</label>
                  <select
                    value={newStrategy.risk_level}
                    onChange={(e) => setNewStrategy({ ...newStrategy, risk_level: e.target.value })}
                    className="w-full mt-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                  >
                    <option value="低 (Low)">低</option>
                    <option value="中 (Medium)">中</option>
                    <option value="高 (High)">高</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500">方向</label>
                <div className="flex gap-2 mt-1">
                  {['做多 (Long)', '做空 (Short)'].map(dir => (
                    <label key={dir} className="flex items-center gap-1 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={newStrategy.directions.includes(dir)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewStrategy({ ...newStrategy, directions: [...newStrategy.directions, dir] });
                          } else {
                            setNewStrategy({ ...newStrategy, directions: newStrategy.directions.filter(d => d !== dir) });
                          }
                        }}
                        className="rounded border-slate-600"
                      />
                      {dir.includes('Long') ? '做多' : '做空'}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={createStrategy}
                disabled={isCreating}
                className="flex-1 py-2 bg-green-600 hover:bg-green-500 disabled:bg-green-700 text-white rounded-lg transition-colors"
              >
                {isCreating ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑策略弹窗 */}
      {showEditModal && editingStrategy && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white">编辑策略</h3>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-500">策略名称 *</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full mt-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                  placeholder="例如：20均线缺口"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">描述 *</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={3}
                  className="w-full mt-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm resize-none"
                  placeholder="一句话描述策略..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500">状态</label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    className="w-full mt-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                  >
                    <option value="学习中 (Learning)">学习中</option>
                    <option value="活跃 (Active)">活跃</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500">风险等级</label>
                  <select
                    value={editForm.risk_level}
                    onChange={(e) => setEditForm({ ...editForm, risk_level: e.target.value })}
                    className="w-full mt-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                  >
                    <option value="低 (Low)">低</option>
                    <option value="中 (Medium)">中</option>
                    <option value="高 (High)">高</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500">方向</label>
                <div className="flex gap-2 mt-1">
                  {['做多 (Long)', '做空 (Short)'].map(dir => (
                    <label key={dir} className="flex items-center gap-1 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={editForm.directions.includes(dir)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setEditForm({ ...editForm, directions: [...editForm.directions, dir] });
                          } else {
                            setEditForm({ ...editForm, directions: editForm.directions.filter(d => d !== dir) });
                          }
                        }}
                        className="rounded border-slate-600"
                      />
                      {dir.includes('Long') ? '做多' : '做空'}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowEditModal(false)}
                className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={updateStrategy}
                disabled={isUpdating}
                className="flex-1 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-amber-700 text-white rounded-lg transition-colors"
              >
                {isUpdating ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
