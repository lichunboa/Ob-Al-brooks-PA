import * as React from "react";
import { StrategyStats } from "../components/strategy/StrategyStats";
import { StrategyList } from "../components/strategy/StrategyList";
import { matchStrategies } from "../../core/strategy-matcher";
import { PlaybookPerformance } from "../components/learn/PlaybookPerformance";
import { CourseSuggestion } from "../components/learn/CourseSuggestion";
import { CoachFocus } from "../components/learn/CoachFocus";

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

      <CoachFocus
        memory={memory}
        course={course}
        settings={settings}
        memoryIgnoreFocus={memoryIgnoreFocus}
        memoryShakeIndex={memoryShakeIndex}
        openFile={openFile}
        setMemoryIgnoreFocus={setMemoryIgnoreFocus}
        setMemoryShakeIndex={setMemoryShakeIndex}
        buttonSmStyle={buttonSmStyle}
        textButtonStyle={textButtonStyle}
        textButtonSemiboldStyle={textButtonSemiboldStyle}
        textButtonStrongStyle={textButtonStrongStyle}
        onBtnMouseEnter={onBtnMouseEnter}
        onBtnMouseLeave={onBtnMouseLeave}
        onBtnFocus={onBtnFocus}
        onBtnBlur={onBtnBlur}
        onTextBtnMouseEnter={onTextBtnMouseEnter}
        onTextBtnMouseLeave={onTextBtnMouseLeave}
        onTextBtnFocus={onTextBtnFocus}
        onTextBtnBlur={onTextBtnBlur}
        V5_COLORS={V5_COLORS}
      />

      <CourseSuggestion
        course={course}
        courseError={courseError}
        courseBusy={courseBusy}
        settings={settings}
        loadCourse={loadCourse}
        reloadCourse={reloadCourse}
        openFile={openFile}
        buttonSmStyle={buttonSmStyle}
        buttonSmDisabledStyle={buttonSmDisabledStyle}
        textButtonStyle={textButtonStyle}
        textButtonSemiboldStyle={textButtonSemiboldStyle}
        onBtnMouseEnter={onBtnMouseEnter}
        onBtnMouseLeave={onBtnMouseLeave}
        onBtnFocus={onBtnFocus}
        onBtnBlur={onBtnBlur}
        onTextBtnMouseEnter={onTextBtnMouseEnter}
        onTextBtnMouseLeave={onTextBtnMouseLeave}
        onTextBtnFocus={onTextBtnFocus}
        onTextBtnBlur={onTextBtnBlur}
        onMiniCellMouseEnter={onMiniCellMouseEnter}
        onMiniCellMouseLeave={onMiniCellMouseLeave}
        onMiniCellFocus={onMiniCellFocus}
        onMiniCellBlur={onMiniCellBlur}
        V5_COLORS={V5_COLORS}
      />

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
          openFile={openFile}
          textButtonStyle={textButtonStyle}
          onTextBtnMouseEnter={onTextBtnMouseEnter}
          onTextBtnMouseLeave={onTextBtnMouseLeave}
          onTextBtnFocus={onTextBtnFocus}
          onTextBtnBlur={onTextBtnBlur}
          V5_COLORS={V5_COLORS}
        />
      </div>

      {/* Gallery is rendered in the Analytics grid (with scope selector). */}
    </>
  );
};
