import * as React from "react";
import { InteractiveButton } from "../../../ui/components/InteractiveButton";

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
}) => {
    // Debug Log for Memory Counts
    React.useEffect(() => {
        if (memory && memory.cnt) {
            console.log("[CoachFocus] Memory Counts:", memory.cnt);
        } else {
            console.log("[CoachFocus] Memory or memory.cnt is missing", memory);
        }
    }, [memory]);

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

            {memory && memory.cnt ? (
                <div>
                    {(() => {
                        const sBase = (memory.cnt.sNorm ?? 0) + (memory.cnt.sRev ?? 0);
                        const mMulti = (memory.cnt.mNorm ?? 0) + (memory.cnt.mRev ?? 0);
                        const cloze = memory.cnt.cloze ?? 0;
                        const total = sBase + mMulti + cloze;
                        const seg = (val: number) => {
                            if (total === 0) return "0px";
                            return `${(val / total) * 100}%`;
                        };
                        return (
                            <div style={{ marginBottom: "10px" }}>
                                <div
                                    style={{
                                        display: "flex",
                                        height: "8px",
                                        borderRadius: "4px",
                                        overflow: "hidden",
                                        gap: "1px",
                                        background: "var(--background-modifier-border)",
                                        marginBottom: "8px",
                                    }}
                                >
                                    <div
                                        style={{
                                            width: seg(memory.cnt?.sNorm ?? 0),
                                            background: "var(--text-muted)",
                                            opacity: 0.55,
                                        }}
                                    />
                                    <div
                                        style={{
                                            width: seg((memory.cnt?.sRev ?? 0) * 2),
                                            background: "var(--text-muted)",
                                            opacity: 0.35,
                                        }}
                                    />
                                    <div
                                        style={{
                                            width: seg(memory.cnt?.mNorm ?? 0),
                                            background: "var(--interactive-accent)",
                                            opacity: 0.55,
                                        }}
                                    />
                                    <div
                                        style={{
                                            width: seg((memory.cnt?.mRev ?? 0) * 2),
                                            background: "var(--interactive-accent)",
                                            opacity: 0.35,
                                        }}
                                    />
                                    <div
                                        style={{
                                            width: seg(memory.cnt?.cloze ?? 0),
                                            background: "var(--interactive-accent)",
                                            opacity: 0.85,
                                        }}
                                    />
                                </div>

                                <div
                                    style={{
                                        display: "grid",
                                        gridTemplateColumns: "1fr 1fr 1fr",
                                        gap: "10px",
                                        marginBottom: "10px",
                                    }}
                                >
                                    <div
                                        style={{
                                            border:
                                                "1px solid var(--background-modifier-border)",
                                            borderRadius: "8px",
                                            padding: "10px",
                                            textAlign: "center",
                                            background: "rgba(var(--mono-rgb-100), 0.02)",
                                        }}
                                    >
                                        <div
                                            style={{
                                                color: "var(--text-muted)",
                                                fontSize: "0.75em",
                                                fontWeight: 700,
                                                marginBottom: "4px",
                                            }}
                                        >
                                            基础
                                        </div>
                                        <div style={{ fontWeight: 800 }}>{sBase}</div>
                                    </div>

                                    <div
                                        style={{
                                            border:
                                                "1px solid var(--background-modifier-border)",
                                            borderRadius: "8px",
                                            padding: "10px",
                                            textAlign: "center",
                                            background: "rgba(var(--mono-rgb-100), 0.02)",
                                        }}
                                    >
                                        <div
                                            style={{
                                                color: "var(--text-muted)",
                                                fontSize: "0.75em",
                                                fontWeight: 700,
                                                marginBottom: "4px",
                                            }}
                                        >
                                            多选
                                        </div>
                                        <div style={{ fontWeight: 800 }}>{mMulti}</div>
                                    </div>

                                    <div
                                        style={{
                                            border:
                                                "1px solid var(--background-modifier-border)",
                                            borderRadius: "8px",
                                            padding: "10px",
                                            textAlign: "center",
                                            background: "rgba(var(--mono-rgb-100), 0.02)",
                                        }}
                                    >
                                        <div
                                            style={{
                                                color: "var(--text-muted)",
                                                fontSize: "0.75em",
                                                fontWeight: 700,
                                                marginBottom: "4px",
                                            }}
                                        >
                                            填空
                                        </div>
                                        <div style={{ fontWeight: 800 }}>{cloze}</div>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

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

                    {(() => {
                        const canRecommendFocus =
                            !memoryIgnoreFocus &&
                            memory.due > 0 &&
                            Boolean(memory.focusFile);

                        const focusRec =
                            canRecommendFocus && memory.focusFile
                                ? {
                                    type: "Focus" as const,
                                    title: memory.focusFile.name.replace(/\.md$/i, ""),
                                    path: memory.focusFile.path,
                                    desc: `到期: ${memory.focusFile.due} | 易度: ${memory.focusFile.avgEase}`,
                                }
                                : null;

                        const courseRec = course?.hybridRec
                            ? (() => {
                                const rec = course.hybridRec;
                                const title = String(
                                    rec.data.t || rec.data.q || "推荐"
                                );
                                const path = String((rec.data as any).path || "");
                                const desc = rec.type === "New" ? "新主题" : "闪卡测验";
                                return { type: rec.type, title, path, desc } as const;
                            })()
                            : null;

                        const quiz =
                            memory.quizPool.length > 0
                                ? memory.quizPool[
                                Math.max(0, memoryShakeIndex) % memory.quizPool.length
                                ]
                                : null;
                        const randomRec = quiz
                            ? {
                                type: "Shake" as const,
                                title: String(quiz.q || quiz.file),
                                path: String(quiz.path),
                                desc: "🎲 随机抽取",
                            }
                            : null;

                        const rec = focusRec ?? courseRec ?? randomRec;
                        if (!rec) return null;

                        const label =
                            rec.type === "Focus"
                                ? "🔥 优先复习"
                                : rec.type === "New"
                                    ? "🚀 推荐"
                                    : rec.type === "Review"
                                        ? "🔄 推荐"
                                        : "🎲 随机抽取";

                        const onShake = () => {
                            setMemoryIgnoreFocus(true);
                            if (memory.quizPool.length > 0) {
                                const next = Math.floor(
                                    Math.random() * memory.quizPool.length
                                );
                                setMemoryShakeIndex(next);
                            } else {
                                setMemoryShakeIndex((x) => x + 1);
                            }
                        };

                        return (
                            <div
                                style={{
                                    border: "1px solid var(--background-modifier-border)",
                                    borderRadius: "10px",
                                    padding: "10px",
                                    background: "rgba(var(--mono-rgb-100), 0.03)",
                                    marginBottom: "10px",
                                    display: "flex",
                                    alignItems: "flex-start",
                                    justifyContent: "space-between",
                                    gap: "12px",
                                }}
                            >
                                <div style={{ flex: "1 1 auto" }}>
                                    <div
                                        style={{
                                            fontSize: "0.85em",
                                            fontWeight: 700,
                                            color: "var(--text-muted)",
                                            marginBottom: "6px",
                                        }}
                                    >
                                        {label}
                                    </div>
                                    <div style={{ marginBottom: "6px" }}>
                                        <InteractiveButton
                                            interaction="text"
                                            onClick={async () => {
                                                // Coach Focus Item Click Handler
                                                const targetPath = String(rec.path);

                                                if (rec.type === 'Focus' || rec.type === 'Review') {
                                                    // Targeted Review Logic:
                                                    // 1. Open the file first (so it becomes active)
                                                    await openFile(targetPath);

                                                    // 2. Trigger "Review Request" for this specific file
                                                    // We give a small delay to ensure file is active, then try to trigger "review-note"
                                                    if (runCommand) {
                                                        setTimeout(() => {
                                                            // Try verified commands from main.js source
                                                            const noteCommands = [
                                                                "obsidian-spaced-repetition:srs-review-flashcards-in-note", // Correct ID
                                                                "obsidian-spaced-repetition:srs-open-review-queue-view", // Queue
                                                                "obsidian-spaced-repetition:review-note", // Legacy/Fallback
                                                            ];
                                                            for (const cmd of noteCommands) {
                                                                console.log(`[CoachFocus] Trying command: ${cmd}`);
                                                                if (runCommand(cmd)) return;
                                                            }
                                                            console.warn("[CoachFocus] Failed to trigger note review command");
                                                        }, 200);
                                                    }
                                                    return;
                                                }
                                                // Default: Just open file
                                                await openFile(targetPath);
                                            }}
                                            style={{ fontWeight: 800 }}
                                        >
                                            {String(rec.title)}
                                        </InteractiveButton>
                                    </div>
                                    <div
                                        style={{
                                            color: "var(--text-faint)",
                                            fontSize: "0.85em",
                                        }}
                                    >
                                        {rec.desc}
                                    </div>
                                </div>

                                <InteractiveButton
                                    className="pa-btn--small"
                                    onClick={onShake}
                                    title="摇一摇换题（跳过优先）"
                                >
                                    🎲
                                </InteractiveButton>
                            </div>
                        );
                    })()}

                    {memory.focusFile ? (
                        <div
                            style={{
                                marginBottom: "10px",
                                color: "var(--text-muted)",
                                fontSize: "0.9em",
                            }}
                        >
                            焦点：{" "}
                            <InteractiveButton
                                interaction="text"
                                onClick={async () => {
                                    if (runCommand) {
                                        // 1. Open File
                                        if (memory.focusFile) await openFile(memory.focusFile.path);

                                        // 2. Trigger Targeted Chain
                                        setTimeout(() => {
                                            const noteCommands = [
                                                "obsidian-spaced-repetition:srs-review-flashcards-in-note",
                                                "obsidian-spaced-repetition:srs-open-review-queue-view"
                                            ];
                                            for (const cmd of noteCommands) {
                                                if (runCommand(cmd)) return;
                                            }
                                        }, 200);
                                    }
                                    if (!runCommand && onAction && can && can("srs:review-flashcards")) {
                                        onAction("srs:review-flashcards");
                                        return;
                                    }
                                    // Fallback for global review button if needed logic here
                                }}
                                style={{ fontWeight: 600 }}
                            >
                                {memory.focusFile.name.replace(/\.md$/i, "")}
                            </InteractiveButton>
                            <span
                                style={{ marginLeft: "8px", color: "var(--text-faint)" }}
                            >
                                到期: {memory.focusFile.due} | 易度:{" "}
                                {memory.focusFile.avgEase}
                            </span>
                        </div>
                    ) : (
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
                                marginBottom: "6px",
                                fontSize: "0.85em",
                                display: "flex",
                                alignItems: "center",
                                gap: "6px"
                            }}>
                                <span>🎲</span>
                                <span>随机抽题</span>
                                <span style={{
                                    color: "var(--text-muted)",
                                    fontWeight: 400
                                }}>({settings.srsRandomQuizCount})</span>
                            </div>
                            {/* 两列网格布局 */}
                            <div style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                gap: "4px"
                            }}>
                                {memory.quizPool.map((q: any, idx: number) => (
                                    <div
                                        key={`q-${idx}`}
                                        onClick={async () => {
                                            console.log("[CoachFocus] Opening random quiz file:", q.path);
                                            await openFile(q.path);
                                        }}
                                        style={{
                                            padding: "6px 8px",
                                            background: "var(--background-primary)",
                                            borderRadius: "4px",
                                            border: "1px solid var(--background-modifier-border)",
                                            fontSize: "0.8em",
                                            cursor: "pointer",
                                            transition: "all 0.15s ease",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = "rgba(var(--interactive-accent-rgb), 0.1)";
                                            e.currentTarget.style.borderColor = "var(--interactive-accent)";
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = "var(--background-primary)";
                                            e.currentTarget.style.borderColor = "var(--background-modifier-border)";
                                        }}
                                    >
                                        {q.q || q.file}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div
                            style={{ color: "var(--text-faint)", fontSize: "0.9em" }}
                        >
                            在 #flashcards 笔记中未找到可抽取题库。
                        </div>
                    )}
                </div>
            ) : (
                <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
                    记忆数据不可用。
                </div>
            )
            }
        </div >
    );
};
