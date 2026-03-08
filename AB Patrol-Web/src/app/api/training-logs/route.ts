/**
 * 读盘训练日志 API Route
 *
 * 读取 data/training/logs/S*.json，提取分析指标并返回汇总报告
 *
 * GET /api/training-logs          — 汇总报告 + 场景列表（不含原文）
 * GET /api/training-logs?scene=S030 — 单场景完整数据（含原文）
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// 版本 → 日志目录映射
const TRAINING_BASE = path.resolve(process.cwd(), '..', 'data', 'training');
const VERSION_DIRS: Record<string, string> = {
  v5: path.join(TRAINING_BASE, 'logs_v5'),
  v6: path.join(TRAINING_BASE, 'logs_v6'),
};

const TAXONOMY_PATH = path.join(TRAINING_BASE, 'knowledge_taxonomy.json');

interface TaxonomySkill {
  id: string;
  name: string;
  step: number;
  category: string;
  difficulty: string;
  keywords: string[];
}

interface Taxonomy {
  skills: TaxonomySkill[];
  state_to_skills: Record<string, string[]>;
}

let _taxonomyCache: Taxonomy | null = null;
function loadTaxonomy(): Taxonomy {
  if (_taxonomyCache) return _taxonomyCache;
  try {
    const content = fs.readFileSync(TAXONOMY_PATH, 'utf-8');
    _taxonomyCache = JSON.parse(content);
    return _taxonomyCache!;
  } catch {
    return { skills: [], state_to_skills: {} };
  }
}

function getLogsDir(version: string | null): string {
  if (version && VERSION_DIRS[version]) return VERSION_DIRS[version];
  // 自动选择最新可用版本
  for (const v of ['v6', 'v5']) {
    const dir = VERSION_DIRS[v];
    if (fs.existsSync(dir) && fs.readdirSync(dir).some(f => /^S\d+\.json$/.test(f))) {
      return dir;
    }
  }
  return VERSION_DIRS.v5;
}

/* ============================================================
 * 提取函数 — 从 scripts/analyze_training.py 一对一移植
 * ============================================================ */

function extractScore(text: string): number | null {
  const patterns = [
    // P1: 计算公式 — **总分：A + B + C = 40 分** 或 **= 51** (V6 "分" 字可选)
    /总分[^=\n]*?=\s*(\d+)(?:\s*分)?/,
    // P2: /100 格式
    /\*\*总分[：:]\s*(\d+)\/100\*\*/,
    /总分[：:]\s*(\d+)\/100/,
    /\*\*(\d+)\/100\*\*/,
    // P3: 表格格式 — | **总分** | **31 分** |
    /\|\s*\*?\*?总分\*?\*?\s*\|\s*\*?\*?(\d+)\s*分?\*?\*?\s*\|/,
    // P4: 内联求和 — = **32分**
    /=\s*\*\*(\d+)分?\*\*/,
    // P5: 粗体简单格式 — **总分：15 分**
    /\*\*总分[：:]\s*(\d+)\s*分\*\*/,
    // P6: 粗体无分母 — **总分: 53**
    /\*\*总分[：:]\s*(\d+)\*\*/,
    // P7: 纯文本 — 总分: 53 (排除公式格式 "总分：10 + 15...", (?!\d) 防回溯)
    /总分[：:]\s*(\d+)(?!\d)(?!\s*[+\-])/,
    // P8: 括号内分数 — 不交易（30分）/ 交易(85分)
    /[（(](\d+)\s*分[）)]/,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) {
      const score = parseInt(m[1], 10);
      if (score >= 0 && score <= 100) return score;
    }
  }
  // 负数格式 "-1 → 0" 表示 Agent 拒绝交易
  if (/总分.*-\d+\s*→?\s*0/.test(text)) return 0;
  return null;
}

function extractDecision(text: string): 'trade' | 'no_trade' {
  // 「决定交易」是明确结论，优先匹配
  if (text.includes('决定交易') || text.includes('执行交易')) {
    if (text.includes('假设强行') || text.includes('假设做')) {
      return 'no_trade';
    }
    return 'trade';
  }
  if (text.includes('不交易') || text.includes('观望')) {
    return 'no_trade';
  }
  if (text.includes('做多') || text.includes('做空')) {
    if (text.includes('假设强行') || text.includes('假设做')) {
      return 'no_trade';
    }
    return 'trade';
  }
  return 'no_trade';
}

function extractDirectionJudgment(text: string): 'up' | 'down' | 'neutral' {
  // 策略 1: 优先从摘要表格提取 — | AI 方向 | XXX |
  const summaryPat = /\|\s*\*?\*?AI\s*方向\*?\*?\s*\|\s*([^|]+)\|/;
  const summaryMatch = text.match(summaryPat);
  if (summaryMatch) {
    const val = summaryMatch[1].trim();
    if (/不确定|过渡期|中性|不明|混乱/.test(val)) return 'neutral';
    if (/AIL|看多|偏多|多头/.test(val)) return 'up';
    if (/AIS|看空|偏空|空头/.test(val)) return 'down';
  }

  // 策略 2: 在 Step 2.B 的 "Always-In 方向" 段落分析
  // 查找最后一个 Always-In 方向段落（Step 2，非 Step 1 的 4h 背景）
  const aiPattern = /(?:###?\s*B\.|Always-In\s*方向|AI\s*方向)/g;
  let aiIdx = -1;
  let aiMatch: RegExpExecArray | null;
  while ((aiMatch = aiPattern.exec(text)) !== null) {
    aiIdx = aiMatch.index;
  }
  const section = aiIdx >= 0 ? text.slice(aiIdx, aiIdx + 400) : '';

  // 在目标段落中判断 — 方向关键词优先于 neutral 关键词
  const target = section || text;
  const upKws = ['AIL', '看多', 'Always-In Long', '偏多', '看涨', '多头', '做多'];
  const downKws = ['AIS', '看空', 'Always-In Short', '偏空', '看跌', '空头', '做空'];

  const hasUp = upKws.some(kw => target.includes(kw));
  const hasDown = downKws.some(kw => target.includes(kw));

  if (hasUp && !hasDown) return 'up';
  if (hasDown && !hasUp) return 'down';
  if (hasUp && hasDown) {
    const lastUp = Math.max(...upKws.map(kw => target.lastIndexOf(kw)));
    const lastDown = Math.max(...downKws.map(kw => target.lastIndexOf(kw)));
    return lastDown > lastUp ? 'down' : 'up';
  }

  // 没有明确方向关键词时才判 neutral
  const neutralKws = ['不明', '中性', '混乱', 'Neutral', '不确定', '过渡期', '无明确方向'];
  if (section && neutralKws.some(kw => section.includes(kw))) {
    return 'neutral';
  }
  return 'neutral';
}

function extractMarketStateJudgment(text: string): string {
  const states: Record<string, string[]> = {
    'Spike': ['Spike', 'spike', '急速'],
    'Tight Channel': ['Tight Channel', 'tight channel', '紧密通道', 'TC'],
    'Broad Channel': ['Broad Channel', 'broad channel', '宽通道', 'BC'],
    'Trading Range': ['Trading Range', 'trading range', '震荡', '区间', 'TR'],
    'Climax': ['Climax', 'climax', '穷尽'],
  };
  for (const [state, keywords] of Object.entries(states)) {
    for (const kw of keywords) {
      if (text.includes(kw)) return state;
    }
  }
  return 'Unknown';
}

/* ============================================================
 * V5.1 新增提取函数 — 知识覆盖 + 评分细分 + 执行质量
 * ============================================================ */

// 知识概念分类（对应 10 个 reference 文件的核心概念）
const KNOWLEDGE_CATEGORIES: Record<string, string[]> = {
  market_state: [
    'Spike', 'spike', '急速', 'Tight Channel', 'tight channel', 'TC', '紧密通道',
    'Broad Channel', 'broad channel', 'BC', '宽通道',
    'Trading Range', 'trading range', 'TR', '震荡区间',
    'Climax', 'climax', '穷尽', 'MTR', 'Major Trend Reversal', '主要趋势反转',
  ],
  entries: [
    'H1', 'L1', 'H2', 'L2', 'H3', 'L3', 'H4', 'L4',
    'DT', 'DB', 'Double Top', 'Double Bottom', '双重顶', '双重底',
    'Wedge', 'wedge', '楔形', 'MAG', 'Measured Move', '等距移动',
    'ii', 'oo', 'ioi', 'BTC', 'Breakout', 'Failed Breakout', '突破失败',
    'Gap', 'gap', '缺口',
  ],
  analysis: [
    'Always-In', 'always-in', 'AI方向',
    'Trader.*Equation', '交易者方程', '期望值',
    'Context', 'context', '上下文',
    'Pressure', 'pressure', '买压', '卖压',
    'EMA', 'ema', '均线',
    '信号K线', 'signal bar', 'Signal Bar',
    '主导特征', 'dominant',
  ],
  management: [
    '止损', 'stop', 'Stop', 'SL',
    '目标', 'target', 'Target', 'TP',
    '盈亏比', 'RR', 'Risk.*Reward',
    'Scale', 'scale', '加仓', '减仓',
    'Trailing', 'trailing', '移动止损',
    'Time.*stop', '时间止损',
  ],
};

function extractKnowledgeCoverage(text: string): {
  total_pct: number;
  by_category: Record<string, { found: number; total: number; pct: number; concepts: string[] }>;
} {
  const result: Record<string, { found: number; total: number; pct: number; concepts: string[] }> = {};
  let totalFound = 0;
  let totalPossible = 0;

  for (const [cat, keywords] of Object.entries(KNOWLEDGE_CATEGORIES)) {
    const foundConcepts: string[] = [];
    // 去重：有些关键词是同义词，按"概念组"计算
    const conceptGroups = groupKeywords(keywords);
    let groupsFound = 0;
    for (const group of conceptGroups) {
      const matched = group.some(kw => {
        if (kw.includes('.*')) {
          return new RegExp(kw, 'i').test(text);
        }
        return text.includes(kw);
      });
      if (matched) {
        groupsFound++;
        foundConcepts.push(group[0]); // 用第一个关键词代表
      }
    }
    result[cat] = {
      found: groupsFound,
      total: conceptGroups.length,
      pct: conceptGroups.length > 0 ? Math.round((groupsFound / conceptGroups.length) * 100) : 0,
      concepts: foundConcepts,
    };
    totalFound += groupsFound;
    totalPossible += conceptGroups.length;
  }

  return {
    total_pct: totalPossible > 0 ? Math.round((totalFound / totalPossible) * 100) : 0,
    by_category: result,
  };
}

// 将同义关键词分组（相邻的中英文/缩写视为同一概念）
function groupKeywords(keywords: string[]): string[][] {
  const groups: string[][] = [];
  let current: string[] = [];
  for (const kw of keywords) {
    current.push(kw);
    // 每个概念通常 2-3 个同义词，遇到大写开头的新概念就分组
    if (current.length >= 2 && /^[A-Z\u4e00-\u9fff]/.test(kw) && current.length > 1) {
      // 简单策略：按固定数量分组
    }
  }
  // 更好的方式：按语义手动分组
  // 市场状态
  if (keywords === KNOWLEDGE_CATEGORIES.market_state) {
    return [
      ['Spike', 'spike', '急速'],
      ['Tight Channel', 'tight channel', 'TC', '紧密通道'],
      ['Broad Channel', 'broad channel', 'BC', '宽通道'],
      ['Trading Range', 'trading range', 'TR', '震荡区间'],
      ['Climax', 'climax', '穷尽'],
      ['MTR', 'Major Trend Reversal', '主要趋势反转'],
    ];
  }
  if (keywords === KNOWLEDGE_CATEGORIES.entries) {
    return [
      ['H1', 'L1'], ['H2', 'L2'], ['H3', 'L3', 'H4', 'L4'],
      ['DT', 'DB', 'Double Top', 'Double Bottom', '双重顶', '双重底'],
      ['Wedge', 'wedge', '楔形'],
      ['MAG', 'Measured Move', '等距移动'],
      ['ii', 'oo', 'ioi'],
      ['BTC', 'Breakout', 'Failed Breakout', '突破失败'],
      ['Gap', 'gap', '缺口'],
    ];
  }
  if (keywords === KNOWLEDGE_CATEGORIES.analysis) {
    return [
      ['Always-In', 'always-in', 'AI方向'],
      ['Trader.*Equation', '交易者方程', '期望值'],
      ['Context', 'context', '上下文'],
      ['Pressure', 'pressure', '买压', '卖压'],
      ['EMA', 'ema', '均线'],
      ['信号K线', 'signal bar', 'Signal Bar'],
      ['主导特征', 'dominant'],
    ];
  }
  if (keywords === KNOWLEDGE_CATEGORIES.management) {
    return [
      ['止损', 'stop', 'Stop', 'SL'],
      ['目标', 'target', 'Target', 'TP'],
      ['盈亏比', 'RR', 'Risk.*Reward'],
      ['Scale', 'scale', '加仓', '减仓'],
      ['Trailing', 'trailing', '移动止损'],
      ['Time.*stop', '时间止损'],
    ];
  }
  // fallback: each keyword is its own group
  return keywords.map(k => [k]);
}

interface ScoringBreakdown {
  trend: number | null;       // 趋势强度 0-20
  signal: number | null;      // 信号质量 0-20
  strategy: number | null;    // 策略匹配 0-25
  rr: number | null;          // 盈亏比 0-20
  risk: number | null;        // 风险因素 0-15
  backtest_bonus: number | null;
  forced_deduction: number | null;
}

function extractScoringBreakdown(text: string): ScoringBreakdown | null {
  const result: ScoringBreakdown = {
    trend: null, signal: null, strategy: null,
    rr: null, risk: null, backtest_bonus: null, forced_deduction: null,
  };

  // Agent 用两种格式写评分:
  // 格式A: | 趋势强度 (0-20) | 17 | reason |   → 纯数字
  // 格式B: | **趋势强度** | 6/20 | reason |      → 分数/满分
  // 格式C: 趋势强度: 17  理由: xxx               → 纯文本

  function matchDim(label: string, maxVal: number): number | null {
    // 表格格式A: | label (0-N) | 数字 |
    const patA = new RegExp(`\\|\\s*\\*?\\*?${label}[^|]*\\|\\s*(\\d+)\\s*\\|`);
    const mA = text.match(patA);
    if (mA) return Math.min(parseInt(mA[1], 10), maxVal);

    // 表格格式B: | label | 数字/满分 |
    const patB = new RegExp(`\\|\\s*\\*?\\*?${label}\\*?\\*?\\s*\\|\\s*(\\d+)/${maxVal}`);
    const mB = text.match(patB);
    if (mB) return Math.min(parseInt(mB[1], 10), maxVal);

    // 纯文本格式C: label: 数字
    const patC = new RegExp(`${label}[^:：\\d]*[：:]\\s*(\\d+)`);
    const mC = text.match(patC);
    if (mC) return Math.min(parseInt(mC[1], 10), maxVal);

    return null;
  }

  result.trend = matchDim('趋势强度', 20);
  result.signal = matchDim('信号质量', 20);
  result.strategy = matchDim('策略匹配', 25);
  result.rr = matchDim('盈亏比', 20);
  result.risk = matchDim('风险因素', 15);

  // 回测验证加分: | 回测验证加分 | +8 | 或 | 回测验证加分 | 0 |
  const btTableMatch = text.match(/\|\s*\*?\*?回测验证[^|]*\|\s*[+＋]?(\d+)\s*\|/);
  if (btTableMatch) result.backtest_bonus = parseInt(btTableMatch[1], 10);
  else {
    const btTextMatch = text.match(/回测验证[^:：\d]*[：:]\s*[+＋]?(\d+)/);
    if (btTextMatch) result.backtest_bonus = parseInt(btTextMatch[1], 10);
  }

  // 强制扣分: | 强制扣分 | -5 | 或 | 强制扣分 | 0 |
  const dedTableMatch = text.match(/\|\s*\*?\*?强制扣分[^|]*\|\s*[-－]?(\d+)\s*\|/);
  if (dedTableMatch) result.forced_deduction = parseInt(dedTableMatch[1], 10);
  else {
    const dedTextMatch = text.match(/强制扣分[^:：\d]*[：:]\s*[-－]?(\d+)/);
    if (dedTextMatch) result.forced_deduction = parseInt(dedTextMatch[1], 10);
  }

  // 至少提取到 2 个维度才算有效
  const filled = [result.trend, result.signal, result.strategy, result.rr, result.risk]
    .filter(v => v !== null).length;
  return filled >= 2 ? result : null;
}

interface ExecutionQuality {
  has_entry: boolean;      // 有明确入场价
  has_sl: boolean;         // 有止损价
  has_tp: boolean;         // 有目标价
  has_rr: boolean;         // 有盈亏比
  backtest_ref: boolean;   // 引用了回测数据
  prob_table_ref: boolean; // 引用了概率速查表
  completeness: number;    // 0-100
}

function extractExecutionQuality(text: string): ExecutionQuality {
  const hasEntry = /入场[：:价位]?\s*[\d$]|entry[：:]\s*\d/i.test(text) ||
    /做[多空].*[\d$]/.test(text);
  const hasSl = /止损[：:价位]?\s*[\d$]|stop.*loss[：:]\s*\d|SL[：:]\s*\d/i.test(text);
  const hasTp = /目标[：:价位]?\s*[\d$]|target[：:]\s*\d|TP[：:]\s*\d/i.test(text) ||
    /目标位/.test(text);
  const hasRr = /盈亏比[：:]\s*[\d.]|RR[：:]\s*[\d.]/i.test(text) ||
    /[1-9]:[1-9]/.test(text) || /[1-9]R/.test(text);
  const backtestRef = /回测.*(?:胜率|WR|PF|profit)/i.test(text) ||
    /回测验证[^:：]*[：:]\s*[+＋]?\d/.test(text);
  const probRef = /概率速查|概率表|Win Rate.*%/.test(text) ||
    /H1.*TC.*\d+%|L1.*TC.*\d+%/.test(text);

  const checks = [hasEntry, hasSl, hasTp, hasRr, backtestRef, probRef];
  const completeness = Math.round((checks.filter(Boolean).length / checks.length) * 100);

  return {
    has_entry: hasEntry,
    has_sl: hasSl,
    has_tp: hasTp,
    has_rr: hasRr,
    backtest_ref: backtestRef,
    prob_table_ref: probRef,
    completeness,
  };
}

function extractRound2Assessment(text: string): 'correct' | 'partial' | 'wrong' {
  const assessments: Record<string, string[]> = {
    correct: ['✅', '正确', '基本正确'],
    partial: ['⚠️', '偏差', '部分正确'],
    wrong: ['❌', '错误', '完全错误'],
  };
  const counts: Record<string, number> = { correct: 0, partial: 0, wrong: 0 };
  for (const [k, markers] of Object.entries(assessments)) {
    for (const m of markers) {
      const regex = new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      const matches = text.match(regex);
      counts[k] += matches ? matches.length : 0;
    }
  }
  if (counts.correct > counts.wrong) return 'correct';
  if (counts.wrong > counts.correct) return 'wrong';
  return 'partial';
}

/* ============================================================
 * V6 新增: 技能掌握度提取
 * ============================================================ */

function extractSkillSelfScores(text: string, taxonomy: Taxonomy): Record<string, number> {
  const scores: Record<string, number> = {};

  // Step 1: 提取所有 "| 技能名 | N/5 | 理由 |" 行
  const rowPattern = /\|\s*([^|]+?)\s*\|\s*(\d)\s*[/／]\s*5\s*\|/g;
  const rows: { name: string; score: number }[] = [];
  let match;
  while ((match = rowPattern.exec(text)) !== null) {
    const name = match[1].replace(/\*\*/g, '').trim();
    const score = parseInt(match[2], 10);
    // 排除表头行
    if (score >= 0 && score <= 5 && name !== '技能' && !name.includes('---') && !name.includes('自评')) {
      rows.push({ name, score });
    }
  }

  // Step 2: 每行模糊匹配到 taxonomy 技能
  for (const row of rows) {
    let bestSkill: TaxonomySkill | null = null;
    let bestMatchLen = 0;

    const normRow = row.name.replace(/\s+/g, '');

    for (const skill of taxonomy.skills) {
      const normSkill = skill.name.replace(/\s+/g, '');

      // 精确匹配
      if (normRow === normSkill) {
        bestSkill = skill;
        break;
      }
      // 子串匹配: "策略选择" 匹配 "策略选择匹配", "Climax识别" 匹配 "Climax 识别"
      if (normRow.includes(normSkill) || normSkill.includes(normRow)) {
        const overlap = Math.min(normRow.length, normSkill.length);
        if (overlap > bestMatchLen) {
          bestSkill = skill;
          bestMatchLen = overlap;
        }
      }
    }

    if (bestSkill) {
      scores[bestSkill.id] = Math.min(row.score, 5);
    }
  }

  return scores;
}

function extractSkillMastery(
  r1: string,
  r2: string,
  testedSkills: string[],
  taxonomy: Taxonomy,
): Record<string, number> {
  const mastery: Record<string, number> = {};

  // 1. 优先用 Agent 自评 (Round 2)
  const selfScores = extractSkillSelfScores(r2, taxonomy);

  // 2. 降级: 基于关键词出现判断
  for (const skill of taxonomy.skills) {
    if (!testedSkills.includes(skill.id)) continue;

    // 已有自评分数则转换为百分制
    if (selfScores[skill.id] !== undefined) {
      mastery[skill.id] = Math.round((selfScores[skill.id] / 5) * 100);
      continue;
    }

    // 关键词匹配: 在 Round 1 中搜索
    const combined = r1 + ' ' + r2;
    let matchCount = 0;
    for (const kw of skill.keywords) {
      if (combined.includes(kw)) matchCount++;
    }
    // 关键词覆盖率 → 掌握度
    const kwCoverage = skill.keywords.length > 0
      ? Math.round((matchCount / Math.min(skill.keywords.length, 3)) * 100)
      : 0;
    mastery[skill.id] = Math.min(kwCoverage, 100);
  }

  return mastery;
}

/* ============================================================
 * 辅助统计函数
 * ============================================================ */

function avgAndStd(values: number[]): { avg: number; std: number; count: number } {
  if (values.length === 0) return { avg: 0, std: 0, count: 0 };
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length;
  return {
    avg: Math.round(avg * 10) / 10,
    std: Math.round(Math.sqrt(variance) * 10) / 10,
    count: values.length,
  };
}

function pct(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}

/* ============================================================
 * 日志数据结构
 * ============================================================ */

interface TrainingLog {
  scene_id: string;
  symbol: string;
  labels: {
    market_state: string;
    background: string;
    direction: string;
    change_pct: number;
  };
  tested_skills?: string[];
  round1_reply: string;
  round2_reply: string;
  session_id: string;
}

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

/* ============================================================
 * 主处理
 * ============================================================ */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sceneId = searchParams.get('scene');
  const version = searchParams.get('version');
  const LOGS_DIR = getLogsDir(version);

  if (!fs.existsSync(LOGS_DIR)) {
    // 列出可用版本
    const available = Object.entries(VERSION_DIRS)
      .filter(([, d]) => fs.existsSync(d))
      .map(([v]) => v);
    return NextResponse.json(
      { error: '训练日志目录不存在', path: LOGS_DIR, available_versions: available },
      { status: 404 }
    );
  }

  // 单场景模式
  if (sceneId) {
    const safeName = path.basename(sceneId);
    const filePath = path.join(LOGS_DIR, `${safeName}.json`);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: `场景不存在: ${safeName}` },
        { status: 404 }
      );
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const log: TrainingLog = JSON.parse(content);
      const r1 = log.round1_reply || '';
      const r2 = log.round2_reply || '';

      return NextResponse.json({
        id: log.scene_id,
        symbol: log.symbol,
        actual_state: log.labels.market_state,
        actual_dir: log.labels.direction,
        background: log.labels.background,
        change_pct: log.labels.change_pct,
        agent_dir: extractDirectionJudgment(r1),
        agent_state: extractMarketStateJudgment(r1),
        score: extractScore(r1),
        decision: extractDecision(r1),
        r2_assessment: extractRound2Assessment(r2),
        knowledge: extractKnowledgeCoverage(r1),
        scoring_breakdown: extractScoringBreakdown(r1),
        execution_quality: extractExecutionQuality(r1),
        round1_reply: r1,
        round2_reply: r2,
      });
    } catch {
      return NextResponse.json(
        { error: `解析失败: ${safeName}` },
        { status: 500 }
      );
    }
  }

  // 列表模式：读取所有日志并汇总
  try {
    const files = fs.readdirSync(LOGS_DIR)
      .filter(f => /^S\d+\.json$/.test(f))
      .sort();

    const details: SceneDetail[] = [];
    const scores: number[] = [];
    let traded = 0;
    let noTrade = 0;
    let directionCorrect = 0;
    let directionWrong = 0;
    let missedProfit = 0;
    let avoidedLoss = 0;
    let r2Correct = 0;
    let r2Partial = 0;
    let r2Wrong = 0;

    const bySymbol: Record<string, { total: number; correct: number; traded: number; dir_correct: number; dir_judged: number }> = {};
    const byState: Record<string, { total: number; agent_correct: number; agent_traded: number; dir_correct: number; dir_judged: number }> = {};

    // V5.1: 能力评估累加器
    const allKnowledge: ReturnType<typeof extractKnowledgeCoverage>[] = [];
    const allScoring: (ScoringBreakdown | null)[] = [];
    const allExecution: ExecutionQuality[] = [];

    // V6: 技能掌握度累加器
    const taxonomy = loadTaxonomy();
    const allSkillMastery: Record<string, number[]> = {};
    for (const skill of taxonomy.skills) {
      allSkillMastery[skill.id] = [];
    }

    for (const f of files) {
      try {
        const content = fs.readFileSync(path.join(LOGS_DIR, f), 'utf-8');
        const log: TrainingLog = JSON.parse(content);
        const r1 = log.round1_reply || '';
        const r2 = log.round2_reply || '';

        const score = extractScore(r1);
        const decision = extractDecision(r1);
        const agentDir = extractDirectionJudgment(r1);
        const agentState = extractMarketStateJudgment(r1);
        const actualDir = log.labels.direction;
        const actualState = log.labels.market_state;
        const symbol = log.symbol;
        const r2Assessment = extractRound2Assessment(r2);

        // V5.1: 提取新维度
        allKnowledge.push(extractKnowledgeCoverage(r1));
        allScoring.push(extractScoringBreakdown(r1));
        allExecution.push(extractExecutionQuality(r1));

        // V6: 技能掌握度
        const testedSkills = log.tested_skills || [];
        const mastery = extractSkillMastery(r1, r2, testedSkills, taxonomy);
        for (const [sid, score] of Object.entries(mastery)) {
          if (allSkillMastery[sid]) allSkillMastery[sid].push(score);
        }

        if (score !== null) scores.push(score);

        if (decision === 'trade') traded++;
        else noTrade++;

        // 方向准确率
        const dirMatch =
          (agentDir === 'up' && actualDir === 'up') ||
          (agentDir === 'down' && actualDir === 'down');

        if (agentDir !== 'neutral') {
          if (dirMatch) directionCorrect++;
          else directionWrong++;
        }

        // 错过盈利 / 规避亏损
        const isMissedProfit =
          decision === 'no_trade' &&
          agentDir !== 'neutral' &&
          dirMatch;

        if (decision === 'no_trade') {
          if (isMissedProfit) missedProfit++;
          else avoidedLoss++;
        }

        // R2 统计
        if (r2Assessment === 'correct') r2Correct++;
        else if (r2Assessment === 'partial') r2Partial++;
        else r2Wrong++;

        // 按品种（方向准确率替代 R2 自评）
        if (!bySymbol[symbol]) bySymbol[symbol] = { total: 0, correct: 0, traded: 0, dir_correct: 0, dir_judged: 0 };
        bySymbol[symbol].total++;
        if (r2Assessment === 'correct') bySymbol[symbol].correct++;
        if (decision === 'trade') bySymbol[symbol].traded++;
        if (agentDir !== 'neutral') {
          bySymbol[symbol].dir_judged++;
          if (dirMatch) bySymbol[symbol].dir_correct++;
        }

        // 按状态（方向准确率替代 R2 自评）
        if (!byState[actualState]) byState[actualState] = { total: 0, agent_correct: 0, agent_traded: 0, dir_correct: 0, dir_judged: 0 };
        byState[actualState].total++;
        if (r2Assessment === 'correct') byState[actualState].agent_correct++;
        if (decision === 'trade') byState[actualState].agent_traded++;
        if (agentDir !== 'neutral') {
          byState[actualState].dir_judged++;
          if (dirMatch) byState[actualState].dir_correct++;
        }

        details.push({
          id: log.scene_id,
          symbol,
          actual_state: actualState,
          actual_dir: actualDir,
          background: log.labels.background,
          change_pct: log.labels.change_pct,
          agent_dir: agentDir,
          agent_state: agentState,
          score,
          decision,
          r2_assessment: r2Assessment,
          missed_profit: isMissedProfit,
        });
      } catch {
        // 跳过解析失败的文件
      }
    }

    // 学习曲线
    const sorted = [...details].sort((a, b) => {
      const na = parseInt(a.id.slice(1), 10);
      const nb = parseInt(b.id.slice(1), 10);
      return na - nb;
    });

    // 自动生成学习曲线分组（适应任何场景范围）
    const sceneNums = sorted.map(d => parseInt(d.id.slice(1), 10));
    const minScene = Math.min(...sceneNums);
    const maxScene = Math.max(...sceneNums);
    const totalRange = maxScene - minScene + 1;
    const groupSize = Math.ceil(totalRange / 3);
    const groups = [
      { label: `前期 (S${String(minScene).padStart(3,'0')}-S${String(Math.min(minScene + groupSize - 1, maxScene)).padStart(3,'0')})`,
        range: [minScene, minScene + groupSize - 1] as [number, number] },
      { label: `中期 (S${String(minScene + groupSize).padStart(3,'0')}-S${String(Math.min(minScene + 2 * groupSize - 1, maxScene)).padStart(3,'0')})`,
        range: [minScene + groupSize, minScene + 2 * groupSize - 1] as [number, number] },
      { label: `后期 (S${String(minScene + 2 * groupSize).padStart(3,'0')}-S${String(maxScene).padStart(3,'0')})`,
        range: [minScene + 2 * groupSize, maxScene] as [number, number] },
    ];

    const learningCurve = groups.map(g => {
      const items = sorted.filter(d => {
        const n = parseInt(d.id.slice(1), 10);
        return n >= g.range[0] && n <= g.range[1];
      });
      const groupScores = items.map(d => d.score).filter((s): s is number => s !== null);
      const missed = items.filter(d => d.missed_profit).length;
      const groupTraded = items.filter(d => d.decision === 'trade').length;
      // 方向准确率（替代 R2 自评）
      const dirJudged = items.filter(d => d.agent_dir !== 'neutral');
      const dirCorrectCount = dirJudged.filter(d =>
        (d.agent_dir === 'up' && d.actual_dir === 'up') ||
        (d.agent_dir === 'down' && d.actual_dir === 'down')
      ).length;
      return {
        label: g.label,
        avg_score: groupScores.length > 0
          ? Math.round((groupScores.reduce((a, b) => a + b, 0) / groupScores.length) * 10) / 10
          : 0,
        direction_accuracy: dirJudged.length > 0
          ? Math.round((dirCorrectCount / dirJudged.length) * 100)
          : 0,
        traded: groupTraded,
        missed,
        count: items.length,
      };
    });

    const totalJudged = directionCorrect + directionWrong;

    // V5.1: 汇总能力评估
    // 知识覆盖 — 取所有场景的平均值
    const avgKnowledge = {
      total_pct: allKnowledge.length > 0
        ? Math.round(allKnowledge.reduce((s, k) => s + k.total_pct, 0) / allKnowledge.length)
        : 0,
      by_category: {} as Record<string, { avg_pct: number; top_concepts: string[] }>,
    };
    for (const cat of Object.keys(KNOWLEDGE_CATEGORIES)) {
      const catData = allKnowledge.map(k => k.by_category[cat]).filter(Boolean);
      const conceptFreq: Record<string, number> = {};
      for (const d of catData) {
        for (const c of d.concepts) {
          conceptFreq[c] = (conceptFreq[c] || 0) + 1;
        }
      }
      avgKnowledge.by_category[cat] = {
        avg_pct: catData.length > 0
          ? Math.round(catData.reduce((s, d) => s + d.pct, 0) / catData.length)
          : 0,
        top_concepts: Object.entries(conceptFreq)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([c]) => c),
      };
    }

    // 评分细分 — 各维度平均值和标准差
    const validScoring = allScoring.filter((s): s is ScoringBreakdown => s !== null);
    const scoringStats = {
      extracted: validScoring.length,
      trend: avgAndStd(validScoring.map(s => s.trend).filter((v): v is number => v !== null)),
      signal: avgAndStd(validScoring.map(s => s.signal).filter((v): v is number => v !== null)),
      strategy: avgAndStd(validScoring.map(s => s.strategy).filter((v): v is number => v !== null)),
      rr: avgAndStd(validScoring.map(s => s.rr).filter((v): v is number => v !== null)),
      risk: avgAndStd(validScoring.map(s => s.risk).filter((v): v is number => v !== null)),
      backtest_used: validScoring.filter(s => s.backtest_bonus !== null && s.backtest_bonus > 0).length,
    };

    // 执行质量 — 各项占比
    const execStats = {
      entry_rate: pct(allExecution.filter(e => e.has_entry).length, allExecution.length),
      sl_rate: pct(allExecution.filter(e => e.has_sl).length, allExecution.length),
      tp_rate: pct(allExecution.filter(e => e.has_tp).length, allExecution.length),
      rr_rate: pct(allExecution.filter(e => e.has_rr).length, allExecution.length),
      backtest_rate: pct(allExecution.filter(e => e.backtest_ref).length, allExecution.length),
      prob_table_rate: pct(allExecution.filter(e => e.prob_table_ref).length, allExecution.length),
      avg_completeness: allExecution.length > 0
        ? Math.round(allExecution.reduce((s, e) => s + e.completeness, 0) / allExecution.length)
        : 0,
    };

    // 检测当前版本
    const currentVersion = Object.entries(VERSION_DIRS)
      .find(([, d]) => d === LOGS_DIR)?.[0] || 'v3';
    const availableVersions = Object.entries(VERSION_DIRS)
      .filter(([, d]) => fs.existsSync(d) && fs.readdirSync(d).some(f => /^S\d+\.json$/.test(f)))
      .map(([v]) => v);

    return NextResponse.json({
      version: currentVersion,
      available_versions: availableVersions,
      summary: {
        total_scenes: details.length,
        traded,
        no_trade: noTrade,
        avg_score: scores.length > 0
          ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
          : 0,
        max_score: scores.length > 0 ? Math.max(...scores) : 0,
        min_score: scores.length > 0 ? Math.min(...scores) : 0,
        direction_accuracy: totalJudged > 0
          ? Math.round((directionCorrect / totalJudged) * 100)
          : 0,
        direction_correct: directionCorrect,
        direction_wrong: directionWrong,
        missed_profit: missedProfit,
        avoided_loss: avoidedLoss,
        fear_rate: (missedProfit + avoidedLoss) > 0
          ? Math.round((missedProfit / (missedProfit + avoidedLoss)) * 100)
          : 0,
        trade_rate: details.length > 0
          ? Math.round((traded / details.length) * 1000) / 10
          : 0,
        score_extracted: scores.length,
        r2_correct: r2Correct,
        r2_partial: r2Partial,
        r2_wrong: r2Wrong,
        learning_curve: learningCurve,
      },
      // V5.1: 能力评估维度
      ability: {
        knowledge: avgKnowledge,
        scoring: scoringStats,
        execution: execStats,
      },
      // V6: 38 技能掌握度
      skill_mastery: Object.fromEntries(
        taxonomy.skills.map(s => [
          s.id,
          {
            name: s.name,
            step: s.step,
            category: s.category,
            difficulty: s.difficulty,
            avg_score: allSkillMastery[s.id]?.length > 0
              ? Math.round(allSkillMastery[s.id].reduce((a, b) => a + b, 0) / allSkillMastery[s.id].length)
              : 0,
            scenes: allSkillMastery[s.id]?.length || 0,
          },
        ])
      ),
      weak_spots: taxonomy.skills
        .map(s => ({
          id: s.id,
          name: s.name,
          category: s.category,
          score: allSkillMastery[s.id]?.length > 0
            ? Math.round(allSkillMastery[s.id].reduce((a, b) => a + b, 0) / allSkillMastery[s.id].length)
            : 0,
          scenes: allSkillMastery[s.id]?.length || 0,
        }))
        .sort((a, b) => a.score - b.score)
        .slice(0, 8),
      by_symbol: bySymbol,
      by_state: byState,
      details,
    });
  } catch {
    return NextResponse.json(
      { error: '读取训练日志失败' },
      { status: 500 }
    );
  }
}
