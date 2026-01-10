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

  // 常量/工具Props
  V5_COLORS: any;
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
  V5_COLORS,
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
        V5_COLORS={V5_COLORS}
      />

      {/* Gallery is rendered in the Analytics grid (with scope selector). */}
    </>
  );
};
