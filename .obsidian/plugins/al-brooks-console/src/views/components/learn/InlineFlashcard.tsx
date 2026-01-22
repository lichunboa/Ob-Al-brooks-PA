import * as React from "react";
import { InteractiveButton } from "../../../ui/components/InteractiveButton";
import { MarkdownBlock } from "../../../ui/components/MarkdownBlock";
import { CardSchedule, previewIntervals } from "../../../core/srs-scheduler";

/**
 * 卡片类型
 */
export type FlashcardType = "basic" | "cloze" | "multiline";

/**
 * InlineFlashcard Props
 */
export interface InlineFlashcardProps {
    // 卡片数据
    question: string;      // 问题内容（填空题使用 ==xxx== 标记，会被解析为 [...]）
    answer?: string;       // 答案（可选，基础卡片是 :: 后面的内容）
    rawCardLine?: string;  // 原始卡片行（用于定位 SR 标记）
    sourcePath: string;    // 来源笔记路径
    sourceFile: string;    // 来源笔记名称
    cardType: FlashcardType;
    currentSchedule?: CardSchedule;  // 当前调度信息

    // 策略关联（可选）
    relatedStrategy?: string;
    strategyWinRate?: number;

    // 回调函数
    onOpenSource?: () => void;       // 打开来源笔记
    onNext?: () => void;             // 下一张卡片
    onReviewComplete?: (response: "easy" | "good" | "hard" | "again") => void;
    onJumpToSRS?: () => void;         // 跳转到 SRS 复习此文件
    onJumpToEdit?: () => void;        // 跳转到笔记编辑此卡片

    // 样式
    style?: React.CSSProperties;
}

/**
 * 解析填空题文本，将 ==xxx== 替换为 [...]
 */
function parseClozeText(text: string): { display: string; answers: string[] } {
    const answers: string[] = [];
    const display = text.replace(/==([^=]+)==/g, (_, content) => {
        answers.push(content);
        return "[...]";
    });
    return { display, answers };
}

/**
 * 内联卡片复习组件
 * 在界面内直接显示卡片内容，支持填空题和问答题
 */
export const InlineFlashcard: React.FC<InlineFlashcardProps> = ({
    question,
    answer,
    rawCardLine,
    sourcePath,
    sourceFile,
    cardType,
    currentSchedule,
    relatedStrategy,
    strategyWinRate,
    onOpenSource,
    onNext,
    onReviewComplete,
    onJumpToSRS,
    onJumpToEdit,
    style,
}) => {
    // 是否显示答案
    const [showAnswer, setShowAnswer] = React.useState(false);

    // 预计间隔（显示在按钮上）
    const intervals = React.useMemo(() => {
        return previewIntervals(currentSchedule);
    }, [currentSchedule]);

    // 解析卡片内容
    const parsed = React.useMemo(() => {
        // 处理 Anki 语法 {{c1::xxx}} -> 显示为 [...]，答案为 xxx
        const processAnkiSyntax = (text: string) => {
            const ankiRegex = /\{\{c\d+::([^}]+)\}\}/g;
            const matches = text.matchAll(ankiRegex);
            const ankiAnswers: string[] = [];
            for (const m of matches) {
                ankiAnswers.push(m[1]);
            }
            const displayText = text.replace(ankiRegex, "[...]");
            return { displayText, ankiAnswers };
        };

        // 填空题：question 已经是用 [...] 替换过的，answer 是填空答案
        if (cardType === "cloze") {
            // answer 可能是 "答案1, 答案2" 格式
            const answers = answer ? answer.split(", ") : [];
            // 同时处理可能残留的 Anki 语法
            const { displayText, ankiAnswers } = processAnkiSyntax(question);
            return {
                display: displayText,
                answers: [...answers, ...ankiAnswers].filter(a => a.length > 0)
            };
        }

        // 基础问答卡片：question 是问题，answer 是答案
        // 也处理可能残留的 Anki 语法
        const { displayText, ankiAnswers } = processAnkiSyntax(question);
        const baseAnswers = answer ? [answer] : [];
        return {
            display: displayText,
            answers: [...baseAnswers, ...ankiAnswers].filter(a => a.length > 0)
        };
    }, [question, answer, cardType]);

    // 重置状态
    const handleNext = () => {
        setShowAnswer(false);
        onNext?.();
    };

    // 处理复习评估
    const handleReview = (response: "easy" | "good" | "hard" | "again") => {
        onReviewComplete?.(response);
        handleNext();
    };

    return (
        <div
            style={{
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "10px",
                overflow: "hidden",
                background: "var(--background-primary)",
                ...style,
            }}
        >
            {/* 卡片头部 - 来源信息 */}
            <div
                style={{
                    padding: "8px 12px",
                    background: "var(--background-secondary)",
                    borderBottom: "1px solid var(--background-modifier-border)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "0.75em",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div
                        style={{
                            color: "var(--text-faint)",
                            cursor: onOpenSource ? "pointer" : "default",
                            textDecoration: onOpenSource ? "underline" : "none",
                        }}
                        onClick={onOpenSource}
                    >
                        📁 {sourceFile.replace(/\.md$/i, "")}
                    </div>
                    {onJumpToSRS && (
                        <div
                            onClick={onJumpToSRS}
                            style={{
                                cursor: "pointer",
                                padding: "2px 6px",
                                background: "rgba(255, 149, 0, 0.15)",
                                color: "#ff9500",
                                borderRadius: "4px",
                                fontSize: "0.7em",
                                fontWeight: 600,
                            }}
                            title="在 SRS 复习此笔记的所有卡片"
                        >
                            🔗 SRS
                        </div>
                    )}
                    {onJumpToEdit && (
                        <div
                            onClick={onJumpToEdit}
                            style={{
                                cursor: "pointer",
                                padding: "2px 6px",
                                background: "rgba(59, 130, 246, 0.15)",
                                color: "#3b82f6",
                                borderRadius: "4px",
                                fontSize: "0.7em",
                                fontWeight: 600,
                            }}
                            title="跳转到笔记编辑此卡片"
                        >
                            ✏️ 编辑
                        </div>
                    )}
                </div>
                {relatedStrategy && (
                    <div style={{
                        padding: "2px 6px",
                        background: strategyWinRate !== undefined && strategyWinRate < 50
                            ? "rgba(239, 68, 68, 0.15)"
                            : "rgba(34, 197, 94, 0.15)",
                        color: strategyWinRate !== undefined && strategyWinRate < 50
                            ? "#ef4444"
                            : "#22c55e",
                        borderRadius: "4px",
                        fontWeight: 600,
                    }}>
                        🎯 {relatedStrategy} {strategyWinRate !== undefined && `${strategyWinRate}%`}
                    </div>
                )}
            </div>

            {/* 卡片内容 - 问题区域 */}
            <div
                style={{
                    padding: "16px",
                    minHeight: "80px",
                }}
            >
                {cardType === "cloze" ? (
                    // 填空题：显示带 [...] 的问题
                    <div
                        style={{
                            fontSize: "1em",
                            lineHeight: 1.6,
                            color: "var(--text-normal)",
                        }}
                    >
                        {parsed.display.split("[...]").map((part, idx, arr) => (
                            <React.Fragment key={idx}>
                                {part}
                                {idx < arr.length - 1 && (
                                    <span
                                        style={{
                                            color: showAnswer ? "#22c55e" : "#3b82f6",
                                            fontWeight: 600,
                                            padding: "0 4px",
                                            background: showAnswer
                                                ? "rgba(34, 197, 94, 0.1)"
                                                : "rgba(59, 130, 246, 0.1)",
                                            borderRadius: "4px",
                                        }}
                                    >
                                        {showAnswer && parsed.answers[idx]
                                            ? parsed.answers[idx]
                                            : "[...]"}
                                    </span>
                                )}
                            </React.Fragment>
                        ))}
                    </div>
                ) : (
                    // 基础问答卡片：问题和答案分区显示
                    <div>
                        {/* 问题 - 使用 Markdown 渲染支持图片 */}
                        <div
                            style={{
                                fontSize: "1em",
                                lineHeight: 1.6,
                                color: "var(--text-normal)",
                            }}
                        >
                            <MarkdownBlock markdown={parsed.display} sourcePath={sourcePath} />
                        </div>

                        {/* 答案区域（显示答案后） */}
                        {showAnswer && parsed.answers[0] && (
                            <>
                                {/* 虚线分隔符 */}
                                <div style={{
                                    borderTop: "1px dashed var(--background-modifier-border)",
                                    margin: "12px 0",
                                }} />
                                {/* 答案内容 - 使用 Markdown 渲染支持图片 */}
                                <div
                                    style={{
                                        fontSize: "1em",
                                        lineHeight: 1.6,
                                        color: "#22c55e",
                                    }}
                                >
                                    <MarkdownBlock markdown={parsed.answers[0]} sourcePath={sourcePath} />
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* 卡片底部 - 操作按钮 */}
            <div
                style={{
                    padding: "12px",
                    borderTop: "1px solid var(--background-modifier-border)",
                    background: "var(--background-secondary)",
                }}
            >
                {!showAnswer ? (
                    // 显示答案按钮
                    <InteractiveButton
                        onClick={() => setShowAnswer(true)}
                        style={{
                            width: "100%",
                            padding: "10px",
                            background: "#3b82f6",
                            color: "white",
                            border: "none",
                            borderRadius: "6px",
                            fontSize: "0.9em",
                            fontWeight: 600,
                            cursor: "pointer",
                        }}
                    >
                        显示答案
                    </InteractiveButton>
                ) : (
                    // 复习评估按钮
                    <div style={{ display: "flex", gap: "8px" }}>
                        <InteractiveButton
                            onClick={() => handleReview("again")}
                            style={{
                                flex: 1,
                                padding: "8px 4px",
                                background: "rgba(239, 68, 68, 0.15)",
                                color: "#ef4444",
                                border: "1px solid rgba(239, 68, 68, 0.3)",
                                borderRadius: "6px",
                                fontSize: "0.75em",
                                fontWeight: 600,
                                textAlign: "center" as const,
                            }}
                        >
                            <div>重来</div>
                            <div style={{ fontSize: "0.85em", opacity: 0.8 }}>{intervals.again}</div>
                        </InteractiveButton>
                        <InteractiveButton
                            onClick={() => handleReview("hard")}
                            style={{
                                flex: 1,
                                padding: "8px 4px",
                                background: "rgba(245, 158, 11, 0.15)",
                                color: "#f59e0b",
                                border: "1px solid rgba(245, 158, 11, 0.3)",
                                borderRadius: "6px",
                                fontSize: "0.75em",
                                fontWeight: 600,
                                textAlign: "center" as const,
                            }}
                        >
                            <div>较难</div>
                            <div style={{ fontSize: "0.85em", opacity: 0.8 }}>{intervals.hard}</div>
                        </InteractiveButton>
                        <InteractiveButton
                            onClick={() => handleReview("good")}
                            style={{
                                flex: 1,
                                padding: "8px 4px",
                                background: "rgba(34, 197, 94, 0.15)",
                                color: "#22c55e",
                                border: "1px solid rgba(34, 197, 94, 0.3)",
                                borderRadius: "6px",
                                fontSize: "0.75em",
                                fontWeight: 600,
                                textAlign: "center" as const,
                            }}
                        >
                            <div>记得</div>
                            <div style={{ fontSize: "0.85em", opacity: 0.8 }}>{intervals.good}</div>
                        </InteractiveButton>
                        <InteractiveButton
                            onClick={() => handleReview("easy")}
                            style={{
                                flex: 1,
                                padding: "8px 4px",
                                background: "rgba(59, 130, 246, 0.15)",
                                color: "#3b82f6",
                                border: "1px solid rgba(59, 130, 246, 0.3)",
                                borderRadius: "6px",
                                fontSize: "0.75em",
                                fontWeight: 600,
                                textAlign: "center" as const,
                            }}
                        >
                            <div>简单</div>
                            <div style={{ fontSize: "0.85em", opacity: 0.8 }}>{intervals.easy}</div>
                        </InteractiveButton>
                    </div>
                )}

                {/* 下一张按钮（可选） */}
                {onNext && showAnswer && (
                    <InteractiveButton
                        onClick={handleNext}
                        style={{
                            width: "100%",
                            marginTop: "8px",
                            padding: "8px",
                            background: "transparent",
                            color: "var(--text-muted)",
                            border: "1px solid var(--background-modifier-border)",
                            borderRadius: "6px",
                            fontSize: "0.8em",
                            cursor: "pointer",
                        }}
                    >
                        跳过 →
                    </InteractiveButton>
                )}
            </div>
        </div>
    );
};
