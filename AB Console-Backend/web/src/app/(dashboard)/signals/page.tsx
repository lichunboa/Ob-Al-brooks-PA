'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Bell, Check, Trash2, Filter, ArrowUp, ArrowDown, RefreshCw, 
  Star, TrendingUp, BarChart3, Clock, Zap, Target, Bookmark,
  ChevronDown, Search, X, Settings, AlertCircle, Calendar
} from 'lucide-react';
import { useRealtimeData } from '@/hooks/useRealtimeData';

// 信号类型
interface TradingSignal {
  id: string;
  symbol: string;
  direction: 'BUY' | 'SELL' | 'ALERT';
  signal_name: string;
  pattern?: string;
  strength: number;
  price: number;
  timestamp: number;
  timeframe: string;
  read?: boolean;
  favorite?: boolean;
  message?: string;
}

// 统计类型
type TimeRange = '1h' | '24h' | '7d' | '30d';

export default function SignalsPage() {
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [selectedSignal, setSelectedSignal] = useState<TradingSignal | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [searchQuery, setSearchQuery] = useState('');
  
  // 筛选状态
  const [filters, setFilters] = useState({
    direction: 'all' as 'all' | 'BUY' | 'SELL' | 'ALERT',
    minStrength: 0,
    symbols: [] as string[],
    timeframes: [] as string[],
    onlyUnread: false,
    onlyFavorites: false,
  });

  const [showFilters, setShowFilters] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8088';
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8088/ws';

  // WebSocket 实时连接
  const { newSignals: realtimeSignals, isConnected: isWsConnected } = useRealtimeData({
    wsUrl,
    symbol: 'BTCUSDT', // 连接主要品种
    enabled: true,
  });

  // 所有品种列表（从信号中提取）
  const allSymbols = useMemo(() => {
    const symbols = new Set(signals.map(s => s.symbol));
    return Array.from(symbols).sort();
  }, [signals]);

  // 所有周期列表
  const allTimeframes = useMemo(() => {
    const tfs = new Set(signals.map(s => s.timeframe));
    return Array.from(tfs).sort();
  }, [signals]);

  // 获取信号
  const fetchSignals = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/v1/signals?limit=100`);
      
      if (res.ok) {
        const data = await res.json();
        const newSignals: TradingSignal[] = (data.signals || []).map((sig: any) => ({
          id: sig.id || `${sig.symbol}-${sig.timestamp}`,
          symbol: sig.symbol,
          direction: sig.direction,
          signal_name: sig.signal_name,
          pattern: sig.pattern,
          strength: Math.round((sig.strength || 0.5) * 100),
          price: 0, // 可以从其他 API 获取
          timestamp: sig.timestamp,
          timeframe: sig.timeframe || '5m',
          read: false,
          favorite: false,
          message: sig.message,
        }));

        setSignals(prev => {
          const existingIds = new Set(prev.map(s => s.id));
          const uniqueNew = newSignals.filter((s: TradingSignal) => !existingIds.has(s.id));
          
          if (uniqueNew.length > 0 && soundEnabled) {
            playNotificationSound();
          }
          
          return [...uniqueNew, ...prev].slice(0, 200);
        });
        
        setLastUpdate(new Date());
      }
    } catch (e) {
      console.error('[Signals] Failed to fetch:', e);
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl, soundEnabled]);

  // 处理 WebSocket 推送的新信号
  useEffect(() => {
    if (realtimeSignals.length > 0) {
      setSignals(prev => {
        const existingIds = new Set(prev.map(s => s.id));
        const uniqueNew = realtimeSignals
          .filter((s: any) => !existingIds.has(s.id))
          .map((s: any) => ({
            ...s,
            strength: Math.round((s.strength || 0.5) * 100),
            read: false,
            favorite: false,
          }));
        
        if (uniqueNew.length > 0 && soundEnabled) {
          playNotificationSound();
        }
        
        return [...uniqueNew, ...prev].slice(0, 200);
      });
    }
  }, [realtimeSignals, soundEnabled]);

  // 播放提示音
  const playNotificationSound = () => {
    try {
      const audio = new Audio('/notification.mp3');
      audio.volume = 0.3;
      audio.play().catch(() => {});
    } catch {}
  };

  // 标记已读
  const markAsRead = (id: string) => {
    setSignals(prev => prev.map(s => s.id === id ? { ...s, read: true } : s));
  };

  // 标记全部已读
  const markAllAsRead = () => {
    setSignals(prev => prev.map(s => ({ ...s, read: true })));
  };

  // 切换收藏
  const toggleFavorite = (id: string) => {
    setSignals(prev => prev.map(s => 
      s.id === id ? { ...s, favorite: !s.favorite } : s
    ));
  };

  // 删除信号
  const deleteSignal = (id: string) => {
    setSignals(prev => prev.filter(s => s.id !== id));
    if (selectedSignal?.id === id) {
      setSelectedSignal(null);
    }
  };

  // 清空所有
  const clearAll = () => {
    if (confirm('确定要清空所有信号吗？')) {
      setSignals([]);
      setSelectedSignal(null);
    }
  };

  // 应用筛选
  const filteredSignals = useMemo(() => {
    return signals.filter(s => {
      // 方向筛选
      if (filters.direction !== 'all' && s.direction !== filters.direction) return false;
      
      // 强度筛选
      if (s.strength < filters.minStrength) return false;
      
      // 品种筛选
      if (filters.symbols.length > 0 && !filters.symbols.includes(s.symbol)) return false;
      
      // 周期筛选
      if (filters.timeframes.length > 0 && !filters.timeframes.includes(s.timeframe)) return false;
      
      // 未读筛选
      if (filters.onlyUnread && s.read) return false;
      
      // 收藏筛选
      if (filters.onlyFavorites && !s.favorite) return false;
      
      // 搜索
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchSymbol = s.symbol.toLowerCase().includes(query);
        const matchName = s.signal_name.toLowerCase().includes(query);
        const matchPattern = s.pattern?.toLowerCase().includes(query);
        if (!matchSymbol && !matchName && !matchPattern) return false;
      }
      
      return true;
    });
  }, [signals, filters, searchQuery]);

  // 统计数据
  const stats = useMemo(() => {
    const total = filteredSignals.length;
    const buy = filteredSignals.filter(s => s.direction === 'BUY').length;
    const sell = filteredSignals.filter(s => s.direction === 'SELL').length;
    const alert = filteredSignals.filter(s => s.direction === 'ALERT').length;
    const unread = filteredSignals.filter(s => !s.read).length;
    const favorites = filteredSignals.filter(s => s.favorite).length;
    const avgStrength = total > 0 
      ? Math.round(filteredSignals.reduce((sum, s) => sum + s.strength, 0) / total)
      : 0;
    
    return { total, buy, sell, alert, unread, favorites, avgStrength };
  }, [filteredSignals]);

  // 初始加载
  useEffect(() => {
    fetchSignals();
    const interval = setInterval(fetchSignals, 30000);
    return () => clearInterval(interval);
  }, [fetchSignals]);

  // 格式化时间
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
    });
  };

  // 获取方向配置
  const getDirectionConfig = (direction: string) => {
    switch (direction) {
      case 'BUY':
        return { color: 'green', icon: ArrowUp, bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-400' };
      case 'SELL':
        return { color: 'red', icon: ArrowDown, bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400' };
      default:
        return { color: 'yellow', icon: AlertCircle, bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400' };
    }
  };

  return (
    <div className="h-full flex flex-col gap-4">
      {/* 顶部统计面板 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {/* 总信号 */}
        <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
            <Bell className="w-4 h-4" />
            <span>总信号</span>
          </div>
          <div className="text-2xl font-bold text-white">{stats.total}</div>
          {stats.unread > 0 && (
            <div className="text-xs text-green-400 mt-1">{stats.unread} 未读</div>
          )}
        </div>

        {/* 买入信号 */}
        <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
          <div className="flex items-center gap-2 text-green-400 text-sm mb-1">
            <TrendingUp className="w-4 h-4" />
            <span>买入</span>
          </div>
          <div className="text-2xl font-bold text-green-400">{stats.buy}</div>
          <div className="text-xs text-slate-500 mt-1">
            {stats.total > 0 ? Math.round((stats.buy / stats.total) * 100) : 0}%
          </div>
        </div>

        {/* 卖出信号 */}
        <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
          <div className="flex items-center gap-2 text-red-400 text-sm mb-1">
            <TrendingUp className="w-4 h-4 rotate-180" />
            <span>卖出</span>
          </div>
          <div className="text-2xl font-bold text-red-400">{stats.sell}</div>
          <div className="text-xs text-slate-500 mt-1">
            {stats.total > 0 ? Math.round((stats.sell / stats.total) * 100) : 0}%
          </div>
        </div>

        {/* 平均强度 */}
        <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
          <div className="flex items-center gap-2 text-purple-400 text-sm mb-1">
            <Zap className="w-4 h-4" />
            <span>平均强度</span>
          </div>
          <div className="text-2xl font-bold text-purple-400">{stats.avgStrength}%</div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2">
            <div 
              className="bg-purple-500 h-1.5 rounded-full transition-all"
              style={{ width: `${stats.avgStrength}%` }}
            />
          </div>
        </div>

        {/* 收藏 */}
        <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
          <div className="flex items-center gap-2 text-yellow-400 text-sm mb-1">
            <Star className="w-4 h-4" />
            <span>收藏</span>
          </div>
          <div className="text-2xl font-bold text-yellow-400">{stats.favorites}</div>
          <div className="text-xs text-slate-500 mt-1">重点跟踪</div>
        </div>

        {/* WebSocket 状态 */}
        <div className={`rounded-xl p-4 border ${isWsConnected ? 'bg-green-900/20 border-green-800/50' : 'bg-slate-900 border-slate-800'}`}>
          <div className={`flex items-center gap-2 text-sm mb-1 ${isWsConnected ? 'text-green-400' : 'text-slate-400'}`}>
            <Target className="w-4 h-4" />
            <span>实时连接</span>
          </div>
          <div className={`text-2xl font-bold ${isWsConnected ? 'text-green-400' : 'text-slate-500'}`}>
            {isWsConnected ? '在线' : '离线'}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {isWsConnected ? 'WebSocket 推送中' : 'HTTP 轮询模式'}
          </div>
        </div>
      </div>

      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-3">
        {/* 搜索 */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="搜索品种、信号名称、形态..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-600"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 筛选按钮 */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
            showFilters 
              ? 'bg-blue-600 text-white' 
              : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
          }`}
        >
          <Filter className="w-4 h-4" />
          筛选
          {(filters.direction !== 'all' || filters.minStrength > 0 || filters.symbols.length > 0 || filters.onlyUnread || filters.onlyFavorites) && (
            <span className="w-2 h-2 bg-green-500 rounded-full" />
          )}
        </button>

        {/* 声音开关 */}
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
            soundEnabled
              ? 'bg-green-600/20 text-green-400 border border-green-600/50'
              : 'bg-slate-900 text-slate-400 border border-slate-800'
          }`}
        >
          {soundEnabled ? '🔔' : '🔕'}
        </button>

        {/* 刷新 */}
        <button
          onClick={fetchSignals}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-700 text-white text-sm rounded-lg transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          刷新
        </button>

        {/* 全部已读 */}
        {stats.unread > 0 && (
          <button
            onClick={markAllAsRead}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 text-sm rounded-lg transition-colors border border-slate-800"
          >
            <Check className="w-4 h-4" />
            全部已读
          </button>
        )}

        {/* 清空 */}
        {signals.length > 0 && (
          <button
            onClick={clearAll}
            className="flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            清空
          </button>
        )}
      </div>

      {/* 高级筛选面板 */}
      {showFilters && (
        <div className="bg-slate-900 rounded-xl p-4 border border-slate-800 space-y-4">
          {/* 方向筛选 */}
          <div>
            <label className="text-sm text-slate-400 mb-2 block">方向</label>
            <div className="flex gap-2">
              {(['all', 'BUY', 'SELL', 'ALERT'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setFilters(prev => ({ ...prev, direction: d }))}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    filters.direction === d
                      ? d === 'BUY' ? 'bg-green-600 text-white'
                        : d === 'SELL' ? 'bg-red-600 text-white'
                        : 'bg-yellow-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {d === 'all' ? '全部' : d === 'BUY' ? '买入' : d === 'SELL' ? '卖出' : '提醒'}
                </button>
              ))}
            </div>
          </div>

          {/* 强度筛选 */}
          <div>
            <label className="text-sm text-slate-400 mb-2 block">
              最小强度: {filters.minStrength}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={filters.minStrength}
              onChange={(e) => setFilters(prev => ({ ...prev, minStrength: parseInt(e.target.value) }))}
              className="w-full max-w-xs"
            />
          </div>

          {/* 品种筛选 */}
          {allSymbols.length > 0 && (
            <div>
              <label className="text-sm text-slate-400 mb-2 block">品种</label>
              <div className="flex flex-wrap gap-2">
                {allSymbols.map(symbol => (
                  <button
                    key={symbol}
                    onClick={() => setFilters(prev => ({
                      ...prev,
                      symbols: prev.symbols.includes(symbol)
                        ? prev.symbols.filter(s => s !== symbol)
                        : [...prev.symbols, symbol]
                    }))}
                    className={`px-2 py-1 rounded text-xs transition-colors ${
                      filters.symbols.includes(symbol)
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    {symbol}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 选项 */}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.onlyUnread}
                onChange={(e) => setFilters(prev => ({ ...prev, onlyUnread: e.target.checked }))}
                className="rounded border-slate-700"
              />
              仅未读
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.onlyFavorites}
                onChange={(e) => setFilters(prev => ({ ...prev, onlyFavorites: e.target.checked }))}
                className="rounded border-slate-700"
              />
              仅收藏
            </label>
          </div>

          {/* 清除筛选 */}
          <button
            onClick={() => setFilters({
              direction: 'all',
              minStrength: 0,
              symbols: [],
              timeframes: [],
              onlyUnread: false,
              onlyFavorites: false,
            })}
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            清除所有筛选
          </button>
        </div>
      )}

      {/* 主内容区 */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* 信号列表 */}
        <div className="flex-1 bg-slate-900 rounded-xl border border-slate-800 overflow-hidden flex flex-col">
          <div className="p-3 border-b border-slate-800 flex items-center justify-between">
            <span className="text-sm font-medium text-white">
              信号列表 ({filteredSignals.length})
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setFilters(prev => ({ ...prev, onlyUnread: !prev.onlyUnread }))}
                className={`text-xs px-2 py-1 rounded ${filters.onlyUnread ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-400'}`}
              >
                未读
              </button>
              <button
                onClick={() => setFilters(prev => ({ ...prev, onlyFavorites: !prev.onlyFavorites }))}
                className={`text-xs px-2 py-1 rounded ${filters.onlyFavorites ? 'bg-yellow-600 text-white' : 'bg-slate-800 text-slate-400'}`}
              >
                收藏
              </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto p-3 space-y-2">
            {filteredSignals.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500">
                <Bell className="w-12 h-12 mb-4 opacity-30" />
                <p>暂无信号</p>
                <p className="text-sm mt-1">调整筛选条件或等待新信号</p>
              </div>
            ) : (
              filteredSignals.map((signal) => {
                const config = getDirectionConfig(signal.direction);
                const Icon = config.icon;
                
                return (
                  <div
                    key={signal.id}
                    onClick={() => setSelectedSignal(signal)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedSignal?.id === signal.id
                        ? 'bg-blue-900/30 border-blue-600'
                        : signal.read
                        ? 'bg-slate-900 border-slate-800 opacity-60'
                        : `${config.bg} ${config.border}`
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {/* 方向图标 */}
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${config.bg}`}>
                          <Icon className={`w-4 h-4 ${config.text}`} />
                        </div>
                        
                        {/* 信息 */}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white">{signal.symbol}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded ${config.bg} ${config.text}`}>
                              {signal.direction === 'BUY' ? '买入' : signal.direction === 'SELL' ? '卖出' : '提醒'}
                            </span>
                            {!signal.read && (
                              <span className="w-2 h-2 bg-green-500 rounded-full" />
                            )}
                          </div>
                          <div className="text-sm text-slate-400">
                            {signal.signal_name}
                            {signal.pattern && ` · ${signal.pattern}`}
                          </div>
                        </div>
                      </div>
                      
                      {/* 右侧 */}
                      <div className="text-right">
                        <div className="flex items-center gap-2">
                          {/* 强度 */}
                          <div className={`text-sm font-bold ${
                            signal.strength >= 70 ? 'text-green-400' :
                            signal.strength >= 40 ? 'text-yellow-400' :
                            'text-slate-400'
                          }`}>
                            {signal.strength}%
                          </div>
                          
                          {/* 收藏按钮 */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavorite(signal.id);
                            }}
                            className={`p-1 rounded ${signal.favorite ? 'text-yellow-400' : 'text-slate-600 hover:text-slate-400'}`}
                          >
                            <Star className={`w-4 h-4 ${signal.favorite ? 'fill-current' : ''}`} />
                          </button>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          {formatDate(signal.timestamp)} {formatTime(signal.timestamp)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 详情面板 */}
        {selectedSignal && (
          <div className="w-80 bg-slate-900 rounded-xl border border-slate-800 p-4 overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white">信号详情</h3>
              <button
                onClick={() => setSelectedSignal(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {(() => {
              const config = getDirectionConfig(selectedSignal.direction);
              const Icon = config.icon;
              
              return (
                <div className="space-y-4">
                  {/* 基本信息 */}
                  <div className={`p-4 rounded-lg ${config.bg} ${config.border} border`}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${config.bg}`}>
                        <Icon className={`w-6 h-6 ${config.text}`} />
                      </div>
                      <div>
                        <div className="text-xl font-bold text-white">{selectedSignal.symbol}</div>
                        <div className={`text-sm ${config.text}`}>
                          {selectedSignal.direction === 'BUY' ? '买入信号' : selectedSignal.direction === 'SELL' ? '卖出信号' : '提醒'}
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-lg font-medium text-white">
                      {selectedSignal.signal_name}
                    </div>
                    {selectedSignal.pattern && (
                      <div className="text-sm text-slate-400 mt-1">
                        形态: {selectedSignal.pattern}
                      </div>
                    )}
                  </div>
                  
                  {/* 强度 */}
                  <div className="bg-slate-800 rounded-lg p-3">
                    <div className="text-sm text-slate-400 mb-2">信号强度</div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-slate-700 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full transition-all ${
                            selectedSignal.strength >= 70 ? 'bg-green-500' :
                            selectedSignal.strength >= 40 ? 'bg-yellow-500' :
                            'bg-slate-500'
                          }`}
                          style={{ width: `${selectedSignal.strength}%` }}
                        />
                      </div>
                      <span className={`font-bold ${
                        selectedSignal.strength >= 70 ? 'text-green-400' :
                        selectedSignal.strength >= 40 ? 'text-yellow-400' :
                        'text-slate-400'
                      }`}>
                        {selectedSignal.strength}%
                      </span>
                    </div>
                  </div>
                  
                  {/* 信息网格 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-800 rounded-lg p-3">
                      <div className="text-xs text-slate-500">周期</div>
                      <div className="text-white font-medium">{selectedSignal.timeframe}</div>
                    </div>
                    <div className="bg-slate-800 rounded-lg p-3">
                      <div className="text-xs text-slate-500">时间</div>
                      <div className="text-white font-medium text-sm">
                        {formatDate(selectedSignal.timestamp)}
                        <br />
                        {formatTime(selectedSignal.timestamp)}
                      </div>
                    </div>
                  </div>
                  
                  {/* 描述 */}
                  {selectedSignal.message && (
                    <div className="bg-slate-800 rounded-lg p-3">
                      <div className="text-sm text-slate-400 mb-1">描述</div>
                      <div className="text-white text-sm">{selectedSignal.message}</div>
                    </div>
                  )}
                  
                  {/* 操作按钮 */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => markAsRead(selectedSignal.id)}
                      disabled={selectedSignal.read}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
                    >
                      <Check className="w-4 h-4" />
                      {selectedSignal.read ? '已读' : '标记已读'}
                    </button>
                    <button
                      onClick={() => toggleFavorite(selectedSignal.id)}
                      className={`flex items-center justify-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors ${
                        selectedSignal.favorite
                          ? 'bg-yellow-600/20 text-yellow-400'
                          : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      <Star className={`w-4 h-4 ${selectedSignal.favorite ? 'fill-current' : ''}`} />
                    </button>
                    <button
                      onClick={() => deleteSignal(selectedSignal.id)}
                      className="flex items-center justify-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* 底部 */}
      {lastUpdate && (
        <div className="text-xs text-slate-500 text-center">
          上次更新: {lastUpdate.toLocaleTimeString('zh-CN')}
          {isWsConnected && ' · WebSocket 实时推送中'}
        </div>
      )}
    </div>
  );
}
