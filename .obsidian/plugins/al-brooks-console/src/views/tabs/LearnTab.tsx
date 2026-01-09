import * as React from "react";
import { SectionHeader } from "../../ui/components/SectionHeader";
import { StrategyStats } from "../components/strategy/StrategyStats";
import { StrategyList } from "../components/strategy/StrategyList";
import { matchStrategies } from "../../core/strategy-matcher";
import { PlaybookPerformance } from "../components/learn/PlaybookPerformance";
import { CourseSuggestion } from "../components/learn/CourseSuggestion";
import { CoachFocus } from "../components/learn/CoachFocus";
import { StrategyRepository } from "../components/learn/StrategyRepository";

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
      <SectionHeader
        title="学习模块"
        subtitle="Learning"
        icon="📚"
        style={{ margin: "18px 0 10px" }}
      />

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

      <StrategyRepository
        strategyStats={strategyStats}
        strategyIndex={strategyIndex}
        strategies={strategies}
        strategyPerf={strategyPerf}
        playbookPerfRows={playbookPerfRows}
        todayMarketCycle={todayMarketCycle}
        openFile={openFile}
        isActive={isActive}
        textButtonStyle={textButtonStyle}
        textButtonNoWrapStyle={textButtonNoWrapStyle}
        onTextBtnMouseEnter={onTextBtnMouseEnter}
        onTextBtnMouseLeave={onTextBtnMouseLeave}
        onTextBtnFocus={onTextBtnFocus}
        onTextBtnBlur={onTextBtnBlur}
        V5_COLORS={V5_COLORS}
      />

      {/* Gallery is rendered in the Analytics grid (with scope selector). */}
    </>
  );
};
