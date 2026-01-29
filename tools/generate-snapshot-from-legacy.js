#!/usr/bin/env node

/**
 * Generate an Index Snapshot (schemaVersion=1) from legacy `pa-db-export.json`.
 *
 * This is a dry-run helper for validation outside Obsidian runtime.
 */

const fs = require("fs");
const path = require("path");

function classifyOutcome(pnl, fallbackOutcome) {
  if (typeof pnl === "number" && Number.isFinite(pnl)) {
    if (pnl > 0) return "win";
    if (pnl < 0) return "loss";
    return "scratch";
  }
  const out = (fallbackOutcome || "").toString().toLowerCase();
  if (
    out === "win" ||
    out === "loss" ||
    out === "scratch" ||
    out === "open" ||
    out === "unknown"
  )
    return out;
  return "unknown";
}

function computeTradeStats(trades) {
  let countTotal = 0;
  let countCompleted = 0;
  let countWins = 0;
  let netProfit = 0;

  for (const trade of trades) {
    countTotal += 1;
    if (typeof trade.pnl === "number" && Number.isFinite(trade.pnl))
      netProfit += trade.pnl;

    const outcome = trade.outcome;
    const isCompleted =
      outcome === "win" || outcome === "loss" || outcome === "scratch";
    if (isCompleted) countCompleted += 1;
    if (outcome === "win") countWins += 1;
  }

  const winRatePct =
    countCompleted === 0 ? 0 : Math.round((countWins / countCompleted) * 100);
  return { countTotal, countCompleted, countWins, winRatePct, netProfit };
}

function computeTradeStatsByAccountType(trades) {
  const by = { Live: [], Demo: [], Backtest: [] };
  for (const t of trades) {
    const at = t.accountType;
    if (at === "Live" || at === "Demo" || at === "Backtest") by[at].push(t);
  }
  return {
    All: computeTradeStats(trades),
    Live: computeTradeStats(by.Live),
    Demo: computeTradeStats(by.Demo),
    Backtest: computeTradeStats(by.Backtest),
  };
}

function toFileTimestamp(d) {
  const pad2 = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(
    d.getDate()
  )}_${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}

function main() {
  const cwd = process.cwd();
  const legacyPath = path.join(cwd, "pa-db-export.json");
  if (!fs.existsSync(legacyPath)) {
    console.error(`Legacy export not found: ${legacyPath}`);
    process.exit(1);
  }

  const legacy = JSON.parse(fs.readFileSync(legacyPath, "utf8"));
  const legacyTrades = Array.isArray(legacy.trades) ? legacy.trades : [];

  const trades = legacyTrades.map((t) => {
    const p = (t?.link?.path || t?.id || "").toString();
    const type = (t?.type || "").toString();
    const accountType =
      type === "Live" || type === "Demo" || type === "Backtest"
        ? type
        : undefined;
    const pnl = typeof t?.pnl === "number" ? t.pnl : undefined;

    const r =
      typeof t?.r === "number" && Number.isFinite(t.r) ? t.r : undefined;
    const setup = t?.setup ? String(t.setup) : undefined;
    const error = t?.error ? String(t.error) : undefined;
    const dir = t?.dir ? String(t.dir) : undefined;
    const tf = t?.tf ? String(t.tf) : undefined;
    const order = t?.order ? String(t.order) : undefined;
    const signal = t?.signal ? String(t.signal) : undefined;
    const plan = t?.plan ? String(t.plan) : undefined;

    return {
      path: p,
      name: (t?.name || path.basename(p, ".md") || "").toString(),
      dateIso: (t?.date || "").toString(),
      ticker: t?.ticker ? String(t.ticker) : undefined,
      pnl,
      outcome: classifyOutcome(pnl, t?.outcome),
      accountType,
      r,
      setup,
      error,
      dir,
      tf,
      order,
      signal,
      plan,
      // Keep a copy for debugging/compat, but do not promise its schema.
      rawFrontmatter: {
        setup,
        error,
        dir,
        tf,
        order,
        signal,
        plan,
        cover: t?.cover,
      },
    };
  });

  const snapshot = {
    meta: {
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      pluginVersion: "dry-run-from-legacy",
    },
    trades,
    statsByAccountType: computeTradeStatsByAccountType(trades),
  };

  const outDir = path.join(cwd, "Exports", "al-brooks-console");
  fs.mkdirSync(outDir, { recursive: true });

  const stamp = toFileTimestamp(new Date());
  const outPath = path.join(outDir, `snapshot_${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2), "utf8");

  console.log(outPath);
}

main();
