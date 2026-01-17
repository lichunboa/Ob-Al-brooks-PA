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
  const [activeMetadata, setActiveMetadata] = React.useState<{ cycle?: string; direction?: string } | null>(null);

  React.useEffect(() => {
    const updateMetadata = () => {
      const file = app.workspace.getActiveFile();
      // If no file is active (e.g. clicking sidebar), do nothing to preserve state.
      // If dashboard is active, app.workspace.getActiveFile() might be null or return the view?
      // Actually, for Dashboard view, getActiveFile usually returns null.
      if (!file) return;

      const cache = app.metadataCache.getFileCache(file);
      if (!cache || !cache.frontmatter) return;

      const fm = cache.frontmatter;

      // Only update if it *looks* like a trade note (has specific fields)
      if (fm.market_cycle || fm.marketCycle || fm.direction) {
        console.log(`[TradingHub] Active Trade Note Detected: ${file.basename}. Cycle: ${fm.market_cycle || fm.marketCycle}`);
        setActiveMetadata({
          cycle: fm.market_cycle || fm.marketCycle,
          direction: fm.direction
        });
      }
      // If it's NOT a trade note (e.g. a settings file), we *might* want to clear it?
      // But for "Smart Prediction", sticky context is better than clearing.
    };

    updateMetadata(); // Initial read

    // Listen for file open and metadata changes
    // We also listen to 'active-leaf-change' to catch switching between split panes
    const eventRef = app.workspace.on('file-open', updateMetadata);
    const leafRef = app.workspace.on('active-leaf-change', updateMetadata);
    const cacheRef = app.metadataCache.on('changed', (file: any) => {
      // If the changed file is the one we are currently tracking, updating is safe.
      // We can just try to update from active file.
      // Or if the *modified* file is the one we last saw?
      // Simplest: just run the update check.
      updateMetadata();
    });

    return () => {
      app.workspace.offref(eventRef);
      app.workspace.offref(leafRef);
      app.metadataCache.offref(cacheRef);
    };
  }, [app]);

  return (
    <>
      <SectionHeader title="交易中心" subtitle="Trading Hub" icon="⚔️" />
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
