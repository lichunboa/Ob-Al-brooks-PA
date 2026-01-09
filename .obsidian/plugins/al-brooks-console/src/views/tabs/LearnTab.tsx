import * as React from "react";
import { StrategyStats } from "../components/strategy/StrategyStats";
import { StrategyList } from "../components/strategy/StrategyList";
import { matchStrategies } from "../../core/strategy-matcher";
import { PlaybookPerformance } from "../components/learn/PlaybookPerformance";

// LearnTab Props接口
interface LearnTabProps {
  // 数据Props
  memory: any;
  memoryError: string;
  memoryBusy: boolean;
  course: any;
  courseError: string;
  courseBusy: boolean;
  settings: any;
  strategyStats: {
    total: number;
    activeCount: number;
    learningCount: number;
    totalUses: number;
  };
  strategies: any[];
  strategyPerf: any;
  todayMarketCycle: string | null;
  playbookPerfRows: any[];
  memoryIgnoreFocus: boolean;
  memoryShakeIndex: number;
  strategyIndex: any;

  // 函数Props
  can: (action: string) => boolean;
  action: (action: string) => void;
  loadMemory: any;
  reloadMemory: () => void;
  hardRefreshMemory: () => void;
  loadCourse: any;
  reloadCourse: () => void;
  openFile: (path: string) => void;
  setMemoryIgnoreFocus: (value: boolean) => void;
  setMemoryShakeIndex: (value: number | ((prev: number) => number)) => void;

  // 样式Props
  buttonStyle: React.CSSProperties;
  disabledButtonStyle: React.CSSProperties;
  buttonSmStyle: React.CSSProperties;
  buttonSmDisabledStyle: React.CSSProperties;
  textButtonStyle: React.CSSProperties;
  textButtonStrongStyle: React.CSSProperties;
  textButtonSemiboldStyle: React.CSSProperties;
  textButtonNoWrapStyle: React.CSSProperties;

  // 事件处理Props
  onBtnMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onBtnMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onBtnFocus: (e: React.FocusEvent<HTMLButtonElement>) => void;
  onBtnBlur: (e: React.FocusEvent<HTMLButtonElement>) => void;
  onTextBtnMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onTextBtnMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onTextBtnFocus: (e: React.FocusEvent<HTMLButtonElement>) => void;
  onTextBtnBlur: (e: React.FocusEvent<HTMLButtonElement>) => void;
  onMiniCellMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onMiniCellMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onMiniCellFocus: (e: React.FocusEvent<HTMLButtonElement>) => void;
  onMiniCellBlur: (e: React.FocusEvent<HTMLButtonElement>) => void;

  // 常量/工具Props
  V5_COLORS: any;
  seg: (value: number) => string;
  simpleCourseId: (id: string) => string;
  isActive: (status: string) => boolean;
}

export const LearnTab: React.FC<LearnTabProps> = ({
  memory,
  memoryError,
  memoryBusy,
  course,
  courseError,
  courseBusy,
  settings,
  strategyStats,
  strategies,
  strategyPerf,
  todayMarketCycle,
  playbookPerfRows,
  memoryIgnoreFocus,
  memoryShakeIndex,
  strategyIndex,
  can,
  action,
  loadMemory,
  reloadMemory,
  hardRefreshMemory,
  loadCourse,
  reloadCourse,
  openFile,
  setMemoryIgnoreFocus,
  setMemoryShakeIndex,
  buttonStyle,
  disabledButtonStyle,
  buttonSmStyle,
  buttonSmDisabledStyle,
  textButtonStyle,
  textButtonStrongStyle,
  textButtonSemiboldStyle,
  textButtonNoWrapStyle,
  onBtnMouseEnter,
  onBtnMouseLeave,
  onBtnFocus,
  onBtnBlur,
  onTextBtnMouseEnter,
  onTextBtnMouseLeave,
  onTextBtnFocus,
  onTextBtnBlur,
  onMiniCellMouseEnter,
  onMiniCellMouseLeave,
  onMiniCellFocus,
  onMiniCellBlur,
  V5_COLORS,
  seg,
  simpleCourseId,
  isActive,
}) => {
  return (
    <>
      <div
        style={{
          margin: "18px 0 10px",
          paddingBottom: "8px",
          borderBottom: "1px solid var(--background-modifier-border)",
          display: "flex",
          alignItems: "baseline",
          gap: "10px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 700 }}>📚 学习模块</div>
        <div style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>
          Learning
        </div>
      </div>

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
          <div style={{ fontWeight: 600 }}>记忆 / SRS</div>
          <div
            style={{ display: "flex", alignItems: "center", gap: "8px" }}
          >
            <button
              type="button"
              disabled={!can("srs:review-flashcards")}
              onClick={() => action("srs:review-flashcards")}
              onMouseEnter={onBtnMouseEnter}
              onMouseLeave={onBtnMouseLeave}
              onFocus={onBtnFocus}
              onBlur={onBtnBlur}
              style={
                can("srs:review-flashcards")
                  ? buttonStyle
                  : disabledButtonStyle
              }
            >
              复习
            </button>
            <button
              type="button"
              onClick={reloadMemory}
              disabled={!loadMemory || memoryBusy}
              onMouseEnter={onBtnMouseEnter}
              onMouseLeave={onBtnMouseLeave}
              onFocus={onBtnFocus}
              onBlur={onBtnBlur}
              style={
                !loadMemory || memoryBusy
                  ? buttonSmDisabledStyle
                  : buttonSmStyle
              }
            >
              刷新
            </button>
            <button
              type="button"
              onClick={hardRefreshMemory}
              disabled={!loadMemory || memoryBusy}
              onMouseEnter={onBtnMouseEnter}
              onMouseLeave={onBtnMouseLeave}
              onFocus={onBtnFocus}
              onBlur={onBtnBlur}
              style={
                !loadMemory || memoryBusy
                  ? buttonSmDisabledStyle
                  : buttonSmStyle
              }
            >
              强制刷新
            </button>
          </div>
        </div>

        {!can("srs:review-flashcards") && (
          <div
            style={{
              color: "var(--text-faint)",
              fontSize: "0.9em",
              marginBottom: "8px",
            }}
          >
            SRS 插件不可用（适配器已降级）。统计仍会从 #flashcards
            笔记计算。
          </div>
        )}

        {memoryError ? (
          <div style={{ color: "var(--text-error)", fontSize: "0.9em" }}>
            {memoryError}
          </div>
        ) : memoryBusy ? (
          <div style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>
            加载中…
          </div>
        ) : memory ? (
          <div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "12px",
                color: "var(--text-muted)",
                fontSize: "0.9em",
                marginBottom: "10px",
              }}
            >
              <div>
                总计：<strong>{memory.total}</strong>
              </div>
              <div>
                到期（≤{settings.srsDueThresholdDays}天）：{" "}
                <strong>{memory.due}</strong>
              </div>
              <div>
                掌握度：<strong>{memory.masteryPct}%</strong>
              </div>
              <div>
                负载（7天）：<strong>{memory.load7d}</strong>
              </div>
              <div>
                状态：<strong>{memory.status}</strong>
              </div>
            </div>

            {(() => {
              const pTotal = Math.max(1, memory.total);
              const sBase =
                (memory.cnt?.sNorm ?? 0) + (memory.cnt?.sRev ?? 0) * 2;
              const mMulti =
                (memory.cnt?.mNorm ?? 0) + (memory.cnt?.mRev ?? 0) * 2;
              const cloze = memory.cnt?.cloze ?? 0;

              // seg 已移至 utils/chart-utils.ts

              return (
                <>
                  <div
                    style={{
                      height: "8px",
                      width: "100%",
                      borderRadius: "4px",
                      overflow: "hidden",
                      background: "var(--background-modifier-border)",
                      display: "flex",
                      marginBottom: "10px",
                    }}
                  >
                    <div
                      style={{
                        width: seg(memory.cnt?.sNorm ?? 0),
                        background: "var(--text-muted)",
                        opacity: 0.5,
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
                </>
              );
            })()}

            {(() => {
              const series = memory.loadNext7;
              const max = Math.max(3, ...series.map((x: any) => x.count || 0));
              return (
                <div
                  style={{
                    border: "1px solid var(--background-modifier-border)",
                    borderRadius: "10px",
                    padding: "10px",
                    background: "rgba(var(--mono-rgb-100), 0.02)",
                    marginBottom: "10px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      gap: "10px",
                      marginBottom: "8px",
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: "0.9em" }}>
                      未来 7 天负载
                    </div>
                    <div
                      style={{
                        color: "var(--text-faint)",
                        fontSize: "0.85em",
                      }}
                    >
                      +1…+7
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-end",
                      gap: "10px",
                      height: "120px",
                    }}
                  >
                    {series.map((x: any, idx: number) => {
                      const h = Math.max(
                        4,
                        Math.round((Math.max(0, x.count || 0) / max) * 100)
                      );
                      const has = (x.count || 0) > 0;
                      return (
                        <div
                          key={`mem-load-${x.dateIso}-${idx}`}
                          style={{
                            flex: "1 1 0",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: "6px",
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
                      <button
                        type="button"
                        onClick={() => openFile(String(rec.path))}
                        style={textButtonStrongStyle}
                        onMouseEnter={onTextBtnMouseEnter}
                        onMouseLeave={onTextBtnMouseLeave}
                        onFocus={onTextBtnFocus}
                        onBlur={onTextBtnBlur}
                      >
                        {String(rec.title)}
                      </button>
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

                  <button
                    type="button"
                    onClick={onShake}
                    onMouseEnter={onBtnMouseEnter}
                    onMouseLeave={onBtnMouseLeave}
                    onFocus={onBtnFocus}
                    onBlur={onBtnBlur}
                    style={buttonSmStyle}
                    title="摇一摇换题（跳过优先）"
                  >
                    🎲
                  </button>
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
                <button
                  type="button"
                  onClick={() => openFile(memory.focusFile!.path)}
                  style={textButtonSemiboldStyle}
                  onMouseEnter={onTextBtnMouseEnter}
                  onMouseLeave={onTextBtnMouseLeave}
                  onFocus={onTextBtnFocus}
                  onBlur={onTextBtnBlur}
                >
                  {memory.focusFile.name.replace(/\.md$/i, "")}
                </button>
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
                <div style={{ fontWeight: 600, marginBottom: "6px" }}>
                  随机抽题（{settings.srsRandomQuizCount}）
                </div>
                <ul style={{ margin: 0, paddingLeft: "18px" }}>
                  {memory.quizPool.map((q: any, idx: number) => (
                    <li key={`q-${idx}`} style={{ marginBottom: "6px" }}>
                      <button
                        type="button"
                        onClick={() => openFile(q.path)}
                        style={textButtonStyle}
                        onMouseEnter={onTextBtnMouseEnter}
                        onMouseLeave={onTextBtnMouseLeave}
                        onFocus={onTextBtnFocus}
                        onBlur={onTextBtnBlur}
                      >
                        {q.q || q.file}
                      </button>
                      <span
                        style={{
                          marginLeft: "8px",
                          color: "var(--text-faint)",
                          fontSize: "0.85em",
                        }}
                      >
                        {q.file}
                      </span>
                    </li>
                  ))}
                </ul>
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
        )}
      </div>

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
          <button
            type="button"
            onClick={reloadCourse}
            disabled={!loadCourse || courseBusy}
            onMouseEnter={onBtnMouseEnter}
            onMouseLeave={onBtnMouseLeave}
            onFocus={onBtnFocus}
            onBlur={onBtnBlur}
            style={
              !loadCourse || courseBusy
                ? buttonSmDisabledStyle
                : buttonSmStyle
            }
          >
            刷新
          </button>
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
                          <button
                            type="button"
                            onClick={() => openFile(link.path)}
                            style={textButtonSemiboldStyle}
                            onMouseEnter={onTextBtnMouseEnter}
                            onMouseLeave={onTextBtnMouseLeave}
                            onFocus={onTextBtnFocus}
                            onBlur={onTextBtnBlur}
                          >
                            {prefix}: {String(rec.data.t ?? rec.data.id)}
                          </button>
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
                        <button
                          type="button"
                          onClick={() => openFile(x.link!.path)}
                          style={textButtonStyle}
                          onMouseEnter={onTextBtnMouseEnter}
                          onMouseLeave={onTextBtnMouseLeave}
                          onFocus={onTextBtnFocus}
                          onBlur={onTextBtnBlur}
                        >
                          {label}
                        </button>
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
                          <button
                            key={`c-${ph.phase}-${c.item.id}`}
                            type="button"
                            disabled={!c.link}
                            onClick={() => c.link && openFile(c.link.path)}
                            title={title}
                            onMouseEnter={onMiniCellMouseEnter}
                            onMouseLeave={onMiniCellMouseLeave}
                            onFocus={onMiniCellFocus}
                            onBlur={onMiniCellBlur}
                            style={{
                              width: "26px",
                              height: "26px",
                              borderRadius: "6px",
                              flexShrink: 0,
                              padding: 0,
                              border:
                                "1px solid var(--background-modifier-border)",
                              background: bg,
                              cursor: c.link ? "pointer" : "default",
                              opacity: c.link ? 1 : 0.75,
                              outline: "none",
                              transition:
                                "border-color 180ms ease, box-shadow 180ms ease",
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
                          </button>
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
          策略仓库
          <span style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>
            {" "}
            （作战手册/Playbook）
          </span>
        </div>

        <div style={{ marginBottom: "10px" }}>
          <StrategyStats
            total={strategyStats.total}
            activeCount={strategyStats.activeCount}
            learningCount={strategyStats.learningCount}
            totalUses={strategyStats.totalUses}
            onFilter={(f: string) => {
              // TODO: wire filtering state to StrategyList (future task)
              console.log("策略过滤：", f);
            }}
          />
        </div>

        {(() => {
          const cycle = (todayMarketCycle ?? "").trim();
          if (!cycle) {
            return (
              <div
                style={{
                  margin: "-6px 0 10px 0",
                  padding: "10px 12px",
                  background: "rgba(var(--mono-rgb-100), 0.03)",
                  border: "1px solid var(--background-modifier-border)",
                  borderRadius: "8px",
                  color: "var(--text-faint)",
                  fontSize: "0.9em",
                }}
              >
                今日市场周期未设置（可在 今日/Today 里补充）。
              </div>
            );
          }

          const picks = matchStrategies(strategyIndex, {
            marketCycle: cycle,
            limit: 6,
          }).filter((s) => isActive((s as any).statusRaw));

          return (
            <div
              style={{
                margin: "-6px 0 10px 0",
                padding: "10px 12px",
                background: "rgba(var(--mono-rgb-100), 0.03)",
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "8px",
              }}
            >
              <div
                style={{ fontWeight: 700, opacity: 0.75, marginBottom: 6 }}
              >
                🌊 今日市场周期：{" "}
                <span
                  style={{ color: "var(--text-accent)", fontWeight: 800 }}
                >
                  {cycle}
                </span>
              </div>
              <div
                style={{ fontSize: "0.85em", color: "var(--text-muted)" }}
              >
                {picks.length > 0 ? (
                  <>
                    推荐优先关注：{" "}
                    {picks.map((s, idx) => (
                      <React.Fragment key={`pb-pick-${s.path}`}>
                        {idx > 0 ? " · " : ""}
                        <button
                          type="button"
                          onClick={() => openFile(s.path)}
                          style={textButtonNoWrapStyle}
                          onMouseEnter={onTextBtnMouseEnter}
                          onMouseLeave={onTextBtnMouseLeave}
                          onFocus={onTextBtnFocus}
                          onBlur={onTextBtnBlur}
                        >
                          {String(s.canonicalName || s.name)}
                        </button>
                      </React.Fragment>
                    ))}
                  </>
                ) : (
                  "暂无匹配的实战策略（可在策略卡片里补充状态/周期）。"
                )}
              </div>
            </div>
          );
        })()}

        <div style={{ marginTop: "10px" }}>
          <StrategyList
            strategies={strategies}
            onOpenFile={openFile}
            perf={strategyPerf}
            showTitle={false}
            showControls={false}
          />
        </div>

        <div
          style={{
            marginTop: "16px",
            paddingTop: "12px",
            borderTop: "1px solid var(--background-modifier-border)",
          }}
        >
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {(() => {
              const quickPath =
                "策略仓库 (Strategy Repository)/太妃方案/太妃方案.md";
              return (
                <button
                  type="button"
                  onClick={() => openFile(quickPath)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: "1px solid var(--background-modifier-border)",
                    background: "rgba(var(--mono-rgb-100), 0.03)",
                    color: "var(--text-accent)",
                    cursor: "pointer",
                    fontSize: "0.85em",
                    fontWeight: 700,
                  }}
                >
                  📚 作战手册（Brooks Playbook）
                </button>
              );
            })()}

            <span
              style={{
                padding: "4px 10px",
                borderRadius: "6px",
                border: "1px solid var(--background-modifier-border)",
                background: "rgba(var(--mono-rgb-100), 0.03)",
                color: "var(--text-muted)",
                fontSize: "0.85em",
                fontWeight: 700,
              }}
            >
              📖 Al Brooks经典（即将推出）
            </span>
          </div>
        </div>

        <PlaybookPerformance
          playbookPerfRows={playbookPerfRows}
          V5_COLORS={V5_COLORS}
        />
      </div>

      {/* Gallery is rendered in the Analytics grid (with scope selector). */}
    </>
  );
};
