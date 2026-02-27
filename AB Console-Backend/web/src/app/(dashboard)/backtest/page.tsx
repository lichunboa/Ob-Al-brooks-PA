'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FlaskConical, Play, Loader2, CheckCircle2, XCircle, Clock,
  TrendingUp, TrendingDown, BarChart3, Trash2, RefreshCw,
  ChevronDown, ChevronUp, FolderOpen, Grid3X3, Zap,
  FileJson, Calendar, Database, ArrowUpDown, Download,
  Eye, AlertCircle, Search, BookOpenCheck,
} from 'lucide-react';
import { config } from '@/lib/config';
import { TrainingTab } from '@/components/backtest/TrainingTab';

/* ============================================================
 * 类型定义
 * ============================================================ */

// 回测配置
interface BacktestConfig {
  symbols: string[];
  timeframes: string[];
  days: number;
  threshold: number;
  max_holding_bars: number;
  fee_rate: number;
}

// 在线 Job
interface JobSummary {
  job_id: string;
  config: BacktestConfig;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  created_at: string;
  completed_at: string | null;
  error?: string;
  result_summary?: {
    total_trades: number;
    win_rate: number;
    total_pnl: number;
  };
}

interface JobDetail extends JobSummary {
  result?: {
    symbol: string;
    summary: {
      total_trades: number;
      wins: number;
      losses: number;
      win_rate: number;
      total_pnl: number;
      avg_win: number;
      avg_loss: number;
      best_trade: number;
      worst_trade: number;
      max_drawdown: number;
      profit_factor: number;
    };
    signals: {
      generated: number;
      passed: number;
      blocked_bg: number;
      blocked_score: number;
      blocked_rr: number;
    };
    by_strategy: Record<string, { trades: number; wins: number; pnl: number }>;
    by_background: Record<string, { trades: number; wins: number; pnl: number }>;
    by_direction: Record<string, { trades: number; wins: number; pnl: number }>;
    by_exit_reason: Record<string, { trades: number; wins: number; pnl: number }>;
    trades: Array<{
      symbol: string; direction: string; strategy: string;
      entry_price: number; exit_price: number; pnl_pct: number;
      result: string; score: number; background: string;
      exit_reason: string; bars_held: number;
      entry_time: string; exit_time: string;
    }>;
  };
}

// 历史文件格式 (从 data/backtest_results/ 读取)
interface FileEntry {
  key: string;
  total: number;
  win_rate: number;
  total_pnl: number;
  compound_return_pct: number;
  timeframe: string;
}

interface ResultFile {
  name: string;
  size: number;
  modified: string;
  entries_count?: number;
  entries?: FileEntry[];
}

// 历史结果中的单条记录 (JSON 文件中的一个 key 对应的对象)
interface HistoricalResult {
  total: number;
  wins: number;
  losses: number;
  win_rate: number;
  total_pnl: number;
  avg_win: number;
  avg_loss: number;
  avg_win_net?: number;
  avg_loss_net?: number;
  best_trade: number;
  worst_trade: number;
  scalp_wins?: number;
  tp_wins?: number;
  timeout_wins?: number;
  stall_exits?: number;
  by_strategy: Record<string, { trades: number; wins: number; pnl: number }>;
  by_background: Record<string, { trades: number; wins: number; pnl: number }>;
  by_direction: Record<string, { trades: number; wins: number; pnl: number }>;
  fee_rate?: number;
  initial_capital?: number;
  final_capital?: number;
  compound_return_pct?: number;
  max_drawdown_usd?: number;
  max_drawdown_pct?: number;
  risk_pct?: number;
  timeframe?: string;
  signals_generated?: number;
  signals_passed?: number;
  signals_blocked_bg?: number;
  signals_blocked_score?: number;
  signals_blocked_rr?: number;
  signals_blocked_counter_trend?: number;
  signals_blocked_position?: number;
  signals_blocked_q3?: number;
  signals_blocked_market?: number;
  threshold?: number;
  sell_only?: boolean;
  q3_filter?: boolean;
  market_state?: boolean;
  trades_detail?: Array<Record<string, unknown>>;
}

/* ============================================================
 * 常量
 * ============================================================ */

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'DOGEUSDT', 'AAVEUSDT', 'ADAUSDT', 'AVAXUSDT'];
const TIMEFRAMES = ['5m', '15m', '30m', '1h'];

type TabId = 'training' | 'run' | 'history' | 'matrix';

const TABS: { id: TabId; label: string; icon: React.ReactNode; legacy?: boolean }[] = [
  { id: 'training', label: '读盘训练', icon: <BookOpenCheck className="w-3.5 h-3.5" /> },
  { id: 'run', label: '运行回测', icon: <Play className="w-3.5 h-3.5" />, legacy: true },
  { id: 'history', label: '历史结果', icon: <FolderOpen className="w-3.5 h-3.5" />, legacy: true },
  { id: 'matrix', label: '矩阵对比', icon: <Grid3X3 className="w-3.5 h-3.5" />, legacy: true },
];

/* ============================================================
 * 主页面
 * ============================================================ */

export default function BacktestPage() {
  const [activeTab, setActiveTab] = useState<TabId>('training');
  const [isConnected, setIsConnected] = useState(false);

  const apiUrl = config.backtestApiUrl;

  // 健康检查
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${apiUrl}/health`);
        setIsConnected(res.ok);
      } catch {
        setIsConnected(false);
      }
    };
    check();
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, [apiUrl]);

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FlaskConical className="w-6 h-6 text-purple-400" />
          <h1 className="text-xl font-bold text-white">回测分析</h1>
          <span className="text-xs text-slate-500">Real PA Engine</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-xs text-slate-400">
            {isConnected ? '回测服务在线' : '回测服务离线'}
          </span>
        </div>
      </div>

      {/* Tab 栏 */}
      <div className="flex items-center gap-1 bg-slate-900 rounded-lg p-1 border border-slate-800">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-purple-600 text-white'
                : tab.legacy
                  ? 'text-slate-600 hover:text-slate-400 hover:bg-slate-800/50'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 内容 */}
      {activeTab === 'run' && (
        <RunBacktestTab apiUrl={apiUrl} isConnected={isConnected} />
      )}
      {activeTab === 'history' && (
        <HistoryTab />
      )}
      {activeTab === 'matrix' && (
        <MatrixTab />
      )}
      {activeTab === 'training' && (
        <TrainingTab />
      )}
    </div>
  );
}

/* ============================================================
 * Tab 1: 运行回测 (保留原有功能)
 * ============================================================ */

function RunBacktestTab({ apiUrl, isConnected }: { apiUrl: string; isConnected: boolean }) {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showConfig, setShowConfig] = useState(true);
  const [runMode, setRunMode] = useState<'single' | 'matrix'>('single');

  // 配置表单
  const [formConfig, setFormConfig] = useState<BacktestConfig>({
    symbols: ['BTCUSDT'],
    timeframes: ['1h'],
    days: 30,
    threshold: 80,
    max_holding_bars: 48,
    fee_rate: 0.0004,
  });

  // 加载任务列表
  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/jobs`);
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
      }
    } catch { /* ignore */ }
  }, [apiUrl]);

  useEffect(() => {
    if (isConnected) {
      loadJobs();
      const interval = setInterval(loadJobs, 5000);
      return () => clearInterval(interval);
    }
  }, [loadJobs, isConnected]);

  // 启动回测
  const handleRun = async () => {
    setIsLoading(true);
    try {
      const endpoint = runMode === 'matrix' ? `${apiUrl}/matrix` : `${apiUrl}/run`;
      const body = runMode === 'matrix'
        ? {
            symbols: formConfig.symbols,
            timeframes: formConfig.timeframes,
            days: formConfig.days,
            threshold: formConfig.threshold,
            fee: formConfig.fee_rate * 100 * 2, // round-trip
          }
        : formConfig;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setShowConfig(false);
        loadJobs();
      } else {
        const err = await res.json();
        alert(err.error || '启动失败');
      }
    } catch {
      alert('无法连接回测服务');
    } finally {
      setIsLoading(false);
    }
  };

  // 查看任务详情
  const handleViewJob = async (jobId: string) => {
    try {
      const res = await fetch(`${apiUrl}/jobs/${jobId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedJob(data);
      }
    } catch { /* ignore */ }
  };

  // 删除任务
  const handleDeleteJob = async (jobId: string) => {
    try {
      await fetch(`${apiUrl}/jobs/${jobId}`, { method: 'DELETE' });
      loadJobs();
      if (selectedJob?.job_id === jobId) setSelectedJob(null);
    } catch { /* ignore */ }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* 左栏: 配置 + 历史 */}
      <div className="space-y-4">
        {/* 配置面板 */}
        <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="flex items-center justify-between w-full text-sm font-medium text-white"
          >
            <span>回测配置</span>
            {showConfig ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showConfig && (
            <div className="mt-4 space-y-3">
              {/* 模式切换 */}
              <div>
                <label className="text-xs text-slate-400 block mb-1">回测模式</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setRunMode('single')}
                    className={`flex-1 px-2 py-1.5 text-xs rounded flex items-center justify-center gap-1 ${
                      runMode === 'single' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    <Zap className="w-3 h-3" />
                    单品种回测
                  </button>
                  <button
                    onClick={() => setRunMode('matrix')}
                    className={`flex-1 px-2 py-1.5 text-xs rounded flex items-center justify-center gap-1 ${
                      runMode === 'matrix' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    <Grid3X3 className="w-3 h-3" />
                    矩阵回测
                  </button>
                </div>
              </div>

              {/* 币种 */}
              <div>
                <label className="text-xs text-slate-400 block mb-1">币种</label>
                <div className="flex flex-wrap gap-2">
                  {SYMBOLS.map(s => (
                    <button
                      key={s}
                      onClick={() => {
                        if (runMode === 'single') {
                          setFormConfig({ ...formConfig, symbols: [s] });
                        } else {
                          const syms = formConfig.symbols.includes(s)
                            ? formConfig.symbols.filter(x => x !== s)
                            : [...formConfig.symbols, s];
                          setFormConfig({ ...formConfig, symbols: syms.length ? syms : [s] });
                        }
                      }}
                      className={`px-2 py-1 text-xs rounded ${
                        formConfig.symbols.includes(s)
                          ? 'bg-purple-600 text-white'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {s.replace('USDT', '')}
                    </button>
                  ))}
                </div>
              </div>

              {/* 周期 */}
              <div>
                <label className="text-xs text-slate-400 block mb-1">检测周期</label>
                <div className="flex gap-2">
                  {TIMEFRAMES.map(tf => (
                    <button
                      key={tf}
                      onClick={() => {
                        if (runMode === 'single') {
                          setFormConfig({ ...formConfig, timeframes: [tf] });
                        } else {
                          const tfs = formConfig.timeframes.includes(tf)
                            ? formConfig.timeframes.filter(x => x !== tf)
                            : [...formConfig.timeframes, tf];
                          setFormConfig({ ...formConfig, timeframes: tfs.length ? tfs : [tf] });
                        }
                      }}
                      className={`px-2 py-1 text-xs rounded ${
                        formConfig.timeframes.includes(tf)
                          ? 'bg-purple-600 text-white'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>

              {/* 天数 */}
              <div>
                <label className="text-xs text-slate-400 block mb-1">回测天数</label>
                <div className="flex gap-2">
                  {[7, 14, 30, 60, 90, 180, 365].map(d => (
                    <button
                      key={d}
                      onClick={() => setFormConfig({ ...formConfig, days: d })}
                      className={`px-2 py-1 text-xs rounded ${
                        formConfig.days === d ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {d}天
                    </button>
                  ))}
                </div>
              </div>

              {/* 阈值 */}
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  评分阈值: {formConfig.threshold}
                </label>
                <input
                  type="range"
                  min={60}
                  max={95}
                  step={5}
                  value={formConfig.threshold}
                  onChange={e => setFormConfig({ ...formConfig, threshold: parseInt(e.target.value) })}
                  className="w-full accent-purple-500"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>60 宽松</span>
                  <span>80 标准</span>
                  <span>95 严格</span>
                </div>
              </div>

              {/* 运行按钮 */}
              <button
                onClick={handleRun}
                disabled={isLoading || !isConnected}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {isLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> 提交中...</>
                ) : (
                  <><Play className="w-4 h-4" /> {runMode === 'matrix' ? '开始矩阵回测' : '开始回测'}</>
                )}
              </button>

              {!isConnected && (
                <p className="text-[10px] text-yellow-500 text-center">
                  回测服务离线 -- 请先启动服务后再运行
                </p>
              )}
            </div>
          )}
        </div>

        {/* 历史任务 */}
        <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-white">在线任务</h3>
            <button onClick={loadJobs} className="p-1 rounded text-slate-400 hover:bg-slate-800">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {jobs.length === 0 ? (
              <p className="text-xs text-slate-500">
                {isConnected ? '暂无回测记录' : '回测服务离线'}
              </p>
            ) : (
              jobs.map(job => (
                <div
                  key={job.job_id}
                  onClick={() => handleViewJob(job.job_id)}
                  className={`p-3 rounded-lg cursor-pointer border transition-colors ${
                    selectedJob?.job_id === job.job_id
                      ? 'border-purple-500 bg-purple-900/20'
                      : 'border-slate-800 hover:border-slate-700 bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusIcon status={job.status} />
                      <span className="text-xs text-white">
                        {job.config.symbols?.join(', ')}
                      </span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteJob(job.job_id); }}
                      className="p-1 text-slate-500 hover:text-red-400"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
                    <span>{job.config.days}天</span>
                    <span>阈值{job.config.threshold}</span>
                    <span>{formatTime(job.created_at)}</span>
                  </div>
                  {job.result_summary && job.status === 'completed' && (
                    <div className="mt-1 flex items-center gap-3 text-[10px]">
                      <span className="text-slate-400">{job.result_summary.total_trades}笔</span>
                      <span className="text-slate-400">胜率{job.result_summary.win_rate?.toFixed(1)}%</span>
                      <span className={job.result_summary.total_pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {job.result_summary.total_pnl >= 0 ? '+' : ''}{job.result_summary.total_pnl?.toFixed(2)}%
                      </span>
                    </div>
                  )}
                  {job.status === 'failed' && (
                    <p className="mt-1 text-[10px] text-red-400 truncate">{job.error}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 右栏: 结果展示 */}
      <div className="lg:col-span-2">
        {selectedJob?.result ? (
          <ResultPanel result={selectedJob.result} config={selectedJob.config} />
        ) : selectedJob?.status === 'running' ? (
          <div className="bg-slate-900 rounded-lg border border-slate-800 p-8 flex flex-col items-center justify-center min-h-[400px]">
            <Loader2 className="w-10 h-10 text-purple-400 animate-spin mb-4" />
            <p className="text-white">回测运行中...</p>
            <p className="text-xs text-slate-500 mt-1">
              {selectedJob.config.symbols?.join(', ')} | {selectedJob.config.days}天
            </p>
          </div>
        ) : selectedJob?.status === 'failed' ? (
          <div className="bg-slate-900 rounded-lg border border-red-800/50 p-8 flex flex-col items-center justify-center min-h-[400px]">
            <XCircle className="w-10 h-10 text-red-400 mb-4" />
            <p className="text-white">回测失败</p>
            <p className="text-xs text-red-400 mt-2">{selectedJob.error}</p>
          </div>
        ) : (
          <div className="bg-slate-900 rounded-lg border border-slate-800 p-8 flex flex-col items-center justify-center min-h-[400px]">
            <FlaskConical className="w-10 h-10 text-slate-600 mb-4" />
            <p className="text-slate-400">配置参数后点击「开始回测」</p>
            <p className="text-xs text-slate-600 mt-1">使用真实 PA 引擎跑历史数据</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
 * Tab 2: 历史结果 (离线可用)
 * ============================================================ */

function HistoryTab() {
  const [files, setFiles] = useState<ResultFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedData, setSelectedData] = useState<Record<string, HistoricalResult> | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'modified' | 'name' | 'pnl'>('modified');

  // 加载文件列表
  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/backtest-results');
      if (!res.ok) throw new Error('加载失败');
      const data = await res.json();
      setFiles(data.files || []);
    } catch (e) {
      setError('无法加载历史结果目录');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  // 加载单个文件详情
  const loadFileDetail = useCallback(async (fileName: string) => {
    if (selectedFile === fileName && selectedData) {
      // 切换关闭
      setSelectedFile(null);
      setSelectedData(null);
      setSelectedEntry(null);
      return;
    }
    setLoadingDetail(true);
    setSelectedEntry(null);
    try {
      const res = await fetch(`/api/backtest-results?file=${encodeURIComponent(fileName)}`);
      if (!res.ok) throw new Error('加载失败');
      const json = await res.json();
      setSelectedFile(fileName);
      setSelectedData(json.data);
      // 自动选中第一个 entry
      const keys = Object.keys(json.data || {});
      if (keys.length > 0) setSelectedEntry(keys[0]);
    } catch {
      setError(`加载文件失败: ${fileName}`);
    } finally {
      setLoadingDetail(false);
    }
  }, [selectedFile, selectedData]);

  // 过滤和排序
  const filteredFiles = useMemo(() => {
    let result = files;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(f => f.name.toLowerCase().includes(term));
    }
    if (sortBy === 'name') {
      result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'pnl') {
      result = [...result].sort((a, b) => {
        const aPnl = a.entries?.[0]?.compound_return_pct ?? 0;
        const bPnl = b.entries?.[0]?.compound_return_pct ?? 0;
        return bPnl - aPnl;
      });
    }
    // 'modified' is already the default sort from API
    return result;
  }, [files, searchTerm, sortBy]);

  // 按 symbol 分组统计
  const symbolGroups = useMemo(() => {
    const groups: Record<string, number> = {};
    files.forEach(f => {
      const match = f.name.match(/^(?:v\d+\w*_)?(\w+?)_/i);
      if (match) {
        const sym = match[1].toUpperCase();
        groups[sym] = (groups[sym] || 0) + 1;
      }
    });
    return groups;
  }, [files]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
      </div>
    );
  }

  if (error && files.length === 0) {
    return (
      <div className="bg-slate-900 rounded-lg border border-red-800/50 p-8 flex flex-col items-center justify-center min-h-[300px]">
        <AlertCircle className="w-8 h-8 text-red-400 mb-3" />
        <p className="text-white">{error}</p>
        <button
          onClick={loadFiles}
          className="mt-3 px-3 py-1.5 text-xs bg-slate-800 text-slate-300 rounded hover:bg-slate-700"
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* 左栏: 文件列表 */}
      <div className="space-y-3">
        {/* 搜索 + 排序 */}
        <div className="bg-slate-900 rounded-lg border border-slate-800 p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex-1 relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="搜索文件..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-7 pr-2 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
              />
            </div>
            <button
              onClick={loadFiles}
              className="p-1.5 rounded text-slate-400 hover:bg-slate-800"
              title="刷新"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-1 text-[10px]">
            <span className="text-slate-500">排序:</span>
            {(['modified', 'name', 'pnl'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`px-1.5 py-0.5 rounded ${
                  sortBy === s ? 'bg-purple-600/30 text-purple-400' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {s === 'modified' ? '时间' : s === 'name' ? '名称' : '收益'}
              </button>
            ))}
          </div>
        </div>

        {/* 品种统计 */}
        <div className="bg-slate-900 rounded-lg border border-slate-800 p-3">
          <h4 className="text-[10px] text-slate-500 uppercase mb-2">品种分布 ({files.length} 个文件)</h4>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(symbolGroups).sort((a, b) => b[1] - a[1]).map(([sym, count]) => (
              <button
                key={sym}
                onClick={() => setSearchTerm(sym.toLowerCase())}
                className="px-2 py-0.5 text-[10px] bg-slate-800 text-slate-400 rounded hover:bg-slate-700 hover:text-white transition-colors"
              >
                {sym} <span className="text-slate-600">({count})</span>
              </button>
            ))}
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="px-2 py-0.5 text-[10px] bg-red-900/30 text-red-400 rounded hover:bg-red-900/50"
              >
                清除筛选
              </button>
            )}
          </div>
        </div>

        {/* 文件列表 */}
        <div className="space-y-1.5 max-h-[calc(100vh-360px)] overflow-y-auto pr-1">
          {filteredFiles.map(file => {
            const isSelected = selectedFile === file.name;
            const bestEntry = file.entries?.[0];
            const pnl = bestEntry?.compound_return_pct ?? bestEntry?.total_pnl ?? 0;
            const isMultiTf = (file.entries_count ?? 0) > 1;

            return (
              <div
                key={file.name}
                onClick={() => loadFileDetail(file.name)}
                className={`p-2.5 rounded-lg cursor-pointer border transition-all ${
                  isSelected
                    ? 'border-purple-500 bg-purple-900/20'
                    : 'border-slate-800 hover:border-slate-700 bg-slate-900'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <FileJson className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                    <span className="text-xs text-white truncate" title={file.name}>
                      {file.name.replace('.json', '')}
                    </span>
                  </div>
                  {isMultiTf && (
                    <span className="text-[9px] px-1 py-0.5 bg-purple-900/40 text-purple-400 rounded flex-shrink-0">
                      多周期
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2 text-[10px]">
                  {bestEntry && (
                    <>
                      <span className="text-slate-500">{bestEntry.total}笔</span>
                      <span className="text-slate-400">胜率{bestEntry.win_rate.toFixed(1)}%</span>
                      <span className={pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {pnl >= 0 ? '+' : ''}{pnl.toFixed(1)}%
                      </span>
                    </>
                  )}
                  <span className="text-slate-600 ml-auto">
                    {formatFileSize(file.size)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 右栏: 详情展示 */}
      <div className="lg:col-span-2">
        {loadingDetail ? (
          <div className="bg-slate-900 rounded-lg border border-slate-800 p-8 flex items-center justify-center min-h-[400px]">
            <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
          </div>
        ) : selectedData && selectedFile ? (
          <HistoricalDetailPanel
            fileName={selectedFile}
            data={selectedData}
            selectedEntry={selectedEntry}
            onSelectEntry={setSelectedEntry}
          />
        ) : (
          <div className="bg-slate-900 rounded-lg border border-slate-800 p-8 flex flex-col items-center justify-center min-h-[400px]">
            <Database className="w-10 h-10 text-slate-600 mb-4" />
            <p className="text-slate-400">选择一个历史结果文件查看详情</p>
            <p className="text-xs text-slate-600 mt-1">
              共 {files.length} 个结果文件 -- 无需回测服务在线
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
 * 历史结果详情面板
 * ============================================================ */

function HistoricalDetailPanel({
  fileName,
  data,
  selectedEntry,
  onSelectEntry,
}: {
  fileName: string;
  data: Record<string, HistoricalResult>;
  selectedEntry: string | null;
  onSelectEntry: (key: string) => void;
}) {
  const entries = Object.keys(data);
  const current = selectedEntry ? data[selectedEntry] : null;

  if (!current) {
    return (
      <div className="bg-slate-900 rounded-lg border border-slate-800 p-6 text-center text-slate-500">
        无有效数据
      </div>
    );
  }

  // 计算 profit factor
  const totalWinPnl = Object.values(current.by_direction || {}).reduce(
    (sum, d) => sum + Math.max(0, d.pnl), 0
  );
  const totalLossPnl = Math.abs(
    Object.values(current.by_direction || {}).reduce(
      (sum, d) => sum + Math.min(0, d.pnl), 0
    )
  );
  const profitFactor = totalLossPnl > 0 ? totalWinPnl / totalLossPnl : (totalWinPnl > 0 ? Infinity : 0);

  return (
    <div className="space-y-4">
      {/* 文件标题 + 条目切换 */}
      <div className="bg-slate-900 rounded-lg border border-slate-800 p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-white truncate">
            {fileName.replace('.json', '')}
          </h3>
          <span className="text-[10px] text-slate-500">
            {entries.length} 个条目
          </span>
        </div>
        {entries.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {entries.map(key => {
              const e = data[key];
              const pnl = e.compound_return_pct ?? e.total_pnl ?? 0;
              return (
                <button
                  key={key}
                  onClick={() => onSelectEntry(key)}
                  className={`px-2 py-1 text-[10px] rounded border transition-colors ${
                    selectedEntry === key
                      ? 'border-purple-500 bg-purple-900/30 text-purple-300'
                      : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  {key}
                  <span className={`ml-1 ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {pnl >= 0 ? '+' : ''}{pnl.toFixed(1)}%
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 概要卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="总交易" value={current.total.toString()} />
        <StatCard
          label="胜率"
          value={`${current.win_rate.toFixed(1)}%`}
          color={current.win_rate >= 50 ? 'green' : 'red'}
        />
        <StatCard
          label="复利收益"
          value={`${(current.compound_return_pct ?? current.total_pnl ?? 0) >= 0 ? '+' : ''}${(current.compound_return_pct ?? current.total_pnl ?? 0).toFixed(1)}%`}
          color={(current.compound_return_pct ?? current.total_pnl ?? 0) >= 0 ? 'green' : 'red'}
        />
        <StatCard
          label="盈亏因子"
          value={profitFactor === Infinity ? '---' : profitFactor.toFixed(2)}
          color={profitFactor >= 1.5 ? 'green' : profitFactor >= 1 ? 'yellow' : 'red'}
        />
      </div>

      {/* 资金曲线信息 */}
      {current.initial_capital !== undefined && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="初始资金"
            value={`$${current.initial_capital?.toFixed(0)}`}
          />
          <StatCard
            label="最终资金"
            value={`$${current.final_capital?.toFixed(0)}`}
            color={(current.final_capital ?? 0) > (current.initial_capital ?? 0) ? 'green' : 'red'}
          />
          <StatCard
            label="最大回撤"
            value={`${current.max_drawdown_pct?.toFixed(1)}%`}
            color="red"
          />
          <StatCard
            label="阈值"
            value={`${current.threshold ?? '?'}`}
          />
        </div>
      )}

      {/* 详细统计 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 信号漏斗 */}
        {current.signals_generated !== undefined && current.signals_generated > 0 && (
          <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
            <h3 className="text-sm font-medium text-white mb-3">信号漏斗</h3>
            <div className="space-y-2">
              <FunnelRow label="信号生成" value={current.signals_generated} total={current.signals_generated} />
              <FunnelRow label="评分拦截" value={current.signals_blocked_score ?? 0} total={current.signals_generated} negative />
              <FunnelRow label="背景拦截" value={current.signals_blocked_bg ?? 0} total={current.signals_generated} negative />
              <FunnelRow label="盈亏比拦截" value={current.signals_blocked_rr ?? 0} total={current.signals_generated} negative />
              {(current.signals_blocked_counter_trend ?? 0) > 0 && (
                <FunnelRow label="逆势拦截" value={current.signals_blocked_counter_trend ?? 0} total={current.signals_generated} negative />
              )}
              {(current.signals_blocked_position ?? 0) > 0 && (
                <FunnelRow label="持仓拦截" value={current.signals_blocked_position ?? 0} total={current.signals_generated} negative />
              )}
              <FunnelRow label="最终通过" value={current.signals_passed ?? 0} total={current.signals_generated} highlight />
            </div>
          </div>
        )}

        {/* 交易统计 */}
        <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
          <h3 className="text-sm font-medium text-white mb-3">交易统计</h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="text-slate-400">胜/负</div>
            <div className="text-white">{current.wins} / {current.losses}</div>
            <div className="text-slate-400">平均盈利</div>
            <div className="text-green-400">+{(current.avg_win_net ?? current.avg_win).toFixed(3)}%</div>
            <div className="text-slate-400">平均亏损</div>
            <div className="text-red-400">{(current.avg_loss_net ?? current.avg_loss).toFixed(3)}%</div>
            <div className="text-slate-400">最佳交易</div>
            <div className="text-green-400">+{current.best_trade.toFixed(2)}%</div>
            <div className="text-slate-400">最差交易</div>
            <div className="text-red-400">{current.worst_trade.toFixed(2)}%</div>
            {current.max_drawdown_pct !== undefined && (
              <>
                <div className="text-slate-400">最大回撤</div>
                <div className="text-red-400">{current.max_drawdown_pct.toFixed(2)}%</div>
              </>
            )}
            {current.scalp_wins !== undefined && (
              <>
                <div className="text-slate-400">剥头皮胜</div>
                <div className="text-white">{current.scalp_wins}</div>
              </>
            )}
            {current.tp_wins !== undefined && (
              <>
                <div className="text-slate-400">止盈胜</div>
                <div className="text-white">{current.tp_wins}</div>
              </>
            )}
            {current.timeout_wins !== undefined && (
              <>
                <div className="text-slate-400">超时胜</div>
                <div className="text-white">{current.timeout_wins}</div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 按维度分析 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GroupTable title="按策略" data={current.by_strategy} />
        <GroupTable title="按背景" data={current.by_background} />
        <GroupTable title="按方向" data={current.by_direction} />
      </div>
    </div>
  );
}

/* ============================================================
 * Tab 3: 矩阵对比
 * ============================================================ */

function MatrixTab() {
  const [files, setFiles] = useState<ResultFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [matrixData, setMatrixData] = useState<Record<string, Record<string, HistoricalResult>>>({});
  const [loadingMatrix, setLoadingMatrix] = useState(false);
  const [metricKey, setMetricKey] = useState<'compound_return_pct' | 'win_rate' | 'total' | 'max_drawdown_pct'>('compound_return_pct');

  // 加载文件列表
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/backtest-results');
        if (res.ok) {
          const data = await res.json();
          setFiles(data.files || []);
          // 默认选择多周期文件
          const multiTf = (data.files || [])
            .filter((f: ResultFile) => (f.entries_count ?? 0) > 1)
            .slice(0, 6)
            .map((f: ResultFile) => f.name);
          if (multiTf.length > 0) setSelectedFiles(multiTf);
        }
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  // 加载选中文件的数据
  const loadMatrixData = useCallback(async () => {
    if (selectedFiles.length === 0) return;
    setLoadingMatrix(true);
    const newData: Record<string, Record<string, HistoricalResult>> = {};

    for (const fileName of selectedFiles) {
      try {
        const res = await fetch(`/api/backtest-results?file=${encodeURIComponent(fileName)}`);
        if (res.ok) {
          const json = await res.json();
          newData[fileName] = json.data;
        }
      } catch { /* ignore */ }
    }

    setMatrixData(newData);
    setLoadingMatrix(false);
  }, [selectedFiles]);

  useEffect(() => { loadMatrixData(); }, [loadMatrixData]);

  // 提取所有唯一的 symbol 和 timeframe
  const { allSymbols, allTimeframes } = useMemo(() => {
    const symbols = new Set<string>();
    const timeframes = new Set<string>();

    Object.values(matrixData).forEach(fileData => {
      Object.entries(fileData).forEach(([key, val]) => {
        // key 格式: "BTCUSDT_5m" 或 "BTCUSDT"
        const parts = key.split('_');
        if (parts.length >= 2) {
          // 最后一段可能是 timeframe
          const lastPart = parts[parts.length - 1];
          if (['5m', '15m', '30m', '1h', '4h', '1d'].includes(lastPart)) {
            symbols.add(parts.slice(0, -1).join('_'));
            timeframes.add(lastPart);
          } else {
            symbols.add(key);
            if (val.timeframe) timeframes.add(val.timeframe);
          }
        } else {
          symbols.add(key);
          if (val.timeframe) timeframes.add(val.timeframe);
        }
      });
    });

    return {
      allSymbols: Array.from(symbols).sort(),
      allTimeframes: Array.from(timeframes).sort((a, b) => {
        const order = ['5m', '15m', '30m', '1h', '4h', '1d'];
        return order.indexOf(a) - order.indexOf(b);
      }),
    };
  }, [matrixData]);

  // 查找 cell 数据
  const getCellData = (fileName: string, symbol: string, tf: string): HistoricalResult | null => {
    const fileData = matrixData[fileName];
    if (!fileData) return null;

    // 尝试多种 key 格式
    const candidates = [
      `${symbol}_${tf}`,
      symbol, // 单 symbol 文件
    ];

    for (const k of candidates) {
      if (fileData[k]) {
        const d = fileData[k];
        // 检查 timeframe 匹配
        if (d.timeframe === tf || !d.timeframe) return d;
      }
    }
    return null;
  };

  const getMetricValue = (d: HistoricalResult): number => {
    switch (metricKey) {
      case 'compound_return_pct': return d.compound_return_pct ?? d.total_pnl ?? 0;
      case 'win_rate': return d.win_rate ?? 0;
      case 'total': return d.total ?? 0;
      case 'max_drawdown_pct': return d.max_drawdown_pct ?? 0;
      default: return 0;
    }
  };

  const getMetricLabel = (): string => {
    switch (metricKey) {
      case 'compound_return_pct': return '复利收益%';
      case 'win_rate': return '胜率%';
      case 'total': return '交易数';
      case 'max_drawdown_pct': return '最大回撤%';
      default: return '';
    }
  };

  const formatMetric = (val: number): string => {
    if (metricKey === 'total') return val.toString();
    return `${val >= 0 && metricKey !== 'max_drawdown_pct' ? '+' : ''}${val.toFixed(1)}%`;
  };

  const getCellColor = (val: number): string => {
    if (metricKey === 'max_drawdown_pct') {
      if (val <= 5) return 'bg-green-900/30 text-green-400';
      if (val <= 10) return 'bg-yellow-900/30 text-yellow-400';
      return 'bg-red-900/30 text-red-400';
    }
    if (metricKey === 'total') return 'bg-slate-800/50 text-slate-300';
    if (val > 10) return 'bg-green-900/30 text-green-400';
    if (val > 0) return 'bg-green-900/20 text-green-400/80';
    if (val > -5) return 'bg-red-900/20 text-red-400/80';
    return 'bg-red-900/30 text-red-400';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 控制栏 */}
      <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-white">选择结果文件进行矩阵对比</h3>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500">指标:</span>
            {([
              ['compound_return_pct', '收益'],
              ['win_rate', '胜率'],
              ['total', '交易数'],
              ['max_drawdown_pct', '回撤'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setMetricKey(key)}
                className={`px-2 py-1 text-[10px] rounded ${
                  metricKey === key ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 文件选择器 */}
        <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto">
          {files.map(f => {
            const isSelected = selectedFiles.includes(f.name);
            return (
              <button
                key={f.name}
                onClick={() => {
                  if (isSelected) {
                    setSelectedFiles(prev => prev.filter(x => x !== f.name));
                  } else {
                    setSelectedFiles(prev => [...prev, f.name]);
                  }
                }}
                className={`px-2 py-1 text-[10px] rounded border transition-colors ${
                  isSelected
                    ? 'border-purple-500 bg-purple-900/30 text-purple-300'
                    : 'border-slate-700 bg-slate-800 text-slate-500 hover:text-slate-300'
                }`}
              >
                {f.name.replace('.json', '')}
              </button>
            );
          })}
        </div>
      </div>

      {/* 矩阵表格 -- 按文件展示 */}
      {loadingMatrix ? (
        <div className="flex items-center justify-center min-h-[200px]">
          <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
        </div>
      ) : Object.keys(matrixData).length > 0 ? (
        <div className="space-y-4">
          {/* 如果有多个文件，按文件分别展示矩阵 */}
          {selectedFiles.map(fileName => {
            const fileData = matrixData[fileName];
            if (!fileData) return null;

            const fileEntries = Object.entries(fileData);
            if (fileEntries.length === 0) return null;

            // 分析此文件的 symbols 和 timeframes
            const fileSymbols = new Set<string>();
            const fileTfs = new Set<string>();

            fileEntries.forEach(([key, val]) => {
              const parts = key.split('_');
              const lastPart = parts[parts.length - 1];
              if (['5m', '15m', '30m', '1h', '4h', '1d'].includes(lastPart)) {
                fileSymbols.add(parts.slice(0, -1).join('_'));
                fileTfs.add(lastPart);
              } else {
                fileSymbols.add(key);
                if (val.timeframe) fileTfs.add(val.timeframe);
              }
            });

            const sortedSymbols = Array.from(fileSymbols).sort();
            const sortedTfs = Array.from(fileTfs).sort((a, b) => {
              const order = ['5m', '15m', '30m', '1h', '4h', '1d'];
              return order.indexOf(a) - order.indexOf(b);
            });

            // 单条目文件 -- 简化显示
            if (fileEntries.length === 1) {
              const [key, val] = fileEntries[0];
              const pnl = val.compound_return_pct ?? val.total_pnl ?? 0;
              return (
                <div key={fileName} className="bg-slate-900 rounded-lg border border-slate-800 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white font-medium">{fileName.replace('.json', '')}</span>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-slate-400">{key}</span>
                      <span className="text-slate-400">{val.total}笔</span>
                      <span className="text-slate-400">胜率{val.win_rate.toFixed(1)}%</span>
                      <span className={pnl >= 0 ? 'text-green-400 font-medium' : 'text-red-400 font-medium'}>
                        {pnl >= 0 ? '+' : ''}{pnl.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            }

            // 多条目 -- 矩阵展示
            return (
              <div key={fileName} className="bg-slate-900 rounded-lg border border-slate-800 p-4 overflow-x-auto">
                <h4 className="text-xs font-medium text-white mb-3">
                  {fileName.replace('.json', '')}
                  <span className="text-slate-500 font-normal ml-2">({getMetricLabel()})</span>
                </h4>

                {sortedTfs.length > 0 && sortedSymbols.length > 0 ? (
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        <th className="text-left py-2 pr-3 text-slate-500 font-normal">品种 / 周期</th>
                        {sortedTfs.map(tf => (
                          <th key={tf} className="text-center py-2 px-2 text-slate-400 font-medium">
                            {tf}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedSymbols.map(sym => (
                        <tr key={sym} className="border-t border-slate-800/50">
                          <td className="py-2 pr-3 text-white font-medium">{sym}</td>
                          {sortedTfs.map(tf => {
                            const d = getCellData(fileName, sym, tf);
                            if (!d) {
                              return (
                                <td key={tf} className="py-2 px-2 text-center">
                                  <span className="text-slate-700">--</span>
                                </td>
                              );
                            }
                            const val = getMetricValue(d);
                            return (
                              <td key={tf} className="py-2 px-2 text-center">
                                <div className={`inline-block px-2 py-1 rounded text-xs font-medium ${getCellColor(val)}`}>
                                  {formatMetric(val)}
                                  <div className="text-[9px] opacity-60 font-normal mt-0.5">
                                    {d.total}笔 | WR {d.win_rate.toFixed(0)}%
                                  </div>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  // 扁平展示 (无法解析为矩阵)
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {fileEntries.map(([key, val]) => {
                      const metricVal = getMetricValue(val);
                      return (
                        <div key={key} className={`p-2 rounded ${getCellColor(metricVal)}`}>
                          <div className="text-[10px] opacity-70">{key}</div>
                          <div className="text-sm font-medium">{formatMetric(metricVal)}</div>
                          <div className="text-[9px] opacity-60">{val.total}笔 | WR {val.win_rate.toFixed(0)}%</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* 总览矩阵: 跨文件对比 (当选了 2+ 文件且有公共 symbols/timeframes 时) */}
          {selectedFiles.length >= 2 && allSymbols.length > 0 && allTimeframes.length > 0 && (
            <div className="bg-slate-900 rounded-lg border border-purple-800/30 p-4 overflow-x-auto">
              <h4 className="text-xs font-medium text-purple-400 mb-3">
                跨文件汇总对比
                <span className="text-slate-500 font-normal ml-2">({getMetricLabel()})</span>
              </h4>
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left py-2 pr-3 text-slate-500 font-normal">品种 / 周期</th>
                    {allTimeframes.map(tf => (
                      <th key={tf} className="text-center py-2 px-2 text-slate-400 font-medium">
                        {tf}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allSymbols.map(sym => (
                    <tr key={sym} className="border-t border-slate-800/50">
                      <td className="py-2 pr-3 text-white font-medium">{sym}</td>
                      {allTimeframes.map(tf => {
                        // 从所有文件中找到此 cell 的数据，取最新
                        let bestData: HistoricalResult | null = null;
                        for (const fn of selectedFiles) {
                          const d = getCellData(fn, sym, tf);
                          if (d) { bestData = d; break; }
                        }
                        if (!bestData) {
                          return (
                            <td key={tf} className="py-2 px-2 text-center">
                              <span className="text-slate-700">--</span>
                            </td>
                          );
                        }
                        const val = getMetricValue(bestData);
                        return (
                          <td key={tf} className="py-2 px-2 text-center">
                            <div className={`inline-block px-2 py-1 rounded text-xs font-medium ${getCellColor(val)}`}>
                              {formatMetric(val)}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-slate-900 rounded-lg border border-slate-800 p-8 flex flex-col items-center justify-center min-h-[300px]">
          <Grid3X3 className="w-10 h-10 text-slate-600 mb-4" />
          <p className="text-slate-400">选择结果文件开始矩阵对比</p>
          <p className="text-xs text-slate-600 mt-1">推荐选择多周期文件 (文件名含 multitf)</p>
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * 原有 ResultPanel -- 在线 Job 结果展示 (保留不变)
 * ============================================================ */

function ResultPanel({ result, config: cfg }: { result: NonNullable<JobDetail['result']>; config: BacktestConfig }) {
  const s = result.summary;
  const sig = result.signals;

  return (
    <div className="space-y-4">
      {/* 概要卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="总交易" value={s.total_trades.toString()} />
        <StatCard
          label="胜率"
          value={`${s.win_rate.toFixed(1)}%`}
          color={s.win_rate >= 50 ? 'green' : 'red'}
        />
        <StatCard
          label="总盈亏"
          value={`${s.total_pnl >= 0 ? '+' : ''}${s.total_pnl.toFixed(2)}%`}
          color={s.total_pnl >= 0 ? 'green' : 'red'}
        />
        <StatCard
          label="盈亏因子"
          value={s.profit_factor === Infinity ? '---' : s.profit_factor.toFixed(2)}
          color={s.profit_factor >= 1.5 ? 'green' : s.profit_factor >= 1 ? 'yellow' : 'red'}
        />
      </div>

      {/* 详细统计 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 信号漏斗 */}
        <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
          <h3 className="text-sm font-medium text-white mb-3">信号漏斗</h3>
          <div className="space-y-2">
            <FunnelRow label="信号生成" value={sig.generated} total={sig.generated} />
            <FunnelRow label="盈亏比拦截" value={sig.blocked_rr} total={sig.generated} negative />
            <FunnelRow label="评分拦截" value={sig.blocked_score} total={sig.generated} negative />
            <FunnelRow label="背景拦截" value={sig.blocked_bg} total={sig.generated} negative />
            <FunnelRow label="最终通过" value={sig.passed} total={sig.generated} highlight />
          </div>
        </div>

        {/* 交易统计 */}
        <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
          <h3 className="text-sm font-medium text-white mb-3">交易统计</h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="text-slate-400">胜/负/平</div>
            <div className="text-white">{s.wins} / {s.losses} / {s.total_trades - s.wins - s.losses}</div>
            <div className="text-slate-400">平均盈利</div>
            <div className="text-green-400">+{s.avg_win.toFixed(2)}%</div>
            <div className="text-slate-400">平均亏损</div>
            <div className="text-red-400">{s.avg_loss.toFixed(2)}%</div>
            <div className="text-slate-400">最佳交易</div>
            <div className="text-green-400">+{s.best_trade.toFixed(2)}%</div>
            <div className="text-slate-400">最差交易</div>
            <div className="text-red-400">{s.worst_trade.toFixed(2)}%</div>
            <div className="text-slate-400">最大回撤</div>
            <div className="text-red-400">{s.max_drawdown.toFixed(2)}%</div>
            <div className="text-slate-400">评分阈值</div>
            <div className="text-white">{cfg.threshold}</div>
          </div>
        </div>
      </div>

      {/* 按维度分析 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GroupTable title="按策略" data={result.by_strategy} />
        <GroupTable title="按背景" data={result.by_background} />
        <GroupTable title="按方向" data={result.by_direction} />
      </div>

      {/* 交易列表 */}
      {result.trades && result.trades.length > 0 && (
        <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
          <h3 className="text-sm font-medium text-white mb-3">交易记录 ({result.trades.length}笔)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800">
                  <th className="text-left py-2 pr-2">时间</th>
                  <th className="text-left py-2 pr-2">策略</th>
                  <th className="text-left py-2 pr-2">方向</th>
                  <th className="text-right py-2 pr-2">入场</th>
                  <th className="text-right py-2 pr-2">出场</th>
                  <th className="text-right py-2 pr-2">PnL</th>
                  <th className="text-right py-2 pr-2">评分</th>
                  <th className="text-left py-2">原因</th>
                </tr>
              </thead>
              <tbody>
                {result.trades.map((t, i) => (
                  <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="py-1.5 pr-2 text-slate-400">{t.entry_time?.slice(0, 16)}</td>
                    <td className="py-1.5 pr-2 text-white">{t.strategy}</td>
                    <td className="py-1.5 pr-2">
                      <span className={t.direction === 'BUY' ? 'text-green-400' : 'text-red-400'}>
                        {t.direction === 'BUY' ? '多' : '空'}
                      </span>
                    </td>
                    <td className="py-1.5 pr-2 text-right text-slate-300">{t.entry_price.toFixed(2)}</td>
                    <td className="py-1.5 pr-2 text-right text-slate-300">{t.exit_price.toFixed(2)}</td>
                    <td className={`py-1.5 pr-2 text-right font-medium ${t.pnl_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {t.pnl_pct >= 0 ? '+' : ''}{t.pnl_pct.toFixed(2)}%
                    </td>
                    <td className="py-1.5 pr-2 text-right text-slate-400">{t.score}</td>
                    <td className="py-1.5 text-slate-500">{t.exit_reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * 共用组件 (保留原有)
 * ============================================================ */

// 统计卡片
function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  const colorClass = color === 'green' ? 'text-green-400'
    : color === 'red' ? 'text-red-400'
    : color === 'yellow' ? 'text-yellow-400'
    : 'text-white';

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-800 p-3">
      <div className="text-[10px] text-slate-500 uppercase">{label}</div>
      <div className={`text-lg font-bold mt-1 ${colorClass}`}>{value}</div>
    </div>
  );
}

// 信号漏斗行
function FunnelRow({ label, value, total, negative, highlight }: {
  label: string; value: number; total: number; negative?: boolean; highlight?: boolean;
}) {
  const pct = total > 0 ? (value / total * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`w-20 ${highlight ? 'text-purple-400 font-medium' : 'text-slate-400'}`}>{label}</span>
      <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${
            highlight ? 'bg-purple-500' : negative ? 'bg-red-500/40' : 'bg-slate-600'
          }`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <span className={`w-16 text-right ${highlight ? 'text-purple-400' : negative ? 'text-red-400' : 'text-slate-300'}`}>
        {value.toLocaleString()}
      </span>
    </div>
  );
}

// 分组表格
function GroupTable({ title, data }: {
  title: string;
  data: Record<string, { trades: number; wins: number; pnl: number }>;
}) {
  const entries = Object.entries(data).sort((a, b) => b[1].pnl - a[1].pnl);
  if (entries.length === 0) return null;

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
      <h3 className="text-sm font-medium text-white mb-2">{title}</h3>
      <div className="space-y-1">
        {entries.map(([key, val]) => {
          const wr = val.trades > 0 ? (val.wins / val.trades * 100) : 0;
          return (
            <div key={key} className="flex items-center justify-between text-xs">
              <span className="text-slate-400 truncate max-w-[100px]">{key}</span>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">{val.trades}笔</span>
                <span className="text-slate-400">{wr.toFixed(0)}%</span>
                <span className={`w-16 text-right font-medium ${val.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {val.pnl >= 0 ? '+' : ''}{val.pnl.toFixed(2)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 状态图标
function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed': return <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />;
    case 'failed': return <XCircle className="w-3.5 h-3.5 text-red-400" />;
    case 'running': return <Loader2 className="w-3.5 h-3.5 text-purple-400 animate-spin" />;
    default: return <Clock className="w-3.5 h-3.5 text-slate-500" />;
  }
}

/* ============================================================
 * 工具函数
 * ============================================================ */

function formatTime(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return iso.slice(5, 16);
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
