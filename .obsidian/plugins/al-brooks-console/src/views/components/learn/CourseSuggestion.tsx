import * as React from "react";
import { simpleCourseId } from "../../../core/course";
import { InteractiveButton } from "../../../ui/components/InteractiveButton";

/**
 * CourseSuggestion Props接口
 */
export interface CourseSuggestionProps {
    // 数据Props
    course: any;
    courseError: string;
    courseBusy: boolean;
    settings: any;

    // 函数Props
    loadCourse: (() => void) | null;
    reloadCourse: () => void;
    openFile: (path: string) => void;

    // 样式Props
    buttonSmStyle: React.CSSProperties;
    buttonSmDisabledStyle: React.CSSProperties;
    textButtonStyle: React.CSSProperties;
    textButtonSemiboldStyle: React.CSSProperties;

    // 常量Props
    V5_COLORS: any;
}

/**
 * 课程建议组件
 * 显示课程推荐、学习进度和课程矩阵
 */
export const CourseSuggestion: React.FC<CourseSuggestionProps> = ({
    course,
    courseError,
    courseBusy,
    settings,
    loadCourse,
    reloadCourse,
    openFile,
    buttonSmStyle,
    buttonSmDisabledStyle,
    textButtonStyle,
    textButtonSemiboldStyle,
    V5_COLORS,
}) => {
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
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    marginBottom: "8px",
                }}
            >
                <div style={{ fontWeight: 600 }}>
                    课程{" "}
                    <span
                        style={{
                            fontWeight: 500,
                            color: "var(--text-muted)",
                            fontSize: "0.85em",
                        }}
                    >
                        (Course)
                    </span>
                </div>
                <InteractiveButton
                    className="pa-btn--small"
                    onClick={reloadCourse}
                    disabled={!loadCourse || courseBusy}
                >
                    刷新
                </InteractiveButton>
            </div>

            {courseError ? (
                <div style={{ color: "var(--text-error)", fontSize: "0.9em" }}>
                    {courseError}
                </div>
            ) : courseBusy ? (
                <div style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>
                    加载中…
                </div>
            ) : course && course.syllabus.length > 0 ? (
                <div>
                    {course.hybridRec
                        ? (() => {
                            const rec = course.hybridRec;
                            const sid = simpleCourseId(rec.data.id);
                            const link =
                                course.linksById[rec.data.id] || course.linksById[sid];
                            const prefix =
                                rec.type === "New" ? "🚀 继续学习" : "🔄 建议复习";
                            return (
                                <div
                                    style={{
                                        border:
                                            "1px solid var(--background-modifier-border)",
                                        borderRadius: "8px",
                                        padding: "10px",
                                        background: "rgba(var(--mono-rgb-100), 0.03)",
                                        marginBottom: "10px",
                                    }}
                                >
                                    <div
                                        style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            gap: "10px",
                                        }}
                                    >
                                        <div>
                                            {link ? (
                                                <InteractiveButton
                                                    interaction="text"
                                                    onClick={() => openFile(link.path)}
                                                    style={{ fontWeight: 600 }}
                                                >
                                                    {prefix}: {String(rec.data.t ?? rec.data.id)}
                                                </InteractiveButton>
                                            ) : (
                                                <span style={{ color: "var(--text-faint)" }}>
                                                    {prefix}: {String(rec.data.t ?? rec.data.id)}
                                                    （笔记未创建）
                                                </span>
                                            )}
                                        </div>
                                        <div
                                            style={{
                                                color: "var(--text-muted)",
                                                fontFamily: "var(--font-monospace)",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {rec.data.id}
                                        </div>
                                    </div>
                                    <div
                                        style={{
                                            marginTop: "6px",
                                            color: "var(--text-muted)",
                                            fontSize: "0.85em",
                                            display: "flex",
                                            gap: "12px",
                                            flexWrap: "wrap",
                                        }}
                                    >
                                        <span>
                                            章节: <strong>{String(rec.data.p ?? "—")}</strong>
                                        </span>
                                        <span>
                                            进度:{" "}
                                            <strong>
                                                {course.progress.doneCount}/
                                                {course.progress.totalCount}
                                            </strong>
                                        </span>
                                        <span>
                                            笔记:{" "}
                                            <strong>{link ? "已创建" : "未创建"}</strong>
                                        </span>
                                    </div>
                                </div>
                            );
                        })()
                        : null}

                    {course.upNext.length > 0 && (
                        <div
                            style={{
                                color: "var(--text-muted)",
                                fontSize: "0.9em",
                                marginBottom: "8px",
                            }}
                        >
                            接下来（窗口={settings.courseRecommendationWindow}）：{" "}
                            {course.upNext.map((x: any, idx: number) => {
                                const label = String(x.item.id);
                                if (x.link) {
                                    return (
                                        <React.Fragment key={`up-${x.item.id}`}>
                                            {idx > 0 ? ", " : ""}
                                            <InteractiveButton
                                                interaction="text"
                                                onClick={() => openFile(x.link!.path)}
                                            >
                                                {label}
                                            </InteractiveButton>
                                        </React.Fragment>
                                    );
                                }
                                return (
                                    <React.Fragment key={`up-${x.item.id}`}>
                                        {idx > 0 ? ", " : ""}
                                        <span style={{ color: "var(--text-faint)" }}>
                                            {label}
                                        </span>
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    )}

                    <details>
                        <summary
                            style={{
                                cursor: "pointer",
                                color: "var(--text-muted)",
                                fontSize: "0.9em",
                                userSelect: "none",
                            }}
                        >
                            展开课程矩阵
                        </summary>
                        <div
                            style={{
                                marginTop: "12px",
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                gap: "20px",
                            }}
                        >
                            {course.phases.map((ph: any) => (
                                <div
                                    key={`ph-${ph.phase}`}
                                    style={{ marginBottom: "12px" }}
                                >
                                    <div
                                        style={{
                                            fontSize: "0.85em",
                                            color: "var(--text-muted)",
                                            marginBottom: "6px",
                                            borderBottom:
                                                "1px solid var(--background-modifier-border)",
                                            paddingBottom: "4px",
                                        }}
                                    >
                                        {ph.phase}
                                    </div>
                                    <div
                                        style={{
                                            display: "flex",
                                            flexWrap: "wrap",
                                            gap: "6px",
                                        }}
                                    >
                                        {ph.items.map((c: any) => {
                                            const bg = c.isDone
                                                ? V5_COLORS.win
                                                : c.hasNote
                                                    ? V5_COLORS.accent
                                                    : "rgba(var(--mono-rgb-100), 0.06)";
                                            const fg = c.isDone
                                                ? "var(--background-primary)"
                                                : c.hasNote
                                                    ? "var(--background-primary)"
                                                    : "var(--text-faint)";
                                            const title = `${c.item.id}: ${String(
                                                c.item.t ?? ""
                                            )}`;
                                            return (
                                                <InteractiveButton
                                                    key={`c-${ph.phase}-${c.item.id}`}
                                                    interaction="mini-cell"
                                                    disabled={!c.link}
                                                    onClick={() => c.link && openFile(c.link.path)}
                                                    title={title}
                                                    style={{
                                                        width: "26px",
                                                        height: "26px",
                                                        borderRadius: "6px",
                                                        flexShrink: 0,
                                                        padding: 0,
                                                        border:
                                                            "1px solid var(--background-modifier-border)",
                                                        background: bg,
                                                        opacity: c.link ? 1 : 0.75,
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            display: "flex",
                                                            alignItems: "center",
                                                            justifyContent: "center",
                                                            width: "100%",
                                                            height: "100%",
                                                            color: fg,
                                                            fontSize: "0.65em",
                                                            fontWeight: 700,
                                                            letterSpacing: "-0.3px",
                                                        }}
                                                    >
                                                        {c.shortId}
                                                    </div>
                                                </InteractiveButton>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </details>
                </div>
            ) : (
                <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
                    课程数据不可用。请检查 PA_Syllabus_Data.md 与 #PA/Course
                    相关笔记。
                </div>
            )}
        </div>
    );
};
