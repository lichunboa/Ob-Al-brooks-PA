import * as React from "react";
import { InteractiveButton } from "../../../ui/components/InteractiveButton";
import { InlineFlashcard } from "./InlineFlashcard";
import { MemoryCalendar } from "./MemoryCalendar";
import { ProgressChart } from "./ProgressChart";
import { updateCardSrTag, parseCardScheduleFromLine } from "../../../core/srs-writer";
import { ReviewResponse } from "../../../core/srs-scheduler";
import {
    getSRStats,
    getSRSettings,
    openFlashcardReview,
    startGlobalReview,
    isSRPluginAvailable,
    getWeightedCardRecommendations,
    type StrategyPerformance
} from "../../../core/srs-bridge";

/**
 * CoachFocus Props接口
 */
export interface CoachFocusProps {
    // 数据Props
    memory: any;
    course: any;
    settings: any;
    memoryIgnoreFocus: boolean;
    memoryShakeIndex: number;

    // 函数Props
    openFile: (path: string) => Promise<void>;
    setMemoryIgnoreFocus: (value: boolean) => void;
    setMemoryShakeIndex: (value: number | ((prev: number) => number)) => void;

    // 样式Props
    buttonSmStyle: React.CSSProperties;
    textButtonStyle: React.CSSProperties;
    textButtonSemiboldStyle: React.CSSProperties;
    textButtonStrongStyle: React.CSSProperties;

    // 常量Props
    V5_COLORS: any;
    onAction?: (actionId: string, param?: any) => void;
    can?: (actionId: string) => boolean;
    runCommand?: (commandId: string) => boolean;

    // 学习联动Props
    poorPerformingStrategies?: Array<{
        name: string;
        winRate: number;
        trades: number;
        pnl: number;
        path?: string;
    }>;

    // App 实例（用于写入 SR 标记）
    app?: any;
}

/**
 * 教练焦点组件
 * 显示记忆卡片统计、推荐复习和随机抽题
 */
export const CoachFocus: React.FC<CoachFocusProps> = ({
    memory,
    course,
    settings,
    memoryIgnoreFocus,
    memoryShakeIndex,
    openFile,
    setMemoryIgnoreFocus,
    setMemoryShakeIndex,
    buttonSmStyle,
    textButtonStyle,
    textButtonSemiboldStyle,
    textButtonStrongStyle,
    V5_COLORS,
    onAction,
    can,
    runCommand,
    poorPerformingStrategies,
    app,
}) => {
    // 当前显示的卡片索引
    const [currentQuizIndex, setCurrentQuizIndex] = React.useState(0);
    // 批次 key（用于触发随机重排）
    const [quizBatchKey, setQuizBatchKey] = React.useState(0);

    // 获取 SRS 真实统计数据
    const srStats = React.useMemo(() => {
        if (!app) return null;
        return getSRStats(app);
    }, [app]);

    // SRS 是否可用
    const srAvailable = React.useMemo(() => {
        return app ? isSRPluginAvailable(app) : false;
    }, [app]);

    // 合并 SRS 数据和我们的 memory 数据
    const mergedStats = React.useMemo(() => {
        if (srStats) {
            return {
                total: srStats.totalCards,        // 所有卡片
                reviewed: srStats.reviewedCards,  // 已复习过的
                due: srStats.dueCards,            // 到期
                new: srStats.newCards,            // 新卡片（未复习）
                young: srStats.youngCards,        // 年轻卡片
                mature: srStats.matureCards,      // 成熟卡片
                masteryPct: srStats.masteryPct,   // 掌握度（基于已复习卡片）
                load7d: memory?.load7d ?? 0,
                loadNext7: memory?.loadNext7 ?? [],
            };
        }
        // 回退到我们的数据（但掌握度不使用旧算法，需要 SRS 来计算真实掌握度）
        // 掌握度计算：成熟卡片/(成熟+年轻)，无法从旧数据计算，设为 0
        return {
            total: memory?.total ?? 0,
            reviewed: 0,  // 无法知道已复习多少
            due: memory?.due ?? 0,
            new: memory?.total ?? 0,  // 假设都是新卡片
            young: 0,
            mature: 0,
            masteryPct: 0,  // 无法计算真实掌握度，显示 0
            load7d: memory?.load7d ?? 0,
            loadNext7: memory?.loadNext7 ?? [],
        };
    }, [srStats, memory]);

    // 处理"开始复习"按钮 - 使用 SRS 原生复习
    const handleStartReview = React.useCallback(() => {
        if (app && srAvailable) {
            startGlobalReview(app);
        } else if (runCommand) {
            runCommand("obsidian-spaced-repetition:srs-review-flashcards");
        }
    }, [app, srAvailable, runCommand]);

    // 处理跳转到特定文件复习
    const handleReviewFile = React.useCallback(async (filePath: string) => {
        if (app && srAvailable) {
            const success = await openFlashcardReview(app, filePath);
            if (!success) {
                // 回退到打开文件
                openFile(filePath);
            }
        } else {
            openFile(filePath);
        }
    }, [app, srAvailable, openFile]);

    // 获取策略表现数据并转换为所需格式
    const strategyPerformances = React.useMemo((): StrategyPerformance[] => {
        if (!poorPerformingStrategies?.length) return [];
        return poorPerformingStrategies.map(s => ({
            name: s.name,
            winRate: s.winRate / 100,  // 转换为 0-1
            trades: s.trades,
            pnl: s.pnl,
        }));
    }, [poorPerformingStrategies]);

    // 智能权重推荐（基于策略表现 + SRS 数据）
    const weightedRecommendations = React.useMemo(() => {
        if (!app || !srAvailable) return [];
        return getWeightedCardRecommendations(app, strategyPerformances, 10);
    }, [app, srAvailable, strategyPerformances]);

    // 策略匹配的 quizPool（优先推荐低胜率策略相关卡片）
    const enhancedQuizPool = React.useMemo(() => {
        if (!memory?.quizPool?.length) return [];

        // 从卡片文件名/路径匹配策略
        const matchStrategy = (item: any) => {
            if (!poorPerformingStrategies?.length) return null;

            for (const strategy of poorPerformingStrategies) {
                // 匹配文件名或路径中包含策略名称
                const strategyName = strategy.name.toLowerCase();
                const fileName = item.file.toLowerCase();
                const filePath = item.path.toLowerCase();

                if (fileName.includes(strategyName) || filePath.includes(strategyName)) {
                    return strategy;
                }

                // 更宽松的匹配：提取策略名称中的关键词
                const keywords = strategyName.split(/[-_\s]+/).filter((k: string) => k.length > 2);
                for (const keyword of keywords) {
                    if (fileName.includes(keyword) || filePath.includes(keyword)) {
                        return strategy;
                    }
                }
            }
            return null;
        };

        // 增强 quizPool 添加策略关联
        const enhanced = memory.quizPool.map((item: any) => {
            const matchedStrategy = matchStrategy(item);
            return {
                ...item,
                relatedStrategy: matchedStrategy?.name,
                strategyWinRate: matchedStrategy?.winRate,
            };
        });

        // 使用 quizBatchKey 作为随机种子进行 Fisher-Yates 洗牌
        const shuffled = [...enhanced];
        for (let i = shuffled.length - 1; i > 0; i--) {
            // 使用 quizBatchKey 影响随机性
            const j = Math.floor(((quizBatchKey * 1234567 + i) % 1000) / 1000 * (i + 1)) % (i + 1);
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        return shuffled;
    }, [memory?.quizPool, poorPerformingStrategies, quizBatchKey]);

    // 切换到下一张卡片（真正随机）
    const handleNextQuiz = React.useCallback(() => {
        if (enhancedQuizPool.length > 1) {
            // 随机选择一个不同于当前的索引
            let newIndex: number;
            do {
                newIndex = Math.floor(Math.random() * enhancedQuizPool.length);
            } while (newIndex === currentQuizIndex && enhancedQuizPool.length > 1);
            setCurrentQuizIndex(newIndex);
        }
    }, [enhancedQuizPool.length, currentQuizIndex]);

    // 当 quizPool 变化时重置索引
    React.useEffect(() => {
        setCurrentQuizIndex(0);
    }, [memory?.quizPool]);


    return (
        <div
            style={{
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "10px",
                padding: "12px",
                marginBottom: "16px",
                background: "var(--background-primary)",
            }}
        >
            <div style={{ fontWeight: 600, marginBottom: "10px" }}>
                教练焦点{" "}
                <span style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>
                    (Coach Focus)
                </span>
            </div>

            {/* 需要加强的策略（学习与复盘联动） */}
            {poorPerformingStrategies && poorPerformingStrategies.length > 0 && (
                <div style={{
                    marginBottom: "12px",
                    padding: "10px",
                    background: "rgba(239, 68, 68, 0.08)",
                    border: "1px solid rgba(239, 68, 68, 0.25)",
                    borderRadius: "8px",
                }}>
                    <div style={{
                        fontSize: "0.85em",
                        fontWeight: 600,
                        color: "#ef4444",
                        marginBottom: "8px",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                    }}>
                        <span>⚠️</span>
                        <span>需要加强</span>
                        <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>
                            （复盘分析发现）
                        </span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {poorPerformingStrategies.map((s) => (
                            <div
                                key={s.name}
                                onClick={() => s.path && openFile(s.path)}
                                style={{
                                    padding: "4px 10px",
                                    background: "rgba(239, 68, 68, 0.12)",
                                    borderRadius: "6px",
                                    fontSize: "0.8em",
                                    cursor: s.path ? "pointer" : "default",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    transition: "all 0.15s",
                                }}
                                onMouseEnter={(e) => {
                                    if (s.path) e.currentTarget.style.background = "rgba(239, 68, 68, 0.2)";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = "rgba(239, 68, 68, 0.12)";
                                }}
                            >
                                <span>{s.name}</span>
                                <span style={{ color: "#ef4444", fontWeight: 600 }}>
                                    {s.winRate}%
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ========== 卡片类型分布 ========== */}
            {memory && memory.cnt && (
                <div style={{ marginBottom: "10px" }}>
                    {(() => {
                        const sBase = (memory.cnt.sNorm ?? 0) + (memory.cnt.sRev ?? 0);
                        const mMulti = (memory.cnt.mNorm ?? 0) + (memory.cnt.mRev ?? 0);
                        const cloze = memory.cnt.cloze ?? 0;
                        const total = sBase + mMulti + cloze;
                        const seg = (val: number) => total === 0 ? "0px" : `${(val / total) * 100}%`;
                        return (
                            <>
                                <div style={{
                                    display: "flex",
                                    height: "6px",
                                    borderRadius: "3px",
                                    overflow: "hidden",
                                    gap: "1px",
                                    background: "var(--background-modifier-border)",
                                    marginBottom: "6px",
                                }}>
                                    <div style={{ width: seg(sBase), background: "var(--text-muted)", opacity: 0.5 }} />
                                    <div style={{ width: seg(mMulti), background: "var(--interactive-accent)", opacity: 0.6 }} />
                                    <div style={{ width: seg(cloze), background: "var(--interactive-accent)", opacity: 0.9 }} />
                                </div>
                                <div style={{
                                    display: "flex",
                                    justifyContent: "space-around",
                                    fontSize: "0.7em",
                                    color: "var(--text-muted)",
                                }}>
                                    <span>基础 <strong>{sBase}</strong></span>
                                    <span>多选 <strong>{mMulti}</strong></span>
                                    <span>填空 <strong>{cloze}</strong></span>
                                </div>
                            </>
                        );
                    })()}
                </div>
            )}

            {memory && (
                <>
                    {/* ========== 记忆日历 ========== */}
                    <MemoryCalendar
                        loadNext7={memory.loadNext7}
                        style={{ marginBottom: "12px" }}
                    />

                    {/* ========== 学习进度图表 ========== */}
                    {(srStats || memory) && (
                        <ProgressChart
                            totalCards={mergedStats.total || 0}
                            reviewedCards={mergedStats.reviewed || 0}
                            dueCards={mergedStats.due || 0}
                            load7d={mergedStats.load7d || 0}
                            style={{ marginBottom: "12px" }}
                        />
                    )}

                    {(() => {
                        const topN = (memory.topSeries || []).slice(0, 10);
                        if (topN.length === 0) return null;
                        const maxVal = Math.max(...topN.map((x: any) => x.count));
                        return (
                            <div style={{ marginBottom: "10px" }}>
                                <div
                                    style={{
                                        color: "var(--text-muted)",
                                        fontSize: "0.85em",
                                        marginBottom: "6px",
                                    }}
                                >
                                    每周焦点系列（Top 10）
                                </div>
                                <div
                                    style={{
                                        display: "flex",
                                        gap: "6px",
                                        alignItems: "flex-end",
                                        height: "60px",
                                    }}
                                >
                                    {topN.map((x: any, idx: number) => {
                                        const has = x.count > 0;
                                        const h = has ? (x.count / maxVal) * 100 : 0;
                                        return (
                                            <div
                                                key={`ts-${idx}`}
                                                style={{
                                                    flex: "1 1 0",
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    alignItems: "center",
                                                    gap: "4px",
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        width: "8px",
                                                        height: `${h}%`,
                                                        minHeight: "4px",
                                                        borderRadius: "4px",
                                                        background: has
                                                            ? V5_COLORS.accent
                                                            : "var(--background-modifier-border)",
                                                        opacity: has ? 0.85 : 0.6,
                                                    }}
                                                />
                                                <div
                                                    style={{
                                                        fontSize: "0.75em",
                                                        color: "var(--text-faint)",
                                                        lineHeight: 1,
                                                    }}
                                                >
                                                    +{idx + 1}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })()}

                    {/* ========== SRS 记忆曲线推荐区域 ========== */}
                    {memory.focusFile && (
                        <div
                            style={{
                                border: "1px solid rgba(255, 149, 0, 0.3)",
                                borderRadius: "10px",
                                padding: "12px",
                                background: "rgba(255, 149, 0, 0.05)",
                                marginBottom: "10px",
                            }}
                        >
                            <div style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                marginBottom: "8px",
                            }}>
                                <div style={{
                                    fontSize: "0.85em",
                                    fontWeight: 700,
                                    color: "#ff9500",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                }}>
                                    <span>🔥</span>
                                    <span>SRS 记忆曲线推荐</span>
                                </div>
                                {/* 复习按钮组 */}
                                <div style={{ display: "flex", gap: "6px" }}>
                                    {/* 正常复习 - 只复习到期卡片 */}
                                    <InteractiveButton
                                        className="pa-btn--small"
                                        onClick={() => {
                                            if (runCommand) {
                                                runCommand("obsidian-spaced-repetition:srs-review-flashcards");
                                            } else if (onAction) {
                                                onAction("srs:review-flashcards");
                                            }
                                        }}
                                        title="正常复习：只复习到期和新卡片"
                                        style={{
                                            fontSize: "0.7em",
                                            padding: "4px 8px",
                                            background: "rgba(34, 197, 94, 0.15)",
                                            border: "1px solid rgba(34, 197, 94, 0.3)",
                                            borderRadius: "6px",
                                        }}
                                    >
                                        📖 复习
                                    </InteractiveButton>
                                    {/* 强化复习 - 复习所有卡片 */}
                                    <InteractiveButton
                                        className="pa-btn--small"
                                        onClick={() => {
                                            if (runCommand) {
                                                runCommand("obsidian-spaced-repetition:srs-cram-flashcards");
                                            } else if (onAction) {
                                                onAction("srs:cram-flashcards");
                                            }
                                        }}
                                        title="强化复习：复习所有卡片（包括未到期）"
                                        style={{
                                            fontSize: "0.7em",
                                            padding: "4px 8px",
                                            background: "rgba(255, 149, 0, 0.15)",
                                            border: "1px solid rgba(255, 149, 0, 0.3)",
                                            borderRadius: "6px",
                                        }}
                                    >
                                        🔥 强化
                                    </InteractiveButton>
                                </div>
                            </div>
                            <div
                                onClick={async () => {
                                    if (runCommand && memory.focusFile) {
                                        await openFile(memory.focusFile.path);
                                        setTimeout(() => {
                                            runCommand("obsidian-spaced-repetition:srs-review-flashcards-in-note");
                                        }, 200);
                                    }
                                }}
                                style={{
                                    padding: "10px 12px",
                                    background: "var(--background-primary)",
                                    border: "1px solid var(--background-modifier-border)",
                                    borderRadius: "8px",
                                    cursor: "pointer",
                                    transition: "all 0.15s",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = "rgba(255, 149, 0, 0.1)";
                                    e.currentTarget.style.borderColor = "rgba(255, 149, 0, 0.4)";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = "var(--background-primary)";
                                    e.currentTarget.style.borderColor = "var(--background-modifier-border)";
                                }}
                            >
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, marginBottom: "4px" }}>
                                        {memory.focusFile.name.replace(/\.md$/i, "")}
                                    </div>
                                    <div style={{
                                        display: "flex",
                                        gap: "10px",
                                        fontSize: "0.75em",
                                        color: "var(--text-muted)",
                                    }}>
                                        <span>
                                            📅 到期: <strong style={{ color: memory.focusFile.due > 0 ? "#ef4444" : "var(--text-muted)" }}>
                                                {memory.focusFile.due}
                                            </strong>
                                        </span>
                                        <span>
                                            🧠 易度: <strong style={{
                                                color: memory.focusFile.avgEase < 200 ? "#ef4444" :
                                                    memory.focusFile.avgEase < 250 ? "#f59e0b" : "#22c55e"
                                            }}>
                                                {memory.focusFile.avgEase}
                                            </strong>
                                        </span>
                                    </div>
                                </div>
                                {/* 难度等级标签 */}
                                <div style={{
                                    padding: "4px 8px",
                                    borderRadius: "4px",
                                    fontSize: "0.7em",
                                    fontWeight: 600,
                                    background: memory.focusFile.avgEase < 200 ? "rgba(239, 68, 68, 0.15)" :
                                        memory.focusFile.avgEase < 250 ? "rgba(245, 158, 11, 0.15)" : "rgba(34, 197, 94, 0.15)",
                                    color: memory.focusFile.avgEase < 200 ? "#ef4444" :
                                        memory.focusFile.avgEase < 250 ? "#f59e0b" : "#22c55e",
                                }}>
                                    {memory.focusFile.avgEase < 200 ? "🔴 困难" :
                                        memory.focusFile.avgEase < 250 ? "🟡 中等" : "🟢 简单"}
                                </div>
                            </div>
                        </div>
                    )}


                    {/* ========== 焦点说明（当没有 focusFile 时显示） ========== */}
                    {!memory.focusFile && (
                        <div
                            style={{
                                marginBottom: "10px",
                                color: "var(--text-faint)",
                                fontSize: "0.9em",
                            }}
                        >
                            暂无焦点卡片。
                        </div>
                    )}

                    {memory.quizPool.length > 0 ? (
                        <div>
                            <div style={{
                                fontWeight: 600,
                                marginBottom: "8px",
                                fontSize: "0.85em",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                            }}>
                                <div style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                }}>
                                    <span>🎲</span>
                                    <span>随机抽题</span>
                                    <span style={{
                                        color: "var(--text-muted)",
                                        fontWeight: 400
                                    }}>({currentQuizIndex + 1}/{memory.quizPool.length})</span>
                                </div>
                                <InteractiveButton
                                    onClick={() => {
                                        setQuizBatchKey(k => k + 1);
                                        setCurrentQuizIndex(0);
                                    }}
                                    style={{
                                        fontSize: "0.75em",
                                        padding: "4px 8px",
                                        background: "transparent",
                                        border: "1px solid var(--background-modifier-border)",
                                        borderRadius: "4px",
                                    }}
                                >
                                    🔀 换一批
                                </InteractiveButton>
                            </div>

                            {/* 内联卡片组件 */}
                            {(() => {
                                const currentQuiz = enhancedQuizPool[currentQuizIndex];
                                if (!currentQuiz) return null;

                                // 解析当前卡片的调度信息
                                const currentSchedule = currentQuiz.rawQ
                                    ? parseCardScheduleFromLine(currentQuiz.rawQ)
                                    : undefined;

                                return (
                                    <InlineFlashcard
                                        key={`quiz-${currentQuizIndex}-${currentQuiz.q.substring(0, 20)}`}
                                        question={currentQuiz.q}
                                        answer={currentQuiz.answer}
                                        rawCardLine={currentQuiz.rawQ || currentQuiz.q}
                                        sourcePath={currentQuiz.path}
                                        sourceFile={currentQuiz.file}
                                        cardType={currentQuiz.type === "Cloze" ? "cloze" : "basic"}
                                        currentSchedule={currentSchedule ?? undefined}
                                        relatedStrategy={currentQuiz.relatedStrategy}
                                        strategyWinRate={currentQuiz.strategyWinRate}
                                        onOpenSource={() => openFile(currentQuiz.path)}
                                        onJumpToSRS={async () => {
                                            // 跳转到 SRS 复习此笔记
                                            if (runCommand) {
                                                await openFile(currentQuiz.path);
                                                setTimeout(() => {
                                                    runCommand("obsidian-spaced-repetition:srs-review-flashcards-in-note");
                                                }, 200);
                                            }
                                        }}
                                        onJumpToEdit={async () => {
                                            // 打开笔记并跳转到具体行
                                            if (app && currentQuiz.lineNumber) {
                                                const file = app.vault.getAbstractFileByPath(currentQuiz.path);
                                                if (file) {
                                                    const leaf = app.workspace.getLeaf();
                                                    await leaf.openFile(file as any, {
                                                        eState: { line: currentQuiz.lineNumber - 1 }  // 0-indexed
                                                    });
                                                }
                                            } else {
                                                openFile(currentQuiz.path);
                                            }
                                        }}
                                        onNext={handleNextQuiz}
                                        onReviewComplete={async (response) => {

                                            // 将响应转换为 ReviewResponse 枚举
                                            const responseMap: Record<string, ReviewResponse> = {
                                                "easy": ReviewResponse.Easy,
                                                "good": ReviewResponse.Good,
                                                "hard": ReviewResponse.Hard,
                                                "again": ReviewResponse.Again,
                                            };

                                            // 写入 SR 标记
                                            if (app) {
                                                try {
                                                    const success = await updateCardSrTag(
                                                        app,
                                                        currentQuiz.path,
                                                        currentQuiz.rawQ || currentQuiz.q,
                                                        responseMap[response],
                                                        currentSchedule ?? undefined
                                                    );
                                                    if (success) {
                                                        // 更新成功
                                                    }
                                                } catch (err) {
                                                    console.error(`[CoachFocus] Failed to update SR tag:`, err);
                                                }
                                            }

                                            handleNextQuiz();
                                        }}
                                    />
                                );
                            })()}
                        </div>

                    ) : (
                        <div
                            style={{ color: "var(--text-faint)", fontSize: "0.9em" }}
                        >
                            在 #flashcards 笔记中未找到可抽取题库。
                        </div>
                    )}
                </>
            )}
        </div>
    );
};
