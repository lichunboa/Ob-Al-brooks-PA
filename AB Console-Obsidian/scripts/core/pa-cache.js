/* 文件名: Scripts/core/pa-cache.js
   用途: 缓存控制与滚动位置保持 (Scroll & Cache Manager)
   依赖: 无 (纯 DOM/Obsidian API 操作)
*/

// --- Scroll State Management ---

// 仅在“用户明确在滚动”时才允许更新目标滚动位置
function initScrollIntent(window) {
    if (!window.__paUserScrollIntentInstalled) {
        window.__paUserScrollIntentInstalled = true;
        window.__paUserScrollIntentUntil = 0;
        window.__paUserActivityAt = 0;
        const bump = (ms = 350) => {
            try {
                const now = Date.now();
                window.__paUserActivityAt = now;
                window.__paUserScrollIntentUntil = now + ms;
            } catch (e) { }
        };
        try {
            document.addEventListener("wheel", () => bump(500), { passive: true, capture: true });
            document.addEventListener("touchmove", () => bump(700), { passive: true, capture: true });
            document.addEventListener("keydown", (e) => {
                const k = e?.key;
                if (k === "ArrowDown" || k === "ArrowUp" || k === "PageDown" || k === "PageUp" || k === "Home" || k === "End" || k === " ") {
                    bump(700);
                }
            }, true);
            document.addEventListener("pointerdown", () => bump(800), { passive: true, capture: true });
        } catch (e) { }
    }
}

function getScrollerElForLeaf(leaf) {
    try {
        const root = leaf?.view?.contentEl || leaf?.view?.containerEl;
        if (!root?.querySelector) return null;

        const isScrollable = (el) => {
            try {
                if (!el) return false;
                if (typeof el.scrollTop !== "number") return false;
                if (typeof el.getClientRects === "function" && el.getClientRects().length === 0) return false;
                return el.scrollHeight > el.clientHeight + 2;
            } catch (e) { return false; }
        };

        const cm = root.querySelector(".cm-scroller");
        const viewContent = root.querySelector(".view-content");
        const preview = root.querySelector(".markdown-preview-view");
        const reading = root.querySelector(".markdown-reading-view");

        const candidates = [
            { el: viewContent, pr: 40 },
            { el: preview, pr: 30 },
            { el: reading, pr: 20 },
            { el: cm, pr: 10 },
        ].filter((x) => !!x.el);

        const scrollable = candidates.filter((x) => isScrollable(x.el));
        if (scrollable.length > 0) {
            scrollable.sort((a, b) => {
                const aSpan = (a.el.scrollHeight || 0) - (a.el.clientHeight || 0);
                const bSpan = (b.el.scrollHeight || 0) - (b.el.clientHeight || 0);
                if (bSpan !== aSpan) return bSpan - aSpan;
                return (b.pr || 0) - (a.pr || 0);
            });
            return scrollable[0].el;
        }

        // Fallback
        if (viewContent && typeof viewContent.scrollTop === "number") return viewContent;
        if (preview && typeof preview.scrollTop === "number") return preview;
        if (reading && typeof reading.scrollTop === "number") return reading;
        if (cm && typeof cm.scrollTop === "number") return cm;
    } catch (e) { }
    return null;
}

function captureScrollState(app) {
    try {
        const leaf = app?.workspace?.activeLeaf;
        const filePath = leaf?.view?.file?.path || app?.workspace?.getActiveFile?.()?.path || "";
        const scroller = getScrollerElForLeaf(leaf);
        if (!scroller) return null;
        const maxScrollTop = Math.max(0, (scroller.scrollHeight || 0) - (scroller.clientHeight || 0));
        const scrollTop = Number(scroller.scrollTop || 0);
        return {
            leaf,
            filePath,
            capturedAt: Date.now(),
            scrollTop,
            scrollLeft: Number(scroller.scrollLeft || 0),
            scrollHeight: Number(scroller.scrollHeight || 0),
            clientHeight: Number(scroller.clientHeight || 0),
            maxScrollTop,
            scrollRatio: maxScrollTop > 0 ? scrollTop / maxScrollTop : 0,
            atBottom: maxScrollTop > 0 ? maxScrollTop - scrollTop <= 2 : false,
        };
    } catch (e) {
        return null;
    }
}

function restoreScrollState(state, app) {
    try {
        if (!state) return false;
        // Don't fight user
        try {
            const now = Date.now();
            const lastAct = Number(window.__paUserActivityAt || 0);
            const intentUntil = Number(window.__paUserScrollIntentUntil || 0);
            if ((intentUntil && now <= intentUntil) || (lastAct && now - lastAct < 250)) {
                return false;
            }
        } catch (e) { }

        const leaf = state.leaf || app?.workspace?.activeLeaf;
        const activePath = leaf?.view?.file?.path || app?.workspace?.getActiveFile?.()?.path || "";
        if (state.filePath && activePath && state.filePath !== activePath) return false;
        const scroller = getScrollerElForLeaf(leaf);
        if (!scroller) return false;

        const maxNow = Math.max(0, (scroller.scrollHeight || 0) - (scroller.clientHeight || 0));
        let targetTop = Number(state.scrollTop || 0);
        if (maxNow > 0) {
            if (state.atBottom) {
                targetTop = maxNow;
            } else if (typeof state.scrollRatio === "number") {
                targetTop = Math.round(Math.max(0, Math.min(maxNow, state.scrollRatio * maxNow)));
            }
        }
        scroller.scrollTop = targetTop;
        scroller.scrollLeft = Number(state.scrollLeft || 0);
        return true;
    } catch (e) {
        return false;
    }
}

function startScrollLock(state, opts = {}, app) {
    try {
        if (!state) return () => { };
        try {
            if (typeof window.__paScrollLockStop === "function") window.__paScrollLockStop();
        } catch (e) { }

        const maxMs = Number(opts.maxMs ?? 1800);
        if (!maxMs || maxMs <= 0) return () => { };

        const startedAt = Date.now();
        const hardEndAt = startedAt + maxMs;
        let active = true;
        let currentScroller = null;
        let internalSetUntil = 0;

        const onScroll = () => {
            try {
                if (!active || !currentScroller) return;
                const now = Date.now();
                if (now < internalSetUntil) return;
                const intentUntil = Number(window.__paUserScrollIntentUntil || 0);
                if (!intentUntil || now > intentUntil) return;
                state.scrollTop = currentScroller.scrollTop;
                state.scrollLeft = currentScroller.scrollLeft;
            } catch (e) { }
        };

        const attachTo = (el) => {
            try {
                if (!el || el === currentScroller) return;
                if (currentScroller) currentScroller.removeEventListener("scroll", onScroll, true);
                currentScroller = el;
                currentScroller.addEventListener("scroll", onScroll, true);
            } catch (e) { }
        };

        const detach = () => {
            try {
                if (currentScroller) currentScroller.removeEventListener("scroll", onScroll, true);
            } catch (e) { }
            currentScroller = null;
        };

        const enforce = () => {
            if (!active) return;
            if (Date.now() >= hardEndAt) { active = false; return; }
            const scroller = getScrollerElForLeaf(state.leaf || app?.workspace?.activeLeaf);
            attachTo(scroller);
            if (scroller) {
                if (Math.abs(scroller.scrollTop - state.scrollTop) > 1) {
                    internalSetUntil = Date.now() + 50;
                    scroller.scrollTop = state.scrollTop;
                }
                if (Math.abs(scroller.scrollLeft - state.scrollLeft) > 1) {
                    internalSetUntil = Date.now() + 50;
                    scroller.scrollLeft = state.scrollLeft;
                }
            }
            requestAnimationFrame(enforce);
        };

        // First frame
        const scroller0 = getScrollerElForLeaf(state.leaf || app?.workspace?.activeLeaf);
        attachTo(scroller0);
        if (scroller0) {
            internalSetUntil = Date.now() + 50;
            scroller0.scrollTop = state.scrollTop;
            scroller0.scrollLeft = state.scrollLeft;
        }
        requestAnimationFrame(enforce);

        const stop = () => {
            active = false;
            detach();
        };
        window.__paScrollLockStop = stop;
        return stop;
    } catch (e) {
        return () => { };
    }
}

function scheduleRestoreScroll(state, app) {
    if (!state) return;
    state.__paRestored = false;
    const startedAt = Date.now();
    const deadlineMs = 2200;
    let lastH = -1;
    let stableCount = 0;
    let rafId = null;

    const tick = () => {
        if (state.__paRestored) return;
        if (Date.now() - startedAt > deadlineMs) return;

        const leaf = state.leaf || app?.workspace?.activeLeaf;
        const scroller = getScrollerElForLeaf(leaf);
        if (!scroller) {
            rafId = requestAnimationFrame(tick);
            return;
        }

        const h = Number(scroller.scrollHeight || 0);
        if (lastH >= 0 && Math.abs(h - lastH) <= 2) stableCount += 1;
        else stableCount = 0;
        lastH = h;

        if (stableCount >= 3) {
            const ok = restoreScrollState(state, app);
            if (ok) {
                state.__paRestored = true;
                return;
            }
        }
        rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
}

// --- Main Refresh Logic ---

async function refreshViews(app, cfg, opts = {}) {
    // Init global listener if needed
    initScrollIntent(window);

    const preserveScroll = opts.preserveScroll !== undefined
        ? !!opts.preserveScroll
        : cfg?.settings?.preserveScrollOnRefresh !== false;
    const scrollState = preserveScroll ? captureScrollState(app) : null;
    const lockScroll = preserveScroll && opts.lockScroll !== false && Number(cfg?.settings?.preserveScrollLockMs ?? 0) > 0;
    const stopScrollLock = lockScroll ? startScrollLock(scrollState, { maxMs: cfg?.settings?.preserveScrollLockMs }, app) : null;

    try {
        if (opts.hard) window.paForceReload = true;
        const cmdIds = ["dataview:force-refresh-views", "dataview:dataview-force-refresh-views"];
        let refreshed = false;

        for (const id of cmdIds) {
            try {
                if (app.commands.findCommand(id)) {
                    await app.commands.executeCommandById(id);
                    refreshed = true;
                    break;
                }
            } catch (_) { }
        }

        if (!refreshed) {
            const dvPlugin = app?.plugins?.plugins?.dataview;
            if (dvPlugin?.api?.index?.touch) {
                dvPlugin.api.index.touch();
                refreshed = true;
            }
        }

        scheduleRestoreScroll(scrollState, app);
        return refreshed;
    } catch (e) {
        console.warn("paRefreshViews failed", e);
    } finally {
        if (typeof stopScrollLock === "function") {
            setTimeout(() => stopScrollLock(), Number(cfg?.settings?.preserveScrollLockMs ?? 1800));
        }
    }
}

// --- Auto Refresh Logic ---
function initAutoRefresh(app, cfg) {
    if (window.__paAutoRefreshInstalled) return;
    window.__paAutoRefreshInstalled = true;
    if (window.paDirty === undefined) window.paDirty = false;

    const debounceMs = Number(cfg?.settings?.autoRefreshDebounceMs || 900);
    const idleMs = Number(cfg?.settings?.autoRefreshIdleMs || 1200);
    let timer = null;

    const scheduleRefresh = (hard = false) => {
        if (window.__paBuilding) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(async () => {
            try {
                const lastAct = Number(window.__paUserActivityAt || 0);
                const since = Date.now() - lastAct;
                if (lastAct && since >= 0 && since < idleMs) {
                    scheduleRefresh(hard);
                    return;
                }
                const activePath = app?.workspace?.getActiveFile?.()?.path || "";
                // Hardcode: only preserve scroll on Trader Command
                const isConsole = activePath.endsWith("交易员控制台 (Trader Command)5.0.md");
                await refreshViews(app, cfg, {
                    hard,
                    preserveScroll: isConsole,
                    lockScroll: false,
                });
            } catch (e) { }
        }, debounceMs);
    };

    const shouldCare = (file) => {
        const path = file?.path || "";
        if (!path || !path.toLowerCase().endsWith(".md")) return false;
        if (path.startsWith("Templates/") || path.includes("/Templates/")) return false;
        return true;
    };

    window.paMarkDirty = (reason = "modify", path = "") => {
        window.paDirty = true;
        try {
            const p = (path || "").toString();
            if (p.includes("Daily")) window.paDirtyDaily = true;
        } catch (e) { }
        scheduleRefresh(false);
    };

    const onModify = (file) => {
        if (!shouldCare(file)) return;
        window.paMarkDirty("modify", file.path);
    };

    app.vault.on("modify", onModify);
    app.vault.on("rename", onModify);
    app.vault.on("delete", onModify);
    app.metadataCache.on("changed", onModify);
}

module.exports = {
    refreshViews,
    initAutoRefresh
};
