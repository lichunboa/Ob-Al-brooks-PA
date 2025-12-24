const basePath = app.vault.adapter.basePath;
const cfg = require(basePath + "/scripts/pa-config.js");

// === 数据源：优先使用引擎缓存，避免重复全库扫描 ===
const idx = window.paData?.strategyIndex;
const strategyList = idx?.list || [];
const strategyByName = idx?.byName;
const strategyLookup = idx?.lookup;
const strategyByPattern = idx?.byPattern || {};
const trades = window.paData?.tradesAsc || [];

const toArr = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (v?.constructor && v.constructor.name === "Proxy") return Array.from(v);
  return [v];
};
const normStr = (v) =>
  v === undefined || v === null ? "" : v.toString().trim();

const hasCJK = (str) => /[\u4e00-\u9fff]/.test((str || "").toString());
const prettyName = (raw) => {
  const s = normStr(raw);
  if (!s) return s;
  const low = s.toLowerCase();
  if (low === "unknown") return "未知/Unknown";
  if (low === "n/a" || low === "na") return "无/N/A";

  const looked = strategyLookup?.get?.(s) || strategyLookup?.get?.(low) || "";
  const out = normStr(looked) || s;

  // 已经是中文/英文格式（或至少包含中文）则原样展示
  if (hasCJK(out)) return out;
  if (out.includes("/") && hasCJK(out.split("/")[0])) return out;

  // 纯英文：强制带中文前缀，避免“无中文”
  if (!hasCJK(out) && /[a-zA-Z]/.test(out)) return `待补充/${out}`;
  return out;
};

const statusToCn = (raw) => {
  const s0 = normStr(raw);
  if (!s0) return "学习中/Learning";
  if (hasCJK(s0)) return s0;
  const s = s0.toLowerCase();
  if (s.includes("active") || s.includes("实战")) return "实战中/Active";
  if (
    s.includes("valid") ||
    s.includes("verify") ||
    s.includes("test") ||
    s.includes("验证")
  )
    return "验证中/Validating";
  if (
    s.includes("learn") ||
    s.includes("study") ||
    s.includes("read") ||
    s.includes("学习")
  )
    return "学习中/Learning";
  return `待补充/${s0}`;
};

const hashId = (input) => {
  const s = normStr(input);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16);
};

const cycleToCn = (raw) => {
  const s0 = normStr(raw);
  if (!s0) return s0;
  if (hasCJK(s0)) return s0;
  if (s0.includes("/")) return s0;
  if (s0.includes("(") && s0.endsWith(")")) return s0;
  const key = s0.toLowerCase();
  const map = {
    range: "交易区间/Range",
    "trading range": "交易区间/Trading Range",
    trend: "趋势/Trend",
    pullback: "回调/Pullback",
    reversal: "反转/Reversal",
    breakout: "突破/Breakout",
    spike: "急速/Spike",
  };
  return map[key] || `待补充/${s0}`;
};
const prettyCycles = (v, limit = 2) =>
  toArr(v)
    .map(cycleToCn)
    .map(normStr)
    .filter(Boolean)
    .slice(0, limit)
    .join(", ");
const cycleMatches = (cycles, currentCycle) => {
  const cur = normStr(currentCycle);
  if (!cur) return false;
  return (cycles || []).some((c) => {
    const cc = normStr(c);
    return cc && (cc.includes(cur) || cur.includes(cc));
  });
};

// 今日复盘日记（用于“今日推荐”）- 单一信源：pa-core daily
const today = moment().format("YYYY-MM-DD");
const todayJournal = window.paData?.daily?.todayJournal;
const isActiveStrategy = (statusRaw) => {
  const s = normStr(statusRaw);
  if (!s) return false;
  return s.includes("实战") || s.toLowerCase().includes("active");
};
const safePct = (wins, total) =>
  total > 0 ? Math.round((wins / total) * 100) : 0;

// 将交易归因到策略（策略名优先，其次形态匹配）
function resolveStrategyCanonical(trade) {
  const raw = normStr(trade?.strategyName);
  if (raw && raw !== "Unknown") {
    if (strategyLookup?.get?.(raw)) return strategyLookup.get(raw);
    if (strategyLookup?.get?.(raw.toLowerCase()))
      return strategyLookup.get(raw.toLowerCase());
    return raw;
  }
  const pats = toArr(trade?.patterns).map(normStr).filter(Boolean);
  for (const p of pats) {
    const canonical = strategyByPattern[p];
    if (canonical) return canonical;
  }
  return null;
}

// 汇总每个策略的实战表现
const perf = new Map(); // canonical -> { total, wins, pnl, lastDate }
for (const t of trades) {
  const canonical = resolveStrategyCanonical(t);
  if (!canonical) continue;
  const p = perf.get(canonical) || { total: 0, wins: 0, pnl: 0, lastDate: "" };
  p.total += 1;
  if (t.pnl > 0) p.wins += 1;
  p.pnl += Number(t.pnl) || 0;
  if (t.date && (!p.lastDate || t.date > p.lastDate)) p.lastDate = t.date;
  perf.set(canonical, p);
}

// 策略仓库路径
const strategyRepo = idx?.repoPath || "策略仓库 (Strategy Repository)";
const strategies = strategyList;

// 按市场周期/market_cycle 分组（取第一项作为主周期，避免同一策略重复出现在多个组）
const otherGroupName = "📦 其他/未分类";
const primaryCycleOf = (s) => {
  const cycles = (s?.marketCycles || []).map(normStr).filter(Boolean);
  return cycles.length > 0 ? cycleToCn(cycles[0]) : "";
};

let html = "";
let totalStrategies = strategies.length;
let activeStrategies = strategies.filter((s) =>
  isActiveStrategy(s.statusRaw)
).length;
let usageCount = 0;
perf.forEach((p) => (usageCount += p.total));

// 顶部统计
html += `<div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:6px; margin-bottom:16px;">
  <div style="background:rgba(59,130,246,0.1); padding:8px; border-radius:6px; text-align:center;">
    <div style="font-size:1.2em; font-weight:700; color:${
      cfg.colors.demo
    };">${totalStrategies}</div>
    <div style="font-size:0.7em; opacity:0.7;">总策略</div>
  </div>
  <div style="background:rgba(34,197,94,0.1); padding:8px; border-radius:6px; text-align:center;">
    <div style="font-size:1.2em; font-weight:700; color:#22c55e;">${activeStrategies}</div>
    <div style="font-size:0.7em; opacity:0.7;">实战中</div>
  </div>
  <div style="background:rgba(251,191,36,0.1); padding:8px; border-radius:6px; text-align:center;">
    <div style="font-size:1.2em; font-weight:700; color:#fbbf24;">${
      totalStrategies - activeStrategies
    }</div>
    <div style="font-size:0.7em; opacity:0.7;">学习中</div>
  </div>
  <div style="background:rgba(168,85,247,0.1); padding:8px; border-radius:6px; text-align:center;">
    <div style="font-size:1.2em; font-weight:700; color:#a855f7;">${usageCount}</div>
    <div style="font-size:0.7em; opacity:0.7;">总使用</div>
  </div>
</div>`;

// 今日推荐（基于复盘日记市场周期）
if (
  todayJournal &&
  (todayJournal["市场周期/market_cycle"] || todayJournal.market_cycle)
) {
  const currentCycle =
    todayJournal["市场周期/market_cycle"] || todayJournal.market_cycle;
  const rec = strategies
    .filter(
      (s) =>
        isActiveStrategy(s.statusRaw) &&
        cycleMatches(s.marketCycles, currentCycle)
    )
    .sort((a, b) => {
      const pa = perf.get(a.canonicalName) || {
        total: 0,
        wins: 0,
        pnl: 0,
        lastDate: "",
      };
      const pb = perf.get(b.canonicalName) || {
        total: 0,
        wins: 0,
        pnl: 0,
        lastDate: "",
      };
      return (pb.total || 0) - (pa.total || 0) || (pb.pnl || 0) - (pa.pnl || 0);
    })
    .slice(0, 6);

  html += `
  <div style="margin:-6px 0 14px 0; padding:10px 12px; background:rgba(59,130,246,0.06); border:1px solid rgba(59,130,246,0.18); border-radius:8px;">
    <div style="font-weight:700; opacity:0.75; margin-bottom:6px;">🌊 今日市场周期: <span style="color:${
      cfg.colors.demo
    }">${prettyCycles(currentCycle, 4) || "无/N/A"}</span></div>
    <div style="font-size:0.85em; opacity:0.75;">
      ${
        rec.length
          ? `推荐优先关注：${rec
              .map((s) => {
                const safePath = s?.file?.path;
                const safeHref = safePath ? encodeURI(safePath) : "";
                const label = prettyName(
                  s?.displayName || s?.canonicalName || s?.file?.name
                );
                return safeHref
                  ? `<a href=\"${safeHref}\" data-href=\"${safePath}\" class=\"internal-link\" style=\"white-space:nowrap; text-decoration:none;\">${label}</a>`
                  : `<span style=\"white-space:nowrap;\">${label}</span>`;
              })
              .join(" · ")}`
          : "暂无匹配的实战策略（可去 Today 里补充周期/或按形态匹配）。"
      }
    </div>
  </div>`;
}

// 今日推荐兜底（基于 Core 的教练焦点，不依赖今日日记）
if (
  !(
    todayJournal &&
    (todayJournal["市场周期/market_cycle"] || todayJournal.market_cycle)
  )
) {
  const focus =
    window.paData?.coach?.combined?.focus ||
    window.paData?.coach?.today?.focus ||
    window.paData?.coach?.week?.focus ||
    window.paData?.coach?.last30?.focus;

  if (focus) {
    const focusLabel = (focus.label || focus.key || "").toString();
    const dim = (focus.dimLabel || focus.kind || "").toString();
    const completed = Number(focus?.stats?.completed) || 0;
    const winRate = Number(focus?.stats?.winRate) || 0;
    const exp = Number(focus?.stats?.expectancyR);
    const expStr = Number.isFinite(exp) ? exp.toFixed(2) : "0.00";

    const streak = Number(focus?.weekStreak) || 0;
    const streakStr = streak >= 2 ? `，连续${streak}周` : "";
    let msg = `教练焦点：${dim} → ${focusLabel || "Unknown"}（样本${completed}，期望R ${expStr}，胜率 ${winRate}%${streakStr}）`;
    let recHtml = "";

    // 1) 如果焦点是市场周期，则按周期推荐实战策略
    if (focus.kind === "marketCycleKey" && focusLabel) {
      const currentCycle = focusLabel;
      const rec = strategies
        .filter(
          (s) =>
            isActiveStrategy(s.statusRaw) &&
            cycleMatches(s.marketCycles, currentCycle)
        )
        .sort((a, b) => {
          const pa = perf.get(a.canonicalName) || {
            total: 0,
            wins: 0,
            pnl: 0,
            lastDate: "",
          };
          const pb = perf.get(b.canonicalName) || {
            total: 0,
            wins: 0,
            pnl: 0,
            lastDate: "",
          };
          return (pb.total || 0) - (pa.total || 0) || (pb.pnl || 0) - (pa.pnl || 0);
        })
        .slice(0, 6);

      recHtml = rec.length
        ? `推荐优先关注：${rec
            .map((s) => {
              const safePath = s?.file?.path;
              const safeHref = safePath ? encodeURI(safePath) : "";
              const label = prettyName(
                s?.displayName || s?.canonicalName || s?.file?.name
              );
              return safeHref
                ? `<a href=\"${safeHref}\" data-href=\"${safePath}\" class=\"internal-link\" style=\"white-space:nowrap; text-decoration:none;\">${label}</a>`
                : `<span style=\"white-space:nowrap;\">${label}</span>`;
            })
            .join(" · ")}`
        : "暂无匹配的实战策略（可创建今日日记以获得更精确的周期匹配）。";
    }

    // 2) 如果焦点是策略，则直链该策略卡（若可解析）
    if (!recHtml && focus.kind === "strategyKey" && focusLabel) {
      const raw = focusLabel;
      const canonical =
        strategyLookup?.get?.(raw) ||
        strategyLookup?.get?.(raw.toLowerCase()) ||
        raw;
      const item = strategyByName?.get?.(canonical);
      if (item?.file?.path) {
        const safePath = item.file.path;
        const safeHref = encodeURI(safePath);
        const label = prettyName(item.displayName || item.canonicalName || raw);
        recHtml = `推荐优先复盘：<a href=\"${safeHref}\" data-href=\"${safePath}\" class=\"internal-link\" style=\"white-space:nowrap; text-decoration:none;\">${label}</a>`;
      } else {
        recHtml = `推荐优先复盘：${prettyName(raw)}`;
      }
    }

    html += `
    <div style="margin:-6px 0 14px 0; padding:10px 12px; background:rgba(59,130,246,0.06); border:1px solid rgba(59,130,246,0.18); border-radius:8px;">
      <div style="font-weight:700; opacity:0.75; margin-bottom:6px;">🧠 今日推荐（兜底）</div>
      <div style="font-size:0.85em; opacity:0.75; margin-bottom:6px;">${msg}</div>
      <div style="font-size:0.85em; opacity:0.75;">${recHtml || "建议去 Inspector 按该维度筛选最近交易进行复盘。"}</div>
    </div>`;
  }
}

// 分组收集（保持插入顺序，最后再把“其他/未分类”放到底部）
const cycleBuckets = new Map(); // groupName -> strategies[]
const cycleOrder = [];
const pushBucket = (name, item) => {
  if (!cycleBuckets.has(name)) {
    cycleBuckets.set(name, []);
    cycleOrder.push(name);
  }
  cycleBuckets.get(name).push(item);
};

for (const s of strategies) {
  const g = primaryCycleOf(s) || otherGroupName;
  pushBucket(g, s);
}

const orderedGroups = cycleOrder.filter((n) => n !== otherGroupName);
if (cycleBuckets.has(otherGroupName)) orderedGroups.push(otherGroupName);

orderedGroups.forEach((groupName) => {
  let matches = cycleBuckets.get(groupName) || [];

  // 让列表更“可用”：实战优先，其次近期/使用/表现
  matches = matches.sort((a, b) => {
    const aActive = isActiveStrategy(a.statusRaw) ? 1 : 0;
    const bActive = isActiveStrategy(b.statusRaw) ? 1 : 0;
    if (bActive !== aActive) return bActive - aActive;

    const pa = perf.get(a.canonicalName) || {
      total: 0,
      wins: 0,
      pnl: 0,
      lastDate: "",
    };
    const pb = perf.get(b.canonicalName) || {
      total: 0,
      wins: 0,
      pnl: 0,
      lastDate: "",
    };
    if ((pb.lastDate || "") !== (pa.lastDate || ""))
      return (pb.lastDate || "").localeCompare(pa.lastDate || "");
    if ((pb.total || 0) !== (pa.total || 0))
      return (pb.total || 0) - (pa.total || 0);
    if ((pb.pnl || 0) !== (pa.pnl || 0)) return (pb.pnl || 0) - (pa.pnl || 0);
    return (a.displayName || a.canonicalName || "").localeCompare(
      b.displayName || b.canonicalName || ""
    );
  });

  if (matches.length > 0) {
    html += `<div style="margin-bottom:14px;">
      <div style="font-size:0.85em; opacity:0.7; font-weight:bold; margin-bottom:8px;">${groupName} (${matches.length})</div>
      <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:8px;">`;

    for (let s of matches) {
      let strategyName = prettyName(
        s.displayName || s.canonicalName || s.file.name
      );
      const p = perf.get(s.canonicalName) || {
        total: 0,
        wins: 0,
        pnl: 0,
        lastDate: "",
      };
      let winRate = safePct(p.wins, p.total);
      let riskReward = s.riskReward || "无/N/A";
      const statusKey = normStr(s.statusRaw || "学习中").toLowerCase();
      let status = statusToCn(s.statusRaw || "学习中");
      let usageCount = p.total || 0;
      let setupCategory = (s.setupCategories || [])
        .slice(0, 2)
        .map(prettyName)
        .join(", ");
      let source = prettyName(s.source || "");

      // 获取市场周期
      let cycleText = (s.marketCycles || [])
        .slice(0, 2)
        .map(cycleToCn)
        .join(", ");

      // 状态颜色
      let statusColor =
        statusKey.includes("active") || statusKey.includes("实战")
          ? "#22c55e"
          : statusKey.includes("valid") ||
            statusKey.includes("verify") ||
            statusKey.includes("test") ||
            statusKey.includes("验证")
          ? "#fbbf24"
          : statusKey.includes("learn") ||
            statusKey.includes("study") ||
            statusKey.includes("read") ||
            statusKey.includes("学习")
          ? "#3b82f6"
          : "#6b7280";

      // 胜率颜色
      let winRateColor =
        winRate >= 60
          ? "#22c55e"
          : winRate >= 50
          ? "#fbbf24"
          : winRate > 0
          ? "#ef4444"
          : "#6b7280";

      // 生成唯一ID（避免重复导致无法展开）
      const cardIdBase = normStr(
        s?.file?.path || s?.file?.name || s?.canonicalName || strategyName
      );
      const cardIdSlugBase = normStr(s?.file?.name || s?.canonicalName || "s");
      const cardIdSlug = cardIdSlugBase
        .replace(/[^a-zA-Z0-9]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      const cardIdHash = hashId(cardIdBase || cardIdSlugBase);
      const cardId = `strategy-${cardIdSlug || "s"}-${cardIdHash}`;

      const safePath = s?.file?.path;
      const safeHref = safePath ? encodeURI(safePath) : "";

      html += `
      <details id="${cardId}" style="
        background:rgba(255,255,255,0.03);
        border:1px solid rgba(255,255,255,0.1);
        border-radius:8px;
        overflow:hidden;
      ">
        <summary style="
          list-style:none;
          padding:8px 10px;
          cursor:pointer;
          display:flex;
          justify-content:space-between;
          align-items:flex-start;
          gap:8px;
        ">
          <div style="flex:1; min-width:0;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px; min-width:0;">
              <span style="font-size:0.88em; font-weight:600; color:${
                cfg.colors.demo
              }; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${strategyName}</span>
              <span style="font-size:0.65em; padding:2px 6px; background:${statusColor}20; color:${statusColor}; border-radius:3px; white-space:nowrap;">● ${status}</span>
            </div>
            <div style="display:flex; gap:10px; font-size:0.68em; opacity:0.7; flex-wrap:wrap;">
              <span>📊 R/R: <strong>${riskReward}</strong></span>
              ${
                winRate > 0
                  ? `<span>✓ 胜率: <strong style="color:${winRateColor};">${winRate}%</strong></span>`
                  : ""
              }
              ${
                usageCount > 0
                  ? `<span>🔢 使用: <strong>${usageCount}次</strong></span>`
                  : ""
              }
              ${
                p.lastDate
                  ? `<span>🕒 最近: <strong>${p.lastDate}</strong></span>`
                  : ""
              }
            </div>
          </div>
          <span class="pb-arrow" style="font-size:0.8em; opacity:0.5; line-height:1.4; transform:rotate(0deg); transition:transform 0.15s;">▶</span>
        </summary>

        <div style="padding:0 10px 10px 10px; border-top:1px solid rgba(255,255,255,0.05);">
          <div style="margin-top:8px; font-size:0.74em;">
            <div style="display:grid; grid-template-columns: auto 1fr; gap:6px 12px; opacity:0.8;">
              <span style="opacity:0.6;">市场周期:</span>
              <span>${cycleText || "无/N/A"}</span>

              <span style="opacity:0.6;">设置类别:</span>
              <span>${setupCategory || "无/N/A"}</span>

              <span style="opacity:0.6;">来源:</span>
              <span>${source || "无/N/A"}</span>
            </div>

            <div style="margin-top:10px; display:flex; gap:6px;">
              <a href="${safeHref}" data-href="${
        safePath || ""
      }" class="internal-link" style="
                flex:1;
                background:rgba(59,130,246,0.15);
                color:${cfg.colors.demo};
                padding:6px 10px;
                border-radius:4px;
                text-decoration:none;
                font-size:0.75em;
                text-align:center;
                border:1px solid rgba(59,130,246,0.3);
              ">${safePath ? "📖 查看详情" : "⚠️ 无法打开"}</a>
            </div>
          </div>
        </div>
      </details>`;
    }
    html += `</div></div>`;
  }
});

// 旧的 otherBucket 渲染已合并到 orderedGroups（otherGroupName）里

// 快速访问链接
const quickPath = "策略仓库 (Strategy Repository)/太妃方案/太妃方案.md";
const quickHref = encodeURI(quickPath);
html += `<div style="margin-top:16px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.1);">
  <div style="display:flex; gap:8px; flex-wrap:wrap;">
    <a href="${quickHref}" data-href="${quickPath}" class="internal-link" style="
      background:rgba(147,51,234,0.15);
      color:#a855f7;
      padding:4px 10px;
      border-radius:4px;
      text-decoration:none;
      font-size:0.75em;
      border:1px solid rgba(147,51,234,0.3);
    ">📚 太妃方案</a>
    <span style="
      background:rgba(100,100,100,0.15);
      color:#888;
      padding:4px 10px;
      border-radius:4px;
      font-size:0.75em;
      border:1px solid rgba(100,100,100,0.3);
    ">📖 Al Brooks经典 (即将推出)</span>
  </div>
</div>`;

// --- 📊 策略表现统计 (Strategy Performance) ---
// 生成统计表格 HTML
let statsHtml = `<div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid var(--background-modifier-border);">
<div style="font-weight:700; opacity:0.7; margin-bottom:10px;">🏆 实战表现 (Performance)</div>
<table style="width:100%; font-size:0.85em; border-collapse: collapse;">
    <tr style="border-bottom:1px solid var(--background-modifier-border); text-align:left; color:var(--text-muted);">
        <th style="padding:4px;">策略</th>
        <th style="padding:4px;">胜率</th>
        <th style="padding:4px;">盈亏</th>
        <th style="padding:4px;">次数</th>
    </tr>`;

// 排序并生成行（按盈亏排序）
[...perf.entries()]
  .sort((a, b) => (b[1].pnl || 0) - (a[1].pnl || 0))
  .forEach(([canonical, s]) => {
    const winRate = safePct(s.wins, s.total);
    const pnlColor =
      s.pnl > 0 ? "#22c55e" : s.pnl < 0 ? "#ef4444" : "var(--text-muted)";

    const item = strategyByName?.get?.(canonical);
    const display = prettyName(item?.displayName || canonical);
    const nameDisplay = item?.file?.path
      ? `<a href="${encodeURI(item.file.path)}" data-href="${
          item.file.path
        }" class="internal-link">${display}</a>`
      : display;

    statsHtml += `
        <tr style="border-bottom:1px solid var(--background-modifier-border);">
            <td style="padding:6px 4px;">${nameDisplay}</td>
            <td style="padding:6px 4px;">${winRate}%</td>
            <td style="padding:6px 4px; color:${pnlColor}; font-weight:bold;">${
      s.pnl > 0 ? "+" : ""
    }${Math.round(s.pnl)}</td>
            <td style="padding:6px 4px;">${s.total}</td>
        </tr>`;
  });

statsHtml += `</table></div>`;
html += statsHtml;

const root = dv.el("div", "", { attr: { style: cfg.colors.cardBg } });
root.innerHTML = `
<style>
  .pa-pb summary::-webkit-details-marker { display: none; }
  .pa-pb details[open] .pb-arrow { transform: rotate(90deg); }
  .pa-pb summary { user-select: none; }
</style>
<div class="pa-pb">
<div style="font-weight:700; opacity:0.7; margin-bottom:12px;">🗂️ 策略仓库 (Strategy Repository)</div>
${
  html ||
  `<div style='opacity:0.5; font-size:0.8em;'>暂无策略卡片。<br>请在策略仓库中创建策略卡片。</div>`
}
</div>
`;
