'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Loader2, RefreshCw, Search, ArrowUpDown,
  TrendingUp, TrendingDown, Minus, ChevronRight,
  Target, BarChart3, Brain, Eye, AlertTriangle,
  Flame, Zap,
} from 'lucide-react';

/* ============================================================
 * 类型定义
 * ============================================================ */

interface SceneDetail {
  id: string;
  symbol: string;
  actual_state: string;
  actual_dir: string;
  background: string;
  change_pct: number;
  agent_dir: string;
  agent_state: string;
  score: number | null;
  decision: 'trade' | 'no_trade';
  r2_assessment: 'correct' | 'partial' | 'wrong';
  missed_profit: boolean;
}

interface SceneFullDetail extends SceneDetail {
  round1_reply: string;
  round2_reply: string;
}

interface LearningCurveItem {
  label: string;
  avg_score: number;
  direction_accuracy: number;
  traded: number;
  missed: number;
  count: number;
}

interface TrainingSummary {
  total_scenes: number;
  traded: number;
  no_trade: number;
  avg_score: number;
  max_score: number;
  min_score: number;
  direction_accuracy: number;
  direction_correct: number;
  direction_wrong: number;
  missed_profit: number;
  avoided_loss: number;
  fear_rate: number;
  trade_rate: number;
  score_extracted: number;
  r2_correct: number;
  r2_partial: number;
  r2_wrong: number;
  learning_curve: LearningCurveItem[];
}

// V6: 技能掌握度
interface SkillMasteryItem {
  name: string;
  step: number;
  category: string;
  difficulty: string;
  avg_score: number;
  scenes: number;
}

interface WeakSpotItem {
  id: string;
  name: string;
  category: string;
  score: number;
  scenes: number;
}

interface TrainingData {
  version: string;
  available_versions: string[];
  summary: TrainingSummary;
  skill_mastery?: Record<string, SkillMasteryItem>;
  weak_spots?: WeakSpotItem[];
  by_symbol: Record<string, { total: number; correct: number; traded: number; dir_correct: number; dir_judged: number }>;
  by_state: Record<string, { total: number; agent_correct: number; agent_traded: number; dir_correct: number; dir_judged: number }>;
  details: SceneDetail[];
}

/* ============================================================
 * 小组件
 * ============================================================ */

function StatCard({ label, value, sub, color = 'text-white' }: {
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="bg-slate-900 rounded-lg border border-slate-800 p-3">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function ProgressBar({ value, max = 100, color = 'bg-purple-500' }: {
  value: number; max?: number; color?: string;
}) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ============================================================
 * V6: 技能热力图 — 38 技能按 Step 分组
 * ============================================================ */

const STEP_LABELS: Record<number, { name: string; color: string }> = {
  0: { name: 'Step 0: K线读盘', color: 'border-sky-600' },
  1: { name: 'Step 1: 方向判断', color: 'border-blue-600' },
  2: { name: 'Step 2: 市场状态', color: 'border-indigo-600' },
  3: { name: 'Step 3a: 顺势入场', color: 'border-violet-600' },
  4: { name: 'Step 3b: 反转入场', color: 'border-purple-600' },
  5: { name: 'Step 4: 评分框架', color: 'border-fuchsia-600' },
  6: { name: 'Step 5: 执行细节', color: 'border-pink-600' },
  7: { name: 'Step 6: 持仓管理', color: 'border-rose-600' },
};

// 将 step 映射到显示分组索引
function stepGroup(step: number, category: string): number {
  if (step === 3 && category === '反转入场') return 4;
  if (step === 3) return 3;
  if (step === 4) return 5;
  if (step === 5) return 6;
  if (step === 6) return 7;
  return step;
}

function scoreColor(score: number): string {
  if (score >= 70) return 'bg-green-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

function scoreTextColor(score: number): string {
  if (score >= 70) return 'text-green-400';
  if (score >= 40) return 'text-amber-400';
  return 'text-red-400';
}

function SkillHeatmap({ mastery }: { mastery: Record<string, SkillMasteryItem> }) {
  // 按 step 分组
  const groups = useMemo(() => {
    const map = new Map<number, { id: string; item: SkillMasteryItem }[]>();
    for (const [id, item] of Object.entries(mastery)) {
      const g = stepGroup(item.step, item.category);
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push({ id, item });
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  }, [mastery]);

  // 总体统计
  const overall = useMemo(() => {
    const items = Object.values(mastery);
    const withScenes = items.filter(i => i.scenes > 0);
    const avg = withScenes.length > 0
      ? Math.round(withScenes.reduce((s, i) => s + i.avg_score, 0) / withScenes.length)
      : 0;
    const covered = withScenes.length;
    return { avg, covered, total: items.length };
  }, [mastery]);

  return (
    <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
          <Brain className="w-3.5 h-3.5" /> 知识掌握度热力图
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-slate-400">
            覆盖 <span className="text-white font-mono">{overall.covered}/{overall.total}</span> 技能
          </span>
          <span className={scoreTextColor(overall.avg)}>
            均分 <span className="font-mono font-bold">{overall.avg}%</span>
          </span>
        </div>
      </div>

      {/* 图例 */}
      <div className="flex items-center gap-3 mb-3 text-xs text-slate-500">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" /> &ge;70 掌握</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" /> &ge;40 学习中</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" /> &lt;40 短板</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-slate-700 inline-block" /> 未覆盖</span>
      </div>

      <div className="space-y-3">
        {groups.map(([groupIdx, skills]) => {
          const meta = STEP_LABELS[groupIdx] || { name: `Step ${groupIdx}`, color: 'border-slate-600' };
          return (
            <div key={groupIdx} className={`border-l-2 ${meta.color} pl-3`}>
              <div className="text-xs text-slate-400 mb-1.5 font-medium">{meta.name}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                {skills.map(({ id, item }) => (
                  <div
                    key={id}
                    className="flex items-center gap-2 bg-slate-800/60 rounded px-2 py-1.5 group hover:bg-slate-800 transition-colors"
                  >
                    {/* 得分圆点 */}
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      item.scenes === 0 ? 'bg-slate-700' : scoreColor(item.avg_score)
                    }`} />
                    {/* 技能名 */}
                    <span className="text-xs text-slate-300 truncate flex-1" title={item.name}>
                      {item.name}
                    </span>
                    {/* 分数 + 场景数 */}
                    <span className={`text-xs font-mono flex-shrink-0 ${
                      item.scenes === 0 ? 'text-slate-600' : scoreTextColor(item.avg_score)
                    }`}>
                      {item.scenes === 0 ? '—' : `${item.avg_score}%`}
                    </span>
                    <span className="text-xs text-slate-600 font-mono flex-shrink-0 w-6 text-right">
                      {item.scenes > 0 ? `×${item.scenes}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
 * V6: 短板面板
 * ============================================================ */

function WeakSpotsPanel({ spots }: { spots: WeakSpotItem[] }) {
  if (spots.length === 0) return null;

  return (
    <div className="bg-slate-900/50 rounded-lg border border-red-900/30 p-3">
      <div className="text-xs text-red-400 mb-2 font-medium flex items-center gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5" /> 短板技能 — 下轮重点训练
      </div>
      <div className="space-y-1.5">
        {spots.map(s => (
          <div key={s.id} className="flex items-center gap-2 text-xs">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
              s.scenes === 0 ? 'bg-slate-700' : scoreColor(s.score)
            }`} />
            <span className="text-slate-300 w-28 truncate" title={s.name}>{s.name}</span>
            <span className="text-slate-500 w-16 truncate">{s.category}</span>
            <div className="flex-1">
              <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${s.scenes === 0 ? 'bg-slate-700' : scoreColor(s.score)}`}
                  style={{ width: `${Math.max(2, s.score)}%` }}
                />
              </div>
            </div>
            <span className={`font-mono w-8 text-right ${
              s.scenes === 0 ? 'text-slate-600' : scoreTextColor(s.score)
            }`}>
              {s.scenes === 0 ? '—' : `${s.score}%`}
            </span>
            <span className="text-slate-600 font-mono w-6 text-right">
              ×{s.scenes}
            </span>
          </div>
        ))}
      </div>
      <div className="text-xs text-slate-600 mt-2">
        建议: 针对以上技能增加定向训练场景 (每技能 ≥5 场景)
      </div>
    </div>
  );
}

/* ============================================================
 * V6: 进化时间线 — V5 → V6 对比
 * ============================================================ */

function EvolutionTimeline({ data }: { data: TrainingData }) {
  const ver = data.version.toUpperCase();
  const { summary } = data;

  return (
    <div className="bg-gradient-to-r from-purple-900/20 to-slate-900/50 rounded-lg border border-purple-800/30 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Zap className="w-4 h-4 text-purple-400" />
        <span className="text-sm font-bold text-purple-300">训练进化</span>
        <span className="text-xs text-slate-500 ml-auto">当前轮次: {ver}</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div>
          <div className="text-xs text-slate-500">训练场景</div>
          <div className="text-lg font-bold text-white">{summary.total_scenes}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">平均评分</div>
          <div className={`text-lg font-bold ${summary.avg_score >= 50 ? 'text-green-400' : 'text-amber-400'}`}>
            {summary.avg_score}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-500">方向准确率</div>
          <div className={`text-lg font-bold ${summary.direction_accuracy >= 50 ? 'text-green-400' : 'text-red-400'}`}>
            {summary.direction_accuracy}%
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-500">交易率</div>
          <div className={`text-lg font-bold ${summary.trade_rate >= 10 ? 'text-green-400' : 'text-amber-400'}`}>
            {summary.trade_rate}%
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-500">恐惧率</div>
          <div className={`text-lg font-bold ${summary.fear_rate <= 15 ? 'text-green-400' : 'text-amber-400'}`}>
            {summary.fear_rate}%
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * 主组件
 * ============================================================ */

export function TrainingTab() {
  const [data, setData] = useState<TrainingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<SceneFullDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [version, setVersion] = useState<string>('');

  // 筛选状态
  const [filterSymbol, setFilterSymbol] = useState<string | null>(null);
  const [filterState, setFilterState] = useState<string | null>(null);
  const [filterDecision, setFilterDecision] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'id' | 'score' | 'change'>('id');
  const [searchTerm, setSearchTerm] = useState('');

  // 加载汇总数据
  const loadData = useCallback(async (ver?: string) => {
    setLoading(true);
    setError(null);
    try {
      const vParam = ver || version;
      const url = vParam ? `/api/training-logs?version=${vParam}` : '/api/training-logs';
      const res = await fetch(url);
      if (!res.ok) throw new Error('加载失败');
      const json = await res.json();
      setData(json);
      if (json.version && !ver) setVersion(json.version);
    } catch (e) {
      setError(e instanceof Error ? e.message : '未知错误');
    } finally {
      setLoading(false);
    }
  }, [version]);

  useEffect(() => { loadData(); }, [loadData]);

  // 切换版本
  const switchVersion = useCallback((v: string) => {
    setVersion(v);
    setSelectedId(null);
    setSelectedDetail(null);
    loadData(v);
  }, [loadData]);

  // 加载单场景详情
  const loadDetail = useCallback(async (sceneId: string) => {
    setSelectedId(sceneId);
    setDetailLoading(true);
    try {
      const vParam = version ? `&version=${version}` : '';
      const res = await fetch(`/api/training-logs?scene=${sceneId}${vParam}`);
      if (!res.ok) throw new Error('加载详情失败');
      const json: SceneFullDetail = await res.json();
      setSelectedDetail(json);
    } catch {
      setSelectedDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, [version]);

  // 筛选 + 排序
  const filteredDetails = useMemo(() => {
    if (!data) return [];
    let items = [...data.details];

    if (filterSymbol) items = items.filter(d => d.symbol === filterSymbol);
    if (filterState) items = items.filter(d => d.actual_state === filterState);
    if (filterDecision) items = items.filter(d => d.decision === filterDecision);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      items = items.filter(d =>
        d.id.toLowerCase().includes(term) ||
        d.symbol.toLowerCase().includes(term) ||
        d.actual_state.toLowerCase().includes(term)
      );
    }

    items.sort((a, b) => {
      if (sortBy === 'score') return (b.score ?? 0) - (a.score ?? 0);
      if (sortBy === 'change') return Math.abs(b.change_pct) - Math.abs(a.change_pct);
      return parseInt(a.id.slice(1), 10) - parseInt(b.id.slice(1), 10);
    });

    return items;
  }, [data, filterSymbol, filterState, filterDecision, sortBy, searchTerm]);

  // 提取唯一品种和状态
  const symbols = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.details.map(d => d.symbol))).sort();
  }, [data]);

  const states = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.details.map(d => d.actual_state))).sort();
  }, [data]);

  /* ============================================================
   * 渲染
   * ============================================================ */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
        <span className="ml-2 text-slate-400">加载训练数据...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-20">
        <div className="text-red-400 mb-2">加载失败</div>
        <div className="text-sm text-slate-500">{error}</div>
        <button onClick={() => loadData()} className="mt-3 text-sm text-purple-400 hover:text-purple-300">
          重试
        </button>
      </div>
    );
  }

  const { summary } = data;

  return (
    <div className="space-y-4">
      {/* ===== 版本选择器 + 刷新 ===== */}
      <div className="flex items-center gap-3">
        {data.available_versions && data.available_versions.length > 1 && (
          <>
            <span className="text-xs text-slate-500">训练轮次:</span>
            <div className="flex items-center gap-1">
              {data.available_versions.map(v => (
                <button
                  key={v}
                  onClick={() => switchVersion(v)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    (version || data.version) === v
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  {v.toUpperCase()}
                </button>
              ))}
            </div>
          </>
        )}
        <span className="text-xs text-slate-600">
          {(version || data.version).toUpperCase()} · {summary.total_scenes} 组
        </span>
        <button
          onClick={() => loadData()}
          className="ml-auto p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
          title="刷新数据"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ===== V6: 进化时间线 ===== */}
      <EvolutionTimeline data={data} />

      {/* ===== V6: 知识热力图 ===== */}
      {data.skill_mastery && Object.keys(data.skill_mastery).length > 0 && (
        <SkillHeatmap mastery={data.skill_mastery} />
      )}

      {/* ===== V6: 短板面板 ===== */}
      {data.weak_spots && data.weak_spots.length > 0 && (
        <WeakSpotsPanel spots={data.weak_spots} />
      )}

      {/* ===== 核心指标卡片 ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="已训练"
          value={`${summary.total_scenes}组`}
          sub={`评分提取 ${summary.score_extracted}/${summary.total_scenes}`}
        />
        <StatCard
          label="决策分布"
          value={`${summary.trade_rate}%`}
          sub={`交易 ${summary.traded} · 观望 ${summary.no_trade}`}
          color={summary.trade_rate >= 10 ? 'text-green-400' : 'text-amber-400'}
        />
        <StatCard
          label="方向判断"
          value={`${summary.direction_accuracy}%`}
          sub={`对 ${summary.direction_correct} · 错 ${summary.direction_wrong}`}
          color={summary.direction_accuracy >= 50 ? 'text-green-400' : 'text-red-400'}
        />
        <StatCard
          label="恐惧率"
          value={`${summary.fear_rate}%`}
          sub={`错过 ${summary.missed_profit} · 规避 ${summary.avoided_loss}`}
          color={summary.fear_rate <= 15 ? 'text-green-400' : 'text-amber-400'}
        />
      </div>

      {/* ===== 训练诊断 ===== */}
      <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-3">
        <div className="text-xs text-slate-500 mb-1.5 font-medium">训练诊断</div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
          <span className={summary.direction_accuracy >= 50 ? 'text-green-400' : 'text-amber-400'}>
            {summary.direction_accuracy >= 50
              ? `方向判断 ${summary.direction_accuracy}% — 达标`
              : `方向判断 ${summary.direction_accuracy}% — 低于50%基线，需加强`}
          </span>
          <span className={summary.trade_rate >= 10 ? 'text-green-400' : 'text-amber-400'}>
            {summary.trade_rate >= 10
              ? `交易率 ${summary.trade_rate}% — 正常`
              : `交易率 ${summary.trade_rate}% — 极保守（每${summary.traded > 0 ? Math.round(summary.total_scenes / summary.traded) : '∞'}场才做1笔）`}
          </span>
          <span className={summary.fear_rate <= 15 ? 'text-green-400' : 'text-amber-400'}>
            {summary.fear_rate <= 15
              ? `恐惧率 ${summary.fear_rate}% — 良好`
              : `恐惧率 ${summary.fear_rate}% — 方向对但不敢做，存在恐惧倾向`}
          </span>
        </div>
      </div>

      {/* ===== 学习曲线 + 分组表 ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* 学习曲线 */}
        <div className="bg-slate-900 rounded-lg border border-slate-800 p-3">
          <div className="text-xs text-slate-500 mb-2 font-medium">学习曲线</div>
          <div className="space-y-2">
            {summary.learning_curve.map(g => (
              <div key={g.label} className="flex items-center justify-between text-xs">
                <span className="text-slate-400 w-32 truncate">{g.label}</span>
                <span className="text-purple-400 font-mono">{g.avg_score}分</span>
                <span className={`font-mono ${g.direction_accuracy >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                  方向{g.direction_accuracy}%
                </span>
                <span className="text-slate-500">{g.traded}笔/{g.count}组</span>
              </div>
            ))}
          </div>
        </div>

        {/* 按品种 */}
        <div className="bg-slate-900 rounded-lg border border-slate-800 p-3">
          <div className="text-xs text-slate-500 mb-2 font-medium">按品种</div>
          <div className="space-y-1.5">
            {Object.entries(data.by_symbol)
              .sort(([, a], [, b]) => b.total - a.total)
              .map(([sym, s]) => {
                const dirAcc = s.dir_judged > 0 ? Math.round((s.dir_correct / s.dir_judged) * 100) : 0;
                return (
                  <div key={sym} className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-mono w-20">{sym.replace('USDT', '')}</span>
                    <span className="text-slate-400">{s.total}组</span>
                    <span className={`font-mono ${dirAcc >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                      方向{dirAcc}%
                    </span>
                    <span className="text-slate-500">交易{s.traded}</span>
                  </div>
                );
              })}
          </div>
        </div>

        {/* 按市场状态 */}
        <div className="bg-slate-900 rounded-lg border border-slate-800 p-3">
          <div className="text-xs text-slate-500 mb-2 font-medium">按市场状态</div>
          <div className="space-y-1.5">
            {Object.entries(data.by_state)
              .sort(([, a], [, b]) => b.total - a.total)
              .map(([state, s]) => {
                const dirAcc = s.dir_judged > 0 ? Math.round((s.dir_correct / s.dir_judged) * 100) : 0;
                return (
                  <div key={state} className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 w-24 truncate">{state}</span>
                    <span className="text-slate-400">{s.total}组</span>
                    <span className={`font-mono ${dirAcc >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                      方向{dirAcc}%
                    </span>
                    <span className="text-slate-500">交易{s.agent_traded}</span>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* ===== 下半部分：场景列表 + 详情 ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 左面板：场景列表 */}
        <div className="space-y-3">
          {/* 搜索 + 刷新 */}
          <div className="bg-slate-900 rounded-lg border border-slate-800 p-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="搜索场景..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>
              <button
                onClick={() => loadData()}
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
                title="刷新"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 排序 */}
            <div className="flex items-center gap-1 mt-2">
              <ArrowUpDown className="w-3 h-3 text-slate-500" />
              {(['id', 'score', 'change'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  className={`px-2 py-0.5 rounded text-xs ${
                    sortBy === s
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {s === 'id' ? 'ID' : s === 'score' ? '分数' : '变化幅度'}
                </button>
              ))}
            </div>
          </div>

          {/* 筛选 pills */}
          <div className="bg-slate-900 rounded-lg border border-slate-800 p-3 space-y-2">
            {/* 品种 */}
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setFilterSymbol(null)}
                className={`px-2 py-0.5 rounded text-xs ${!filterSymbol ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
              >
                全部品种
              </button>
              {symbols.map(s => (
                <button
                  key={s}
                  onClick={() => setFilterSymbol(filterSymbol === s ? null : s)}
                  className={`px-2 py-0.5 rounded text-xs ${
                    filterSymbol === s ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {s.replace('USDT', '')}
                </button>
              ))}
            </div>
            {/* 状态 */}
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setFilterState(null)}
                className={`px-2 py-0.5 rounded text-xs ${!filterState ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
              >
                全部状态
              </button>
              {states.map(s => (
                <button
                  key={s}
                  onClick={() => setFilterState(filterState === s ? null : s)}
                  className={`px-2 py-0.5 rounded text-xs ${
                    filterState === s ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            {/* 决策 */}
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setFilterDecision(null)}
                className={`px-2 py-0.5 rounded text-xs ${!filterDecision ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
              >
                全部决策
              </button>
              <button
                onClick={() => setFilterDecision(filterDecision === 'trade' ? null : 'trade')}
                className={`px-2 py-0.5 rounded text-xs ${
                  filterDecision === 'trade' ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                交易
              </button>
              <button
                onClick={() => setFilterDecision(filterDecision === 'no_trade' ? null : 'no_trade')}
                className={`px-2 py-0.5 rounded text-xs ${
                  filterDecision === 'no_trade' ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                观望
              </button>
            </div>
          </div>

          {/* 场景卡片列表 */}
          <div className="text-xs text-slate-500 px-1">{filteredDetails.length} 个场景</div>
          <div className="space-y-1.5 max-h-[calc(100vh-360px)] overflow-y-auto pr-1">
            {filteredDetails.map(d => (
              <button
                key={d.id}
                onClick={() => loadDetail(d.id)}
                className={`w-full text-left rounded-lg border p-2.5 transition-colors ${
                  selectedId === d.id
                    ? 'border-purple-500 bg-purple-900/20'
                    : 'border-slate-800 bg-slate-900 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-purple-400">{d.id}</span>
                    <span className="text-xs text-slate-400">{d.symbol.replace('USDT', '')}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {d.score !== null && (
                      <span className={`text-xs font-mono ${
                        d.score >= 80 ? 'text-green-400' : d.score >= 70 ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {d.score}分
                      </span>
                    )}
                    <ChevronRight className="w-3 h-3 text-slate-600" />
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-slate-500">{d.actual_state}</span>
                  <span className="text-xs text-slate-600">|</span>
                  <span className={`text-xs ${d.decision === 'trade' ? 'text-green-400' : 'text-orange-400'}`}>
                    {d.decision === 'trade' ? '交易' : '观望'}
                  </span>
                  <span className="text-xs text-slate-600">|</span>
                  <span className={`text-xs ${
                    d.r2_assessment === 'correct' ? 'text-green-400' :
                    d.r2_assessment === 'partial' ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    {d.r2_assessment === 'correct' ? '✅' : d.r2_assessment === 'partial' ? '⚠️' : '❌'}
                  </span>
                  <span className={`text-xs font-mono ml-auto ${d.change_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {d.change_pct >= 0 ? '+' : ''}{d.change_pct.toFixed(2)}%
                  </span>
                </div>
                {d.missed_profit && (
                  <div className="text-xs text-amber-500 mt-1">⚡ 错过盈利</div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* 右面板：场景详情 */}
        <div className="lg:col-span-2">
          {detailLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
              <span className="ml-2 text-sm text-slate-400">加载详情...</span>
            </div>
          ) : selectedDetail ? (
            <div className="space-y-3">
              {/* 元数据卡片 */}
              <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-purple-400">{selectedDetail.id}</span>
                    <span className="text-sm text-white">{selectedDetail.symbol}</span>
                  </div>
                  <span className={`text-sm font-mono ${selectedDetail.change_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {selectedDetail.change_pct >= 0 ? '+' : ''}{selectedDetail.change_pct.toFixed(2)}%
                  </span>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <div className="text-xs text-slate-500">市场状态</div>
                    <div className="text-sm text-slate-200">{selectedDetail.actual_state}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">背景</div>
                    <div className="text-sm text-slate-200">{selectedDetail.background}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">实际方向</div>
                    <div className="text-sm flex items-center gap-1">
                      {selectedDetail.actual_dir === 'up'
                        ? <><TrendingUp className="w-3.5 h-3.5 text-green-400" /><span className="text-green-400">上涨</span></>
                        : <><TrendingDown className="w-3.5 h-3.5 text-red-400" /><span className="text-red-400">下跌</span></>
                      }
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">变化幅度</div>
                    <div className={`text-sm font-mono ${selectedDetail.change_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {selectedDetail.change_pct >= 0 ? '+' : ''}{selectedDetail.change_pct.toFixed(3)}%
                    </div>
                  </div>
                </div>
              </div>

              {/* 提取指标卡片 */}
              <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
                <div className="text-xs text-slate-500 mb-3 font-medium flex items-center gap-1">
                  <Brain className="w-3.5 h-3.5" /> Agent 分析指标
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <div className="text-xs text-slate-500">评分</div>
                    <div className={`text-lg font-bold ${
                      (selectedDetail.score ?? 0) >= 80 ? 'text-green-400' :
                      (selectedDetail.score ?? 0) >= 70 ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {selectedDetail.score ?? 'N/A'}<span className="text-xs text-slate-500">/100</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">决策</div>
                    <div className={`text-sm font-medium ${
                      selectedDetail.decision === 'trade' ? 'text-green-400' : 'text-orange-400'
                    }`}>
                      {selectedDetail.decision === 'trade' ? '执行交易' : '观望'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Agent 方向</div>
                    <div className="text-sm flex items-center gap-1">
                      {selectedDetail.agent_dir === 'up'
                        ? <><TrendingUp className="w-3.5 h-3.5 text-green-400" /><span className="text-green-400">看多</span></>
                        : selectedDetail.agent_dir === 'down'
                          ? <><TrendingDown className="w-3.5 h-3.5 text-red-400" /><span className="text-red-400">看空</span></>
                          : <><Minus className="w-3.5 h-3.5 text-slate-400" /><span className="text-slate-400">中性</span></>
                      }
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">R2 评估</div>
                    <div className={`text-sm font-medium ${
                      selectedDetail.r2_assessment === 'correct' ? 'text-green-400' :
                      selectedDetail.r2_assessment === 'partial' ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {selectedDetail.r2_assessment === 'correct' ? '✅ 正确' :
                       selectedDetail.r2_assessment === 'partial' ? '⚠️ 部分' : '❌ 错误'}
                    </div>
                  </div>
                </div>
                {/* 方向匹配 */}
                <div className="mt-3 pt-3 border-t border-slate-800 flex items-center gap-4 text-xs">
                  <span className="text-slate-500">Agent 状态判断:</span>
                  <span className="text-slate-300">{selectedDetail.agent_state}</span>
                  <span className="text-slate-600">|</span>
                  <span className="text-slate-500">方向:</span>
                  <span className={
                    selectedDetail.agent_dir === selectedDetail.actual_dir ? 'text-green-400' :
                    selectedDetail.agent_dir === 'neutral' ? 'text-slate-400' : 'text-red-400'
                  }>
                    {selectedDetail.agent_dir === selectedDetail.actual_dir ? '✅ 方向正确' :
                     selectedDetail.agent_dir === 'neutral' ? '— 未判断' : '❌ 方向错误'}
                  </span>
                </div>
              </div>

              {/* Round 1 分析原文 */}
              <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
                <div className="text-xs text-slate-500 mb-2 font-medium flex items-center gap-1">
                  <Target className="w-3.5 h-3.5" /> Round 1 — 读盘分析
                </div>
                <div className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-[400px] overflow-y-auto pr-2">
                  {selectedDetail.round1_reply || '无数据'}
                </div>
              </div>

              {/* Round 2 反思原文 */}
              <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
                <div className="text-xs text-slate-500 mb-2 font-medium flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" /> Round 2 — 反思校准
                </div>
                <div className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-[400px] overflow-y-auto pr-2">
                  {selectedDetail.round2_reply || '无数据'}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <BarChart3 className="w-8 h-8 mb-2 text-slate-700" />
              <div className="text-sm">选择一个场景查看详情</div>
              <div className="text-xs mt-1">共 {data.details.length} 个训练场景</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
