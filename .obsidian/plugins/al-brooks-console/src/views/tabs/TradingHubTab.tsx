import * as React from "react";
import { moment } from "obsidian";
import { GlassPanel } from "../../ui/components/GlassPanel";
import { SectionHeader } from "../../ui/components/SectionHeader";
import { TodayKpiCard } from "../components/trading/TodayKpiCard";
import { OpenTradeAssistant } from "../components/trading/OpenTradeAssistant";

import { DailyActionsPanel } from "../components/trading/DailyActionsPanel";
import { ReviewHintsPanel } from "../components/trading/ReviewHintsPanel";


import { useConsoleContext } from "../../context/ConsoleContext";
import { calculateTodayKpi } from "../../utils/data-calculation-utils";
import { findOpenTrade } from "../../utils/trade-utils";
import { buildReviewHints } from "../../core/review-hints";
import {
  buttonStyle,
  textButtonStyle,
  disabledButtonStyle,
} from "../../ui/styles/dashboardPrimitives";
import { MarkdownBlock } from "../../ui/components/MarkdownBlock";
import { IntegrationCapability } from "../../integrations/contracts";
import { SRSQueryService } from "../../services/srs-query-service";
import { ContextLearnWidget } from "../components/learn/ContextLearnWidget";
import { TiltAlertModal } from "../components/trading/TiltAlertModal";

export const TradingHubTab: React.FC = () => {
  const {
    trades,
    todayContext,
    strategyIndex,
    app,
    enumPresets,
    openFile,
    currencyMode,
    integrations,
  } = useConsoleContext();

  /* Removed PlanWidget and useDailyPlan */

  const todayIso = React.useMemo(() => moment().format("YYYY-MM-DD"), []);

  const todayKpi = React.useMemo(
    () => calculateTodayKpi(trades, todayIso),
    [trades, todayIso]
  );

  const { todayTrades } = todayKpi;

  const openTrade = React.useMemo(
    () => findOpenTrade(todayTrades) || null,
    [todayTrades]
  );

  // Calculate openTrades list for the assistant
  const openTrades = React.useMemo(() => {
    return todayTrades.filter(t =>
      t.outcome !== "win" &&
      t.outcome !== "loss" &&
      t.outcome !== "scratch"
    );
  }, [todayTrades]);

  // Review Hints Logic
  const latestTrade = todayTrades.length > 0 ? todayTrades[0] : null;

  const reviewHints = React.useMemo(() => {
    if (!latestTrade) return [];
    return buildReviewHints(latestTrade);
  }, [latestTrade]);

  const can = React.useCallback(
    (feature: string) => integrations?.isCapabilityAvailable(feature as IntegrationCapability) ?? false,
    [integrations]
  );

  const todayMarketCycleStr = React.useMemo(() => {
    const cycle = todayContext?.getTodayMarketCycle();
    if (!cycle) return undefined;
    return Array.isArray(cycle) ? cycle.join(" + ") : String(cycle);
  }, [todayContext]);

  // Real-time Active File Metadata Listener
  // Real-time Active File Metadata Listener
  // We use a ref to track if we should clear it, but generally we want to KEEP the last valid trade note's context
  // so the user can see the prediction for the file they were just editing.
  const [activeMetadata, setActiveMetadata] = React.useState<{ cycle?: string; direction?: string; setup?: string } | null>(null);

  React.useEffect(() => {
    // 跟踪上次检测到的值，避免不必要的更新
    let lastCycle = "";
    let lastDirection = "";

    const updateMetadataFromFile = (file: any) => {
      if (!file) return;

      const cache = app.metadataCache.getFileCache(file);
      if (!cache || !cache.frontmatter) return;

      const fm = cache.frontmatter;
      const cycle = fm["市场周期/market_cycle"] || fm.market_cycle || fm.marketCycle || "";
      const direction = fm["方向/direction"] || fm.direction || "";

      // 只有值变化时才更新状态（避免无限循环）
      if (cycle !== lastCycle || direction !== lastDirection) {
        console.log(`[TradingHub] 元数据更新: ${file.basename}, cycle: "${cycle}", direction: "${direction}"`);
        lastCycle = cycle;
        lastDirection = direction;

        if (cycle || direction || fm.setup || fm.setup_category) {
          setActiveMetadata({
            cycle: cycle,
            direction: direction,
            // @ts-ignore
            setup: fm.setup || fm.setup_category || fm.setupCategory
          });
        }
      }
    };

    const updateFromActiveFile = () => {
      const file = app.workspace.getActiveFile();
      if (file) updateMetadataFromFile(file);
    };

    updateFromActiveFile(); // Initial read

    // 事件监听
    const eventRef = app.workspace.on('file-open', updateFromActiveFile);
    const leafRef = app.workspace.on('active-leaf-change', updateFromActiveFile);

    // metadataCache.changed 事件
    const cacheRef = app.metadataCache.on('changed', (changedFile: any) => {
      const activeFile = app.workspace.getActiveFile();
      if (activeFile && changedFile && changedFile.path === activeFile.path) {
        setTimeout(() => updateMetadataFromFile(changedFile), 100);
      }
    });

    // 🔧 关键修复：添加 resolved 事件（frontmatter 解析完成时触发）
    const resolvedRef = app.metadataCache.on('resolved', () => {
      updateFromActiveFile();
    });

    // 🔧 后备方案：定时轮询（每2秒检查一次）
    const pollInterval = setInterval(() => {
      updateFromActiveFile();
    }, 2000);

    return () => {
      app.workspace.offref(eventRef);
      app.workspace.offref(leafRef);
      app.metadataCache.offref(cacheRef);
      app.metadataCache.offref(resolvedRef);
      clearInterval(pollInterval);
    };
  }, [app]);

  // --- SRS Integration (Phase 4.1) ---
  const [srsCards, setSrsCards] = React.useState<any[]>([]);
  const srsService = React.useMemo(() => new SRSQueryService(app), [app]);

  React.useEffect(() => {
    // Determine current context for SRS
    // Priority:
    // 1. Open Trade (Draft) Setup
    // 2. Active File Setup
    // 3. Today's Market Cycle

    const keywords: string[] = [];

    // 1. Active Draft
    if (openTrade?.setupCategory) keywords.push(openTrade.setupCategory);
    if (openTrade?.strategyName) keywords.push(openTrade.strategyName);

    // 2. Active File (if not draft)
    if (!openTrade && activeMetadata) {
      if (activeMetadata.cycle) keywords.push(activeMetadata.cycle);
      // We need to add 'setup' to activeMetadata if we want it here, 
      // but for now let's use cycle which is available.
    }

    // 3. Market Cycle
    if (todayContext?.getTodayMarketCycle()) {
      const c = todayContext.getTodayMarketCycle();
      if (Array.isArray(c)) keywords.push(...c);
      else if (typeof c === 'string') keywords.push(c);
    }

    if (keywords.length === 0) {
      setSrsCards([]);
      return;
    }

    // Dedup
    const uniqueKeywords = Array.from(new Set(keywords.filter(k => k && k !== 'Unknown')));

    srsService.getDueCards(uniqueKeywords).then(cards => {
      setSrsCards(cards);
    });

  }, [openTrade, activeMetadata, todayContext, srsService]);

  // --- Tilt Breaker (Phase 4.2) ---
  const [isTiltAlertOpen, setIsTiltAlertOpen] = React.useState(false);
  const [lastAckStreak, setLastAckStreak] = React.useState(0);
  const { losingStreak } = todayKpi;

  React.useEffect(() => {
    // Trigger if streak >= 3 AND we haven't acknowledged this specific streak level yet
    // e.g. streak 3 -> alert -> ack (3). streak 4 -> alert -> ack (4).
    // resetting streak to 0 will allow future alerts (since 3 > 0).
    if (losingStreak >= 3 && losingStreak > lastAckStreak) {
      setIsTiltAlertOpen(true);
    }

    // Optional: If streak resets (e.g. a win), reset ack?
    if (losingStreak === 0 && lastAckStreak > 0) {
      setLastAckStreak(0);
    }
  }, [losingStreak, lastAckStreak]);


  return (
    <>
      <SectionHeader title="交易中心" subtitle="Trading Hub" icon="⚔️" />

      {isTiltAlertOpen && (
        <TiltAlertModal
          streak={losingStreak}
          onClose={() => {
            setIsTiltAlertOpen(false);
            setLastAckStreak(losingStreak);
          }}
          onOpenChecklist={() => {
            openFile("Templates/Psychology Checklist (Tilt Management).md");
            setIsTiltAlertOpen(false);
            setLastAckStreak(losingStreak);
          }}
        />
      )}

      <GlassPanel style={{ marginBottom: "16px" }}>


        <TodayKpiCard todayKpi={todayKpi} currencyMode={currencyMode || "USD"} />

        <ReviewHintsPanel
          latestTrade={latestTrade} // Keep for fallback or other props
          activeMetadata={activeMetadata} // NEW: Real-time override
          reviewHints={reviewHints}
          todayMarketCycle={todayMarketCycleStr}
          app={app}
          strategies={useConsoleContext().strategies}
          openFile={openFile}
          runCommand={useConsoleContext().runCommand ? (id) => {
            const rc = useConsoleContext().runCommand;
            if (rc) rc(id);
          } : undefined}
        />

        <ContextLearnWidget
          cards={srsCards}
          onReview={(file) => openFile(file.path)}
        />


        <OpenTradeAssistant
          openTrade={openTrade}
          todayMarketCycle={todayContext?.getTodayMarketCycle()}
          strategyIndex={strategyIndex}
          onOpenFile={openFile}
          openTrades={openTrades}
          trades={todayTrades}
          textButtonStyle={textButtonStyle}
          buttonStyle={buttonStyle}
          app={app}
          enumPresets={enumPresets}
        />
      </GlassPanel>

      <DailyActionsPanel can={can} MarkdownBlock={MarkdownBlock} />

    </>
  );
};
