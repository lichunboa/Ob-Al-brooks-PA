import * as React from "react";
import { useConsoleContext } from "../context/ConsoleContext";
import { DashboardHeader } from "./components/dashboard/DashboardHeader";
import { Button } from "../ui/components/Button";

// Components
import { OpenTradeAssistant } from "./components/trading/OpenTradeAssistant";
import { TodayKpiCard } from "./components/trading/TodayKpiCard";

// Tabs
import { TradingHubTab } from "./tabs/TradingHubTab";
import { AnalyticsTab } from "./tabs/AnalyticsTab";
import { LearnTab } from "./tabs/LearnTab";
import { ManageTab } from "./tabs/ManageTab";
import { BackendTab } from "./tabs/BackendTab";

// Hooks moved to components (Context)
// Manager handled by ManageTab now

type DashboardPage = "trading" | "journal" | "analytics" | "learn" | "manage" | "backend";

export const ConsoleContent: React.FC = () => {
  const {
    status,
    todayMarketCycle,
    settings,
    version,
    currencyMode,
    setCurrencyMode,
    openFile,
    integrations,
    index,
    runCommand, // 新增：用于执行 Obsidian 命令（如复习卡片）
  } = useConsoleContext();

  const [activePage, setActivePage] = React.useState<DashboardPage>("trading");

  // Helper for tab buttons
  const renderTabButton = (page: DashboardPage, label: string, icon: string) => {
    const isActive = activePage === page;
    return (
      <Button
        variant="tab"
        active={isActive}
        onClick={() => setActivePage(page)}
      >
        <div style={{ marginRight: "6px" }}>{icon}</div>
        {label}
      </Button>
    );
  };

  const statusText = React.useMemo(() => {
    switch (status.phase) {
      case "building": {
        const p = typeof status.processed === "number" ? status.processed : 0;
        const t = typeof status.total === "number" ? status.total : 0;
        return t > 0 ? `索引：构建中… ${p}/${t}` : "索引：构建中…";
      }
      case "ready": {
        return typeof status.lastBuildMs === "number"
          ? `索引：就绪（${status.lastBuildMs}ms）`
          : "索引：就绪";
      }
      case "error":
        return `索引：错误${status.message ? ` — ${status.message}` : ""}`;
      default:
        return "索引：空闲";
    }
  }, [status]);

  return (
    <div className="al-brooks-console-container" style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      color: "var(--text-normal)",
      fontFamily: "var(--font-interface)",
      overflow: "hidden" // Ensure container doesn't overflow, let content scroll
    }}>
      {/* Header / Navigation - 紧凑布局 */}
      <div style={{
        flexShrink: 0,
        padding: "10px 16px 0",
        background: "var(--background-secondary)",
        borderBottom: "1px solid var(--background-modifier-border)"
      }}>
        <DashboardHeader
          version={version}
          statusText={statusText}
          currencyMode={currencyMode}
          setCurrencyMode={setCurrencyMode}
          openFile={openFile}
          integrations={integrations}
          can={(id) => integrations?.isCapabilityAvailable(id) ?? false}
          action={async (id) => {
            if (!integrations) return;
            const intent = {
              capabilityId: id,
              payload: {}
            };
          }}
          runCommand={runCommand}
          onRebuild={() => {
          }}
          showRebuild={true}
        />

        {/* Navigation Tabs - 紧凑 */}
        <div style={{ display: "flex", gap: "4px", marginTop: "8px", paddingBottom: "8px" }}>
          {renderTabButton("trading", "交易中心", "📊")}
          {renderTabButton("analytics", "复盘分析", "📈")}
          {renderTabButton("learn", "策略学习", "🎓")}
          {renderTabButton("manage", "数据管理", "🛡️")}
          {renderTabButton("backend", "后端服务", "🔌")}
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "24px", // Increased padding
        background: "var(--background-primary)"
      }}>
        {/* 
                    Tabs are now self-contained and consume ConsoleContext directly.
                    No props passing required!
                */}
        {activePage === "trading" && <TradingHubTab />}
        {activePage === "analytics" && <AnalyticsTab />}
        {activePage === "learn" && <LearnTab />}
        {activePage === "manage" && <ManageTab />}
        {activePage === "backend" && <BackendTab />}

        {/* Journal Tab (Placeholder or Future Implementation) */}
        {activePage === "journal" && (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '200px',
            color: 'var(--text-muted)'
          }}>
            日志试图尚在开发中...
          </div>
        )}
      </div>
    </div>
  );
};
