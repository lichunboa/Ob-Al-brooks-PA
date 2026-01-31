import { useEffect } from "react";
import type { TradeRecord } from "../core/contracts";
import type { StrategyNoteFrontmatter } from "../core/manager";
import type { PaTagSnapshot, SchemaIssueItem } from "../types";
import { isEmpty, pickVal } from "../utils/validation-utils";

export function useSchemaScanner(
    trades: TradeRecord[],
    loadStrategyNotes: (() => Promise<StrategyNoteFrontmatter[]>) | undefined,
    loadPaTagSnapshot: (() => Promise<PaTagSnapshot>) | undefined,
    setPaTagSnapshot: (snapshot: PaTagSnapshot | undefined) => void,
    setSchemaIssues: (issues: SchemaIssueItem[]) => void,
    setSchemaScanNote: (note: string | undefined) => void,
) {
    useEffect(() => {
        let cancelled = false;

        const run = async () => {
            const notes: string[] = [];

            // --- Minimal-burden Schema issues (Trade) ---
            const tradeIssues: SchemaIssueItem[] = [];
            for (const t of trades) {
                const isCompleted =
                    t.outcome === "win" ||
                    t.outcome === "loss" ||
                    t.outcome === "scratch";
                if (!isCompleted) continue;

                if (isEmpty(t.ticker)) {
                    tradeIssues.push({
                        path: t.path,
                        name: t.name,
                        key: "品种/ticker",
                        type: "❌ 缺少必填",
                    });
                }
                if (isEmpty(t.timeframe)) {
                    tradeIssues.push({
                        path: t.path,
                        name: t.name,
                        key: "时间周期/timeframe",
                        type: "❌ 缺少必填",
                    });
                }
                if (isEmpty(t.direction)) {
                    tradeIssues.push({
                        path: t.path,
                        name: t.name,
                        key: "方向/direction",
                        type: "❌ 缺少必填",
                    });
                }

                // “形态/策略”二选一：至少有一个即可
                const hasPatterns =
                    Array.isArray(t.patternsObserved) &&
                    t.patternsObserved.filter((p) => !isEmpty(p)).length > 0;
                // v5 口径：strategyName / setupKey / setupCategory 任意一个可视作“已填策略维度”
                const hasStrategy =
                    !isEmpty(t.strategyName) ||
                    !isEmpty((t as any).setupKey) ||
                    !isEmpty(t.setupCategory);
                if (!hasPatterns && !hasStrategy) {
                    tradeIssues.push({
                        path: t.path,
                        name: t.name,
                        key: "观察到的形态/patterns_observed",
                        type: "❌ 缺少必填(二选一)",
                    });
                }
            }

            // --- Minimal-burden Schema issues (Strategy) ---
            let strategyIssues: SchemaIssueItem[] = [];
            if (loadStrategyNotes) {
                try {
                    const strategyNotes = await loadStrategyNotes();
                    strategyIssues = strategyNotes.flatMap((n) => {
                        const fm = (n.frontmatter ?? {}) as Record<string, any>;
                        const out: SchemaIssueItem[] = [];
                        const name =
                            n.path.split("/").pop()?.replace(/\.md$/i, "") ?? n.path;
                        const strategy = pickVal(fm, [
                            "策略名称/strategy_name",
                            "strategy_name",
                            "策略名称",
                        ]);
                        const patterns = pickVal(fm, [
                            "观察到的形态/patterns_observed",
                            "patterns_observed",
                            "观察到的形态",
                        ]);
                        if (isEmpty(strategy)) {
                            out.push({
                                path: n.path,
                                name,
                                key: "策略名称/strategy_name",
                                type: "❌ 缺少必填",
                                val: "",
                            });
                        }
                        if (isEmpty(patterns)) {
                            out.push({
                                path: n.path,
                                name,
                                key: "观察到的形态/patterns_observed",
                                type: "❌ 缺少必填",
                                val: "",
                            });
                        }
                        return out;
                    });
                } catch (e) {
                    notes.push(
                        `策略扫描失败：${e instanceof Error ? e.message : String(e)}`
                    );
                }
            } else {
                notes.push("策略扫描不可用：将仅基于交易索引进行 Schema 检查");
            }

            // --- PA tag snapshot (Tag panorama KPIs) ---
            let paSnap: PaTagSnapshot | undefined = undefined;
            if (loadPaTagSnapshot) {
                try {
                    paSnap = await loadPaTagSnapshot();
                } catch (e) {
                    notes.push(
                        `#PA 标签扫描失败：${e instanceof Error ? e.message : String(e)}`
                    );
                }
            } else {
                notes.push("#PA 标签扫描不可用：将不显示全库标签全景");
            }

            if (cancelled) return;
            setPaTagSnapshot(paSnap);
            setSchemaIssues([...tradeIssues, ...strategyIssues]);
            setSchemaScanNote(notes.length ? notes.join("；") : undefined);
        };

        void run();
        return () => {
            cancelled = true;
        };
    }, [trades, loadStrategyNotes, loadPaTagSnapshot, setPaTagSnapshot, setSchemaIssues, setSchemaScanNote]);
}
