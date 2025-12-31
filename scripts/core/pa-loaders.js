/* 文件名: Scripts/core/pa-loaders.js
   用途: 数据加载器 (扫描 Dataview 页面并提取数据)
   依赖: pa-utils.js, dv, app
*/

const buildReviewHints = (trade) => {
    const hints = [];
    const push = (id, zh, en) => hints.push({ id, zh, en });
    const has = (v) => {
        if (v === null || v === undefined) return false;
        if (Array.isArray(v)) return v.length > 0;
        const s = String(v).trim();
        return !!s && s !== "Unknown";
    };

    if (!has(trade.setup)) push("setup_missing", "补齐设置类别", "Fill setup category");
    if (!has(trade.market_cycle)) push("cycle_missing", "补齐市场周期", "Fill market cycle");
    if (!has(trade.tf)) push("tf_missing", "补齐时间周期", "Fill timeframe");
    if (typeof trade.r === 'number' && trade.r < 0) push("loss_review", "亏损复盘：计划内还是失误？", "Loss review");

    return hints;
};

// --- Trades Loader ---
function loadTrades(dv, utils, cfg) {
    const trades = [];
    const stats = { livePnL: 0, liveWin: 0, liveCount: 0, tuition: 0, errors: {} };

    // Scan pages
    const pages = dv.pages(`${cfg.tags.trade}`).where(p => !p.file.path.includes(cfg.paths.templates));

    for (const t of pages) {
        // Date parsing using moment (global)
        let dateStr = "";
        let rawDate = t.date || t.file.day;
        if (rawDate) {
            if (rawDate.path) dateStr = rawDate.path.replace(/\.md$/i, "").split("/").pop();
            else if (rawDate.ts) dateStr = moment(rawDate.ts).format("YYYY-MM-DD");
            else dateStr = rawDate.toString();
        }
        // Fallback date
        if (!dateStr || !moment(dateStr, "YYYY-MM-DD", true).isValid()) {
            dateStr = moment(t.file.ctime.ts).format("YYYY-MM-DD");
        }

        // PnL & Type
        const pnl = utils.safeNum(t, ["净利润/net_profit", "net_profit"]);
        const rawAcct = utils.safeStr(t, ["账户类型/account_type", "account_type"]);
        const type = utils.getAccountType(rawAcct);

        // Error / Tuition
        const errStr = utils.safeStr(t, ["执行评价/execution_quality", "execution_quality", "管理错误/management_error"]);
        if (type === "Live" && pnl < 0) {
            const isBad = !errStr.includes("Perfect") && !errStr.includes("Valid") && !errStr.includes("None");
            if (isBad) {
                const k = errStr.split("(")[0].trim();
                stats.tuition += Math.abs(pnl);
                stats.errors[k] = (stats.errors[k] || 0) + Math.abs(pnl);
            }
        }
        if (type === "Live") {
            stats.livePnL += pnl;
            stats.liveCount++;
            if (pnl > 0) stats.liveWin++;
        }

        // R Calculation
        const initRisk = utils.safeNum(t, ["初始风险/initial_risk", "initial_risk"]);
        const entry = utils.safeNum(t, ["入场/entry_price", "entry_price", "entry"]);
        const stop = utils.safeNum(t, ["止损/stop_loss", "stop_loss", "stop"]);
        const exit = utils.safeNum(t, ["离场/exit_price", "exit_price", "exit"]) || entry; // fallback to BE

        let r = 0;
        if (initRisk !== 0) r = pnl / Math.abs(initRisk);
        else r = utils.calculateR(entry, stop, exit);

        // Flip R sign if PnL doesn't match raw R direction (e.g. short trade)
        if (pnl < 0 && r > 0) r = -r;
        if (pnl > 0 && r < 0) r = -r;

        const tradeItem = {
            id: t.file.path,
            link: t.file.link,
            name: t.file.name,
            date: dateStr,
            mtime: t.file?.mtime?.ts || 0,
            type: type,
            pnl: pnl,
            r: r,
            cover: utils.safeStr(t, ["封面/cover", "cover"]),
            setup: utils.safeStr(t, ["设置类别/setup_category", "setup_category"]),
            market_cycle: utils.safeStr(t, ["市场周期/market_cycle", "market_cycle"]),
            error: errStr,
            outcome: utils.safeStr(t, ["结果/outcome", "outcome"]),
            ticker: utils.safeStr(t, ["品种/ticker", "ticker"]),
            dir: utils.safeStr(t, ["方向/direction", "direction"]),
            tf: utils.safeStr(t, ["时间周期/timeframe", "timeframe"]),
            strategyName: utils.safeStr(t, ["策略名称/strategy_name", "strategy_name"]),
            patterns: utils.safeArr(t, ["观察到的形态/patterns_observed", "patterns_observed"])
        };

        // Keys for indexing
        tradeItem.setupKey = utils.normalizeEnumKey(tradeItem.setup);
        tradeItem.marketCycleKey = utils.normalizeEnumKey(tradeItem.market_cycle);
        tradeItem.tickerKey = utils.normalizeTickerKey(tradeItem.ticker);
        tradeItem.tfKey = utils.normalizeTimeframeKey(tradeItem.tf);
        tradeItem.dirKey = utils.normalizeDirectionKey(tradeItem.dir);

        tradeItem.reviewHints = buildReviewHints(tradeItem);
        trades.push(tradeItem);
    }

    trades.sort((a, b) => a.date.localeCompare(b.date));
    return { trades, stats };
}

// --- SR Loader ---
async function loadSR(dv, app, cfg) {
    const srData = {
        total: 0, due: 0, reviewed: 0,
        load: {}, folders: {}, fileList: [],
        quizPool: [], focusFile: null, status: "🌱 初始"
    };

    const pages = dv.pages(`${cfg.tags.flashcards} AND -"${cfg.paths.templates}"`);
    let easeSum = 0;
    const todayStr = moment().format("YYYY-MM-DD");

    await Promise.all(pages.map(async (p) => {
        try {
            const file = app.vault.getAbstractFileByPath(p.file.path);
            if (!file) return;
            const content = await app.vault.read(file);

            // Basic regex counting
            const matches = [...content.matchAll(/!(\d{4}-\d{2}-\d{2}),(\d+),(\d+)/g)];
            let fDue = 0;
            matches.forEach(m => {
                srData.reviewed++;
                const d = m[1];
                if (d <= todayStr) { srData.due++; fDue++; }
                else srData.load[d] = (srData.load[d] || 0) + 1;
            });

            // Add file info
            srData.fileList.push({ name: p.file.name, path: p.file.path, due: fDue, count: matches.length });
        } catch (e) { }
    }));

    // Sort logic
    if (srData.fileList.length > 0) {
        srData.fileList.sort((a, b) => b.due - a.due);
        srData.focusFile = srData.fileList[0];
    }

    return srData;
}

// --- Strategy Loader ---
function loadStrategies(dv, utils, cfg) {
    const index = {
        repoPath: "策略仓库 (Strategy Repository)", // Hardcode or from cfg
        list: [], byName: new Map(), lookup: new Map(), byPattern: {}
    };

    const pages = dv.pages(`"${index.repoPath}"`);
    for (const p of pages) {
        const rawName = utils.getRawStr(p, ["策略名称/strategy_name", "strategy_name"]);
        // Filter valid cards
        if (!rawName && !p.file.path.includes("策略")) continue;

        const canonical = rawName ? utils.normalizeBrooksValue(rawName) : p.file.name;
        const patterns = utils.safeArr(p, ["观察到的形态/patterns_observed", "patterns_observed"]).map(x => utils.normalizeBrooksValue(x));

        const item = {
            canonicalName: canonical,
            displayName: canonical,
            patterns,
            statusRaw: utils.safeStr(p, ["策略状态/strategy_status", "strategy_status"]),
            file: p.file,
            marketCycles: utils.safeArr(p, ["市场周期/market_cycle", "market_cycle"]),
            entryCriteria: utils.safeArr(p, ["入场条件/entry_criteria", "entry_criteria"])
        };

        index.list.push(item);
        index.byName.set(canonical, item);
        index.lookup.set(canonical, canonical);

        patterns.forEach(pat => {
            index.byPattern[pat] = canonical;
            if (pat.includes("(") && pat.includes(")")) {
                index.byPattern[pat.match(/\(([^)]+)\)/)[1].trim()] = canonical;
            }
        });
    }
    return index;
}

// --- Daily Loader ---
function loadDaily(dv, utils) {
    const journals = new Map();
    const todayStr = moment().format("YYYY-MM-DD");

    const pages = dv.pages('"Daily"').where(p => p.file.name.includes("Journal") || p.file.name.includes("复盘"));
    for (const p of pages) {
        // Safe date extraction is tricky without utils helper, assume filename or date field
        let d = p.date ? moment(p.date.ts).format("YYYY-MM-DD") : null;
        if (!d) {
            const m = p.file.name.match(/\d{4}-\d{2}-\d{2}/);
            if (m) d = m[0];
        }
        if (d) {
            journals.set(d, {
                date: d,
                path: p.file.path,
                market_cycle: utils.safeStr(p, ["市场周期/market_cycle", "market_cycle"])
            });
        }
    }

    return { journalsByDate: journals, todayJournal: journals.get(todayStr) };
}

module.exports = {
    loadTrades,
    loadSR,
    loadStrategies,
    loadDaily
};
