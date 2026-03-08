"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Bot,
  Clock3,
  FileJson2,
  Radar,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

type RuntimeFull = {
  snapshot?: Record<string, any>;
  recent?: { items?: Array<Record<string, any>> };
  decision?: { decision?: Record<string, any> };
};

function trimText(value: unknown, limit = 180) {
  const text = displayText(value).replace(/\s+/g, " ").trim();
  if (!text) return "-";
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;
}

function displayText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => displayText(item)).filter(Boolean).join(" / ");
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const orderedKeys = ["regime", "daily_bias", "execution_decision", "risk"];
    const ordered = orderedKeys
      .map((key) => {
        const current = displayText(record[key]);
        return current ? `${key}: ${current}` : "";
      })
      .filter(Boolean);
    if (ordered.length > 0) return ordered.join(" ｜ ");
    return JSON.stringify(record, null, 2);
  }
  return String(value);
}

function phaseCn(value: unknown) {
  const mapping: Record<string, string> = {
    BOOTSTRAP: "初始化扫描",
    SCAN: "全市场扫描",
    WATCH: "观察阶段",
    PRE_SIGNAL: "预信号",
    ENTRY_READY: "临近触发",
    IN_TRADE: "持仓中",
    MANAGE: "管理持仓",
    EXIT: "退出阶段",
    COOLDOWN: "冷却期",
  };
  return mapping[String(value || "")] || String(value || "-");
}

function orderTypeCn(value: unknown) {
  const mapping: Record<string, string> = {
    LIMIT: "限价委托",
    STOP_MARKET: "止损触发委托",
    TAKE_PROFIT_MARKET: "止盈触发委托",
    MARKET: "市价执行",
  };
  return mapping[String(value || "").toUpperCase()] || String(value || "-");
}

function statusCn(value: unknown) {
  const mapping: Record<string, string> = {
    watching: "继续观察",
    pre_signal: "预信号观察",
    entry_ready: "满足入场",
    entry_ready_blocked: "临近可做但仍被规则拦住",
    in_trade: "持仓中",
    manage: "正在管理",
    cooldown: "冷却中",
  };
  return mapping[String(value || "")] || String(value || "-");
}

function marketStateCn(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return displayText(value);
  }
  const mapping: Record<string, string> = {
    TR: "区间",
    BO: "突破",
    TC: "紧通道",
    BC: "宽通道",
    SC: "高潮反转",
  };
  return mapping[String(value || "").toUpperCase()] || String(value || "-");
}

function cycleFreshness(snapshot: Record<string, any>) {
  if (snapshot?.cycle_fresh === true) return "新鲜";
  if (snapshot?.cycle_fresh === false) return "陈旧";
  return "待确认";
}

function directionText(value: unknown) {
  if (typeof value === "string") return value || "-";
  return displayText(value) || "-";
}

function symbolEntries(decision: Record<string, any>) {
  return Object.entries((decision?.symbol_updates || {}) as Record<string, any>).slice(0, 3);
}

function plannedTradeBadge(patch: Record<string, any>) {
  const planned = patch?.planned_trade || {};
  const stage = displayText(planned?.candidate_stage_cn || patch?.entry_idea?.candidate_stage_cn);
  const mode = displayText(planned?.execution_mode_cn || patch?.entry_idea?.execution_mode_cn);
  const orderType = orderTypeCn(planned?.order_type);
  return [stage, mode, orderType].filter((item) => item && item !== "-").join(" ｜ ") || "-";
}

function latestAnalysisBoard(snapshot: Record<string, any>) {
  const latestCycle = snapshot?.latest_cycle || {};
  return (latestCycle?.analysis_board || {}) as Record<string, any>;
}

function actionForSymbol(decision: Record<string, any>, symbol: string) {
  const actions = Array.isArray(decision?.actions) ? decision.actions : [];
  return actions.find((item) => String(item?.symbol || "").toUpperCase() === symbol) || {};
}

function refsText(decision: Record<string, any>) {
  const promptRefs = decision?.state_patch?.prompt_references;
  if (Array.isArray(promptRefs) && promptRefs.length) return promptRefs.join(", ");
  const refs = new Set<string>();
  const actions = Array.isArray(decision?.actions) ? decision.actions : [];
  actions.forEach((item) => {
    const current = item?.refs;
    if (Array.isArray(current)) current.forEach((ref) => refs.add(String(ref)));
  });
  return Array.from(refs).join(", ") || "-";
}

function knowledgeText(decision: Record<string, any>) {
  const meta = decision?.state_patch?.knowledge_loading || {};
  return `skill=${meta.skill_mode || "-"} | refs完整=${meta.full_reference_count || 0}`;
}

function skillSectionsText(decision: Record<string, any>) {
  const sections = decision?.state_patch?.knowledge_loading?.skill_sections;
  if (!Array.isArray(sections) || sections.length === 0) return "-";
  return sections.join(" / ");
}

function summaryText(decision: Record<string, any>, runtime: Record<string, any>) {
  const summary = decision?.market_summary ?? runtime?.last_scan_decision;
  return trimText(summary, 260);
}

export default function PABotPage() {
  const [data, setData] = useState<RuntimeFull>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");

  async function load() {
    try {
      const res = await fetch("/api/runtime/full", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setUpdatedAt(new Date().toLocaleString("zh-CN"));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, []);

  const snapshot = data.snapshot || {};
  const runtime = snapshot.runtime || {};
  const execution = snapshot.execution || {};
  const nextScan = snapshot.next_scan || {};
  const latestDecision = data.decision?.decision || {};
  const recentItems = data.recent?.items || [];
  const symbols = useMemo(() => symbolEntries(latestDecision), [latestDecision]);
  const analysisBoard = useMemo(() => latestAnalysisBoard(snapshot), [snapshot]);
  const chartSymbols = useMemo(() => {
    const focus = Array.isArray(runtime.focus_symbols) ? runtime.focus_symbols : [];
    const keys = Object.keys(analysisBoard || {});
    const ordered = [...focus, ...keys].filter((value, index, arr) => value && arr.indexOf(value) === index);
    return ordered.slice(0, 3);
  }, [analysisBoard, runtime.focus_symbols]);

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.12),transparent_40%),linear-gradient(180deg,rgba(15,23,42,0.88),rgba(2,6,23,0.94))] p-6 shadow-[0_30px_80px_rgba(2,6,23,0.45)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3 text-amber-300">
                <Bot className="h-6 w-6" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-amber-300/80">AB Patrol-Agent</div>
                <h1 className="mt-1 text-3xl font-semibold text-white">PA交易 Crypto</h1>
              </div>
            </div>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400">
              统一交易员视图：TG 卡片和 Web 看板使用同一套字段、顺序和术语，直接查看当前阶段、
              重点品种、巡逻结论、下一次扫描和知识加载方式。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm font-medium text-slate-100 transition hover:border-amber-400 hover:text-amber-200"
              onClick={load}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              刷新数据
            </button>
            <Link
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm font-medium text-slate-100 transition hover:border-sky-400 hover:text-sky-200"
              href="http://127.0.0.1:8086/api/v1/runtime/full"
              target="_blank"
            >
              打开 Query JSON
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/65 p-4">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-500">当前阶段</div>
            <div className="mt-2 text-2xl font-semibold text-white">{phaseCn(runtime.current_phase || latestDecision.phase)}</div>
            <div className="mt-2 text-sm text-slate-400">{(runtime.focus_symbols || []).join(" / ") || "-"}</div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/65 p-4">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-500">当前可交易</div>
            <div className="mt-2 text-2xl font-semibold text-white">{execution?.can_trade?.can_trade ? "可以" : "不可以"}</div>
            <div className="mt-2 text-sm text-slate-400">{displayText(execution?.can_trade?.reason) || "OK"}</div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/65 p-4">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-500">持仓 / 挂单</div>
            <div className="mt-2 text-2xl font-semibold text-white">
              {(execution.positions || []).length} / {(execution.orders || []).length}
            </div>
            <div className="mt-2 text-sm text-slate-400">dry-run: {String(runtime.dry_run ?? true)}</div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/65 p-4">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-500">总体健康 / 新鲜度</div>
            <div className="mt-2 text-2xl font-semibold text-white">{snapshot.overall_health || "-"}</div>
            <div className="mt-2 text-sm text-slate-400">
              {cycleFreshness(snapshot)} / {snapshot.stale_but_running ? "stale-but-running" : "正常"}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.28fr_0.72fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-slate-500">
              <Radar className="h-4 w-4" />
              巡逻结论
            </div>
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-5 text-sm leading-8 text-slate-300">
              {summaryText(latestDecision, runtime) || "暂无摘要"}
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            {symbols.length === 0 ? (
              <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 text-sm text-slate-400">
                暂无重点品种数据
              </div>
            ) : (
              symbols.map(([symbol, patch]) => {
                const action = actionForSymbol(latestDecision, symbol);
                const equation =
                  action?.equation ||
                  patch?.evaluation?.equation ||
                  patch?.trade?.equation ||
                  "-";
                const entryIdea =
                  patch?.entry_idea?.summary ||
                  patch?.entry_idea?.setup ||
                  patch?.brooks_filter?.summary ||
                  action?.reason ||
                  "-";
                const filterLabel =
                  patch?.brooks_filter?.label ||
                  patch?.evaluation?.regime ||
                  "-";
                const executionBadge = plannedTradeBadge(patch);
                return (
                  <article key={symbol} className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
                    <div className="flex items-center justify-between">
                      <div className="text-lg font-semibold text-white">{symbol}</div>
                      <div className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
                        {statusCn(patch?.status)}
                      </div>
                    </div>
                      <div className="mt-3 text-xs uppercase tracking-[0.22em] text-slate-500">
                        {directionText(patch?.ai_direction)} / {marketStateCn(patch?.market_state)}
                    </div>
                    <div className="mt-4 space-y-3 text-sm leading-7 text-slate-300">
                      <div><span className="text-slate-500">结构:</span> {trimText(patch?.structure_summary || patch?.thesis, 160)}</div>
                      <div><span className="text-slate-500">预信号:</span> {trimText(patch?.pre_signal || patch?.signal, 120)}</div>
                      <div><span className="text-slate-500">执行语义:</span> {trimText(executionBadge, 120)}</div>
                      <div><span className="text-slate-500">Trader&apos;s Equation:</span> {trimText(equation, 120)}</div>
                      <div><span className="text-slate-500">Brooks分类:</span> {trimText(filterLabel, 120)}</div>
                      <div><span className="text-slate-500">候选动作:</span> {trimText(entryIdea, 140)}</div>
                    </div>
                  </article>
                );
              })
            )}
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-slate-500">
              <Activity className="h-4 w-4" />
              最近巡逻
            </div>
            <div className="mt-4 grid gap-3">
              {recentItems.length === 0 ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-400">
                  暂无 recent cycles
                </div>
              ) : (
                recentItems.slice(0, 5).map((item) => (
                  <div key={item.cycle_id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-white">{item.cycle_id}</div>
                      <div className="text-xs text-slate-500">{phaseCn(item.phase)} / {item.next_scan_seconds || "-"}s</div>
                    </div>
                    <div className="mt-2 text-xs text-slate-500">{(item.focus_symbols || []).join(" / ") || "-"}</div>
                    <div className="mt-3 text-sm leading-6 text-slate-300">{trimText(item.market_summary, 180)}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-slate-500">
              <Radar className="h-4 w-4" />
              图表绑定
            </div>
            <div className="mt-4 grid gap-4">
              {chartSymbols.length === 0 ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-400">
                  当前 cycle 没有可展示的图表上下文
                </div>
              ) : (
                chartSymbols.map((symbol) => {
                  const board = analysisBoard?.[symbol] || {};
                  const chartContext = board?.chart_context || {};
                  const apiPaths = Array.isArray(chartContext?.chart_api_paths) ? chartContext.chart_api_paths : [];
                  const chartFiles = Array.isArray(chartContext?.chart_files) ? chartContext.chart_files : [];
                  return (
                    <article key={symbol} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-base font-semibold text-white">{symbol}</div>
                        <div className="text-xs text-slate-500">{chartContext?.latest_generated_at || "图表时间未知"}</div>
                      </div>
                      <div className="mt-2 text-sm leading-6 text-slate-400">
                        {trimText(chartContext?.chart_note, 120)}
                      </div>
                      <div className="mt-2 text-xs text-amber-300">
                        {(chartFiles || []).join(" / ") || "当前没有图表文件"}
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {apiPaths.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/70 p-4 text-sm text-slate-500">
                            图表尚未生成
                          </div>
                        ) : (
                          apiPaths.slice(0, 4).map((path: string, index: number) => (
                            <div key={`${symbol}-${path}-${index}`} className="overflow-hidden rounded-2xl border border-slate-800 bg-[#030712]">
                              <img
                                src={path}
                                alt={`${symbol} 图表 ${index + 1}`}
                                className="h-auto w-full object-cover"
                              />
                            </div>
                          ))
                        )}
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-slate-500">
              <FileJson2 className="h-4 w-4" />
              原始决策 JSON
            </div>
            <details className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
              <summary className="cursor-pointer text-sm font-medium text-slate-200">展开原始结构化输出</summary>
              <pre className="mt-4 max-h-[640px] overflow-auto rounded-2xl bg-[#040b14] p-4 text-xs leading-6 text-slate-200">
                {JSON.stringify(latestDecision, null, 2)}
              </pre>
            </details>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-slate-500">
              <ShieldCheck className="h-4 w-4" />
              当前状态
            </div>
            <div className="mt-4 space-y-3 text-sm leading-7 text-slate-300">
              <p>轮次: <code className="text-amber-300">{runtime.last_cycle_id || "-"}</code></p>
              <p>阶段: <code className="text-amber-300">{phaseCn(runtime.current_phase || latestDecision.phase)}</code></p>
              <p>关注品种: <code className="text-amber-300">{(runtime.focus_symbols || []).join(", ") || "-"}</code></p>
              <p>读盘窗口: <code className="text-amber-300">150 根 / 浏览 80 根 / 精读 20 根</code></p>
              <p>Cycle 年龄: <code className="text-amber-300">{snapshot.latest_cycle_age_seconds ?? "-"} 秒</code></p>
              <p>最近成功: <code className="text-amber-300">{snapshot.last_success_at || "-"}</code></p>
              <p>最近失败: <code className="text-amber-300">{snapshot.last_failure_at || "-"}</code></p>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-slate-500">
              <Clock3 className="h-4 w-4" />
              下一次扫描
            </div>
            <div className="mt-4 space-y-3 text-sm leading-7 text-slate-300">
              <p>倒计时: <code className="text-amber-300">{nextScan.in_seconds || "-"} 秒</code></p>
              <p>原因: <code className="text-amber-300">{displayText(nextScan.reason_text || nextScan.reason_code) || "-"}</code></p>
              <p>失败摘要: <code className="text-amber-300">{trimText(snapshot.last_failure_reason, 120)}</code></p>
              <p>更新于: <code className="text-amber-300">{updatedAt || "-"}</code></p>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-slate-500">
              <Bot className="h-4 w-4" />
              调试信息
            </div>
            <div className="mt-4 space-y-3 text-sm leading-7 text-slate-300">
              <p>参考文件: <code className="text-amber-300">{refsText(latestDecision)}</code></p>
              <p>知识加载: <code className="text-amber-300">{knowledgeText(latestDecision)}</code></p>
              <p>Skill章节: <code className="text-amber-300">{skillSectionsText(latestDecision)}</code></p>
              <p>skill 原文: <code className="text-amber-300">AB Patrol-Agent/knowledge/patrol-l1/SKILL.md</code></p>
              <p>S 文件目录: <code className="text-amber-300">AB Patrol-Agent/knowledge/patrol-l1/references</code></p>
              <p>最新 prompt: <code className="text-amber-300">AB Patrol-Agent/data/pa_trader/logs/decision/last_request.md</code></p>
            </div>
          </div>

          {error ? (
            <div className="rounded-3xl border border-rose-500/30 bg-rose-500/10 p-5 text-sm text-rose-200">
              {error}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
