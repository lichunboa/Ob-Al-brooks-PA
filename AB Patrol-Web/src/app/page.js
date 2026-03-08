"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Bell,
  CandlestickChart,
  Database,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
  WalletCards,
} from "lucide-react";

const QUICK_LINKS = [
  { href: "/pa-bot", label: "PA交易 Crypto", desc: "Al Brooks 巡逻总览、重点品种与最新决策", icon: ShieldCheck },
  { href: "/execution", label: "交易总览", desc: "执行状态、分配、Bot 概况", icon: WalletCards },
  { href: "/chart", label: "K线图表", desc: "图表与市场结构观察入口", icon: CandlestickChart },
  { href: "/scanner", label: "市场扫描", desc: "扫描结果与监控入口", icon: ScanSearch },
  { href: "/signals", label: "信号监控", desc: "规则信号与告警视图", icon: Bell },
  { href: "/data-overview", label: "数据总览", desc: "采集、库表与数据健康", icon: Database },
];

function prettyStatus(ok) {
  if (ok === true) return { text: "运行中", tone: "emerald" };
  if (ok === false) return { text: "未运行", tone: "rose" };
  return { text: "待确认", tone: "amber" };
}

function cycleFreshness(snapshot) {
  if (snapshot?.cycle_fresh === true) return "新鲜";
  if (snapshot?.cycle_fresh === false) return "陈旧";
  return "待确认";
}

function trimText(value, limit = 180) {
  const text = String(value ?? "").trim();
  if (!text) return "-";
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trim()}…`;
}

function displayText(value, limit = 180) {
  if (value == null || value === "") return "-";
  if (Array.isArray(value)) {
    return value.length ? trimText(value.join(" / "), limit) : "-";
  }
  if (typeof value === "object") {
    const dict = value;
    const preferred = [
      dict.summary,
      dict.decision,
      dict.value,
      dict.detail,
      dict.execution_decision,
      dict.market_state,
      dict.daily_bias,
      dict.regime,
      dict.reason,
      dict.status,
    ].find((item) => item != null && item !== "");
    if (preferred != null && typeof preferred !== "object") {
      return trimText(preferred, limit);
    }
    try {
      return trimText(JSON.stringify(value, null, 2), limit);
    } catch {
      return "-";
    }
  }
  return trimText(value, limit);
}

function symbolCards(decision) {
  const updates = decision?.symbol_updates || {};
  return Object.entries(updates).slice(0, 3);
}

export default function HomePage() {
  const [data, setData] = useState(null);
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

  const snapshot = data?.snapshot || {};
  const runtime = snapshot.runtime || {};
  const execution = snapshot.execution || {};
  const latestDecision = data?.decision?.decision || {};
  const recentItems = data?.recent?.items || [];
  const focusSymbols = runtime.focus_symbols || latestDecision.focus_symbols || [];
  const cards = useMemo(() => symbolCards(latestDecision), [latestDecision]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.16),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.12),_transparent_22%),linear-gradient(180deg,_#020617_0%,_#081223_52%,_#0b1220_100%)] px-5 py-8 text-slate-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[28px] border border-slate-800/80 bg-slate-950/70 p-7 shadow-[0_30px_80px_rgba(2,6,23,0.5)] backdrop-blur">
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">
              AB Patrol Web
            </div>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <h1 className="text-4xl font-semibold leading-tight tracking-tight text-white md:text-5xl">
                  PA交易 Crypto
                  <span className="block text-slate-400">实时控制台</span>
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400 md:text-base">
                  根目录 Web 已独立于旧 Backend。这里优先展示 AB Patrol-Agent 的实时状态、
                  最新巡逻判断与核心模块入口；旧控制台模块也已经迁入同一个站点。
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-medium text-slate-100 transition hover:border-amber-400 hover:text-amber-200"
                  onClick={load}
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                  立即刷新
                </button>
                <Link className="inline-flex items-center gap-2 rounded-2xl bg-amber-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-300" href="/pa-bot">
                  打开 Patrol 总览
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-4">
              {[
                { label: "总体健康", value: snapshot.overall_health || "待确认" },
                { label: "Patrol 进程", value: prettyStatus(snapshot.patrol_live).text },
                { label: "Query Service", value: prettyStatus(snapshot.query_live).text },
                { label: "Execution", value: execution?.can_trade?.can_trade ? "可交易" : "待确认" },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-500">{item.label}</div>
                  <div className="mt-2 text-lg font-semibold text-white">{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-800/80 bg-[#08142a]/90 p-6 shadow-[0_24px_80px_rgba(8,20,42,0.45)]">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">当前巡逻摘要</div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-slate-700/70 bg-slate-950/60 p-4">
                <div className="text-xs text-slate-500">阶段</div>
                <div className="mt-2 text-2xl font-semibold">{runtime.current_phase || latestDecision.phase || "-"}</div>
              </div>
              <div className="rounded-2xl border border-slate-700/70 bg-slate-950/60 p-4">
                <div className="text-xs text-slate-500">持仓 / 挂单</div>
                <div className="mt-2 text-2xl font-semibold">
                  {(execution.positions || []).length} / {(execution.orders || []).length}
                </div>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/55 p-4 text-sm leading-7 text-slate-300">
              <div><span className="text-slate-500">可交易:</span> {String(execution?.can_trade?.can_trade ?? "-")} ({displayText(execution?.can_trade?.reason || "OK", 90)})</div>
              <div><span className="text-slate-500">关注:</span> {focusSymbols.join(", ") || "-"}</div>
              <div><span className="text-slate-500">Cycle 新鲜度:</span> {cycleFreshness(snapshot)} / {snapshot?.stale_but_running ? "stale-but-running" : "正常"}</div>
              <div><span className="text-slate-500">下一次扫描:</span> {(snapshot.next_scan || {}).in_seconds || "-"} 秒</div>
              <div><span className="text-slate-500">刷新时间:</span> {updatedAt || "-"}</div>
            </div>
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/55 p-4 text-sm leading-7 text-slate-300">
              {displayText(latestDecision.market_summary || runtime.last_scan_decision || "暂无决策摘要", 360)}
            </div>
            {error ? <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div> : null}
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-800/80 bg-slate-950/60 p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">模块入口</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">旧控制台模块已并入根目录 Web</h2>
            </div>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {QUICK_LINKS.map(({ href, label, desc, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="group rounded-3xl border border-slate-800 bg-slate-900/60 p-5 transition hover:-translate-y-0.5 hover:border-amber-400/70 hover:bg-slate-900"
              >
                <div className="flex items-center justify-between">
                  <Icon className="h-6 w-6 text-amber-300" />
                  <ArrowRight className="h-4 w-4 text-slate-500 transition group-hover:text-amber-200" />
                </div>
                <div className="mt-4 text-lg font-semibold text-white">{label}</div>
                <div className="mt-2 text-sm leading-6 text-slate-400">{desc}</div>
              </Link>
            ))}
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[28px] border border-slate-800/80 bg-slate-950/60 p-6">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">重点品种</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">最新决策的三个关注对象</h2>
            <div className="mt-5 grid gap-4 xl:grid-cols-3">
              {cards.length === 0 ? (
                <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 text-sm text-slate-400">
                  暂无 symbol_updates 数据
                </div>
              ) : cards.map(([symbol, patch]) => (
                <article key={symbol} className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
                  <div className="flex items-center justify-between">
                    <div className="text-lg font-semibold text-white">{symbol}</div>
                    <div className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
                      {patch.status || "-"}
                    </div>
                  </div>
                  <div className="mt-3 text-xs uppercase tracking-[0.22em] text-slate-500">
                    {displayText(patch.ai_direction, 50)} / {displayText(patch.market_state, 50)}
                  </div>
                  <div className="mt-4 text-sm leading-7 text-slate-300">
                    <div><span className="text-slate-500">结构:</span> {displayText(patch.structure_summary || patch.thesis || "-", 180)}</div>
                    <div><span className="text-slate-500">预信号:</span> {displayText(patch.pre_signal || patch.signal || "-", 180)}</div>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-800/80 bg-slate-950/60 p-6">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">最近巡逻</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">最近 5 轮</h2>
            <div className="mt-5 flex flex-col gap-3">
              {recentItems.length === 0 ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">
                  暂无 recent cycles
                </div>
              ) : recentItems.slice(0, 5).map((item) => (
                <div key={item.cycle_id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-white">{item.cycle_id}</div>
                    <div className="text-xs text-slate-500">{item.phase || "-"} / {item.next_scan_seconds || "-"}s</div>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">{(item.focus_symbols || []).join(", ") || "-"}</div>
                  <div className="mt-3 text-sm leading-6 text-slate-300">{item.market_summary || "无摘要"}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
