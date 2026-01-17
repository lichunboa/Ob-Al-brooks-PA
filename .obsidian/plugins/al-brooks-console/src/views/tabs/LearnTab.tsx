import * as React from "react";
import { SectionHeader } from "../../ui/components/SectionHeader";
import { CoachFocus } from "../components/learn/CoachFocus";
import { CourseSuggestion } from "../components/learn/CourseSuggestion";
import { StrategyRepository } from "../components/learn/StrategyRepository";
import { useConsoleContext } from "../../context/ConsoleContext";
import {
  calculateStrategyStats,
  resolveCanonicalStrategy,
} from "../../utils/strategy-utils";
import {
  calculateStrategyPerformance,
  generatePlaybookPerfRows,
} from "../../utils/strategy-performance-utils";
import { V5_COLORS } from "../../ui/tokens";
import { simpleCourseId } from "../../core/course";
import { isActive } from "../../utils/trade-utils";
import { safePct } from "../../utils/trade-calculations";
import {
  buttonSmStyle,
  buttonSmDisabledStyle,
  textButtonStyle,
  textButtonStrongStyle,
  textButtonSemiboldStyle,
  textButtonNoWrapStyle,
} from "../../ui/styles/dashboardPrimitives";

export const LearnTab: React.FC = () => {
  const {
    strategies,
    trades,
    memory,
    memoryError,
    memoryBusy,
    course,
    courseError,
    courseBusy,
    settings,
    todayMarketCycle,
    memoryIgnoreFocus,
    memoryShakeIndex,
    strategyIndex,
    loadMemory,
    reloadMemory,
    hardRefreshMemory,
    loadCourse,
    reloadCourse,
    openFile,
    setMemoryIgnoreFocus,
    setMemoryShakeIndex,
    // Add integrations from context to use run action
    integrations,
  } = useConsoleContext();

  const strategyPerf = React.useMemo(
    () =>
      calculateStrategyPerformance(trades, (t) =>
        resolveCanonicalStrategy(t, strategyIndex)
      ),
    [trades, strategyIndex]
  );

  const strategyStats = React.useMemo(
    () => calculateStrategyStats(strategies, strategyPerf, isActive),
    [strategies, strategyPerf]
  );

  const playbookPerfRows = React.useMemo(
    () => generatePlaybookPerfRows(strategyPerf, strategyIndex, safePct),
    [strategyPerf, strategyIndex]
  );

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
        onAction={(id) => integrations?.run(id as any)}
        can={(id) => integrations?.isCapabilityAvailable(id as any) ?? false}
        runCommand={useConsoleContext().runCommand}
      />

      <CourseSuggestion
        course={course}
        courseError={courseError}
        courseBusy={courseBusy}
        settings={settings}
        loadCourse={() => loadCourse(settings)}
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
        todayMarketCycle={todayMarketCycle.join(" + ")}
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
