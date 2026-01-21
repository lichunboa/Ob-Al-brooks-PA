import * as React from "react";
import { SectionHeader } from "../../ui/components/SectionHeader";
import { CoachFocus } from "../components/learn/CoachFocus";
import { CourseSuggestion } from "../components/learn/CourseSuggestion";
import { StrategyRepository } from "../components/learn/StrategyRepository";
import { LearningPlanPanel } from "../components/learn/LearningPlanPanel";
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

  // 计算表现差的策略（胜率<50% 且 使用>2次）用于学习联动
  const poorPerformingStrategies = React.useMemo(() => {
    const result: Array<{
      name: string;
      winRate: number;
      trades: number;
      pnl: number;
      path?: string;
    }> = [];

    strategyPerf.forEach((perf, name) => {
      if (perf.total >= 2) {
        const winRate = Math.round((perf.wins / perf.total) * 100);
        if (winRate < 50 || perf.pnlMoney < 0) {
          const strategy = strategies.find(s => (s.canonicalName || s.name) === name);
          result.push({
            name,
            winRate,
            trades: perf.total,
            pnl: perf.pnlMoney,
            path: strategy?.path,
          });
        }
      }
    });

    return result.sort((a, b) => a.winRate - b.winRate).slice(0, 5);
  }, [strategyPerf, strategies]);

  return (
    <>
      <SectionHeader
        title="学习模块"
        subtitle="Learning"
        icon="📚"
        style={{ margin: "18px 0 10px" }}
      />

      {memoryError && (
        <div style={{ padding: '10px', background: 'var(--background-modifier-error)', color: 'var(--text-on-accent)', borderRadius: '8px', marginBottom: '10px', fontSize: '0.9em' }}>
          <strong>Memory Load Error:</strong> {memoryError}
        </div>
      )}

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
        poorPerformingStrategies={poorPerformingStrategies}
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

      {/* 学习计划面板 - 基于掌握度薄弱策略生成 */}
      <LearningPlanPanel
        plans={(() => {
          // 基于薄弱策略生成推荐学习计划
          if (poorPerformingStrategies.length === 0) return [];
          return [{
            id: 'auto-weekly',
            title: '本周重点复习',
            strategies: poorPerformingStrategies.map(s => s.name),
            createdAt: new Date().toISOString().split('T')[0],
            progress: 0,
            status: 'active' as const,
          }];
        })()}
        onOpenStrategy={(name) => {
          const s = strategies.find(x => (x.canonicalName || x.name) === name);
          if (s?.path) openFile(s.path);
        }}
      />

      {/* Gallery is rendered in the Analytics grid (with scope selector). */}
    </>
  );
};
