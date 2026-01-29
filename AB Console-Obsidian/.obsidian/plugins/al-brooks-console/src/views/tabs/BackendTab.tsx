import * as React from "react";
import { GlassPanel } from "../../ui/components/GlassPanel";
import { SectionHeader } from "../../ui/components/SectionHeader";
import { InteractiveButton } from "../../ui/components/InteractiveButton";
import { useConsoleContext } from "../../context/ConsoleContext";
import { useBackendConnection } from "../../hooks/useBackendData";
import { useDataSourceStatus } from "../../hooks/useDataSourceStatus";
import { V5_COLORS } from "../../ui/tokens";
import { SPACE } from "../../ui/styles/dashboardPrimitives";
import { DATA_SOURCES, type DataSource } from "../../services/data-source";
import { AIChatPanel } from "../components/AIChatPanel";

// Service Status Badge
interface ServiceStatusProps {
  name: string;
  status: string;
}

const ServiceStatusBadge: React.FC<ServiceStatusProps> = ({ name, status }) => {
  const isRunning = status === "running" || status === "connected" || status === "healthy";
  const color = isRunning ? V5_COLORS.live : V5_COLORS.textDim;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "6px 10px",
        background: "var(--background-primary)",
        borderRadius: "6px",
        border: `1px solid ${isRunning ? V5_COLORS.live + "30" : "var(--background-modifier-border)"}`,
      }}
    >
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: color,
        }}
      />
      <span style={{ fontSize: "12px", fontWeight: 500 }}>{name}</span>
      <span style={{ color: "var(--text-muted)", fontSize: "11px", marginLeft: "auto" }}>
        {status}
      </span>
    </div>
  );
};

// Data Source Status Badge
interface DataSourceStatusProps {
  source: DataSource;
  isAvailable: boolean;
}

const DataSourceStatusBadge: React.FC<DataSourceStatusProps> = ({ source, isAvailable }) => {
  const config = DATA_SOURCES[source];
  const color = isAvailable ? V5_COLORS.live : V5_COLORS.textDim;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        padding: "10px",
        background: "var(--background-primary)",
        borderRadius: "6px",
        border: `1px solid ${isAvailable ? V5_COLORS.live + "30" : "var(--background-modifier-border)"}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: color,
          }}
        />
        <span style={{ fontSize: "12px", fontWeight: 600 }}>{config.name}</span>
        <span
          style={{
            fontSize: "10px",
            padding: "1px 4px",
            background: isAvailable ? V5_COLORS.live + "15" : V5_COLORS.textDim + "15",
            color: isAvailable ? V5_COLORS.live : V5_COLORS.textDim,
            borderRadius: "3px",
            marginLeft: "auto",
          }}
        >
          {isAvailable ? "正常" : "断开"}
        </span>
      </div>
      <div style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.4 }}>
        {config.delay === "realtime" ? "⚡ 实时" : "⏱️ 延迟"} · {config.rateLimit}
      </div>
    </div>
  );
};

// Data Health Item
interface DataHealthItemProps {
  symbol: string;
  delayMinutes: number;
  lastPrice?: number;
  category: string;
}

const DataHealthItem: React.FC<DataHealthItemProps> = ({ symbol, delayMinutes, lastPrice, category }) => {
  const isHealthy = delayMinutes < 5;
  const isWarning = delayMinutes >= 5 && delayMinutes < 30;
  const statusColor = isHealthy ? V5_COLORS.live : isWarning ? V5_COLORS.back : V5_COLORS.loss;
  const statusText = isHealthy ? "正常" : isWarning ? "延迟" : "异常";

  const categoryEmoji = {
    crypto: "💰",
    stock: "📈",
    forex: "💱",
    future: "📊",
    metal: "🥇",
  }[category] || "📊";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px 10px",
        background: "var(--background-primary)",
        borderRadius: "6px",
        fontSize: "12px",
      }}
    >
      <span>{categoryEmoji}</span>
      <span style={{ fontWeight: 500, minWidth: "50px" }}>{symbol}</span>
      <span style={{ color: "var(--text-muted)", fontSize: "11px", marginLeft: "auto" }}>
        {delayMinutes > 900 ? ">15h" : `${delayMinutes.toFixed(0)}m`}
      </span>
      <span
        style={{
          color: statusColor,
          fontSize: "10px",
          fontWeight: 500,
          padding: "1px 6px",
          background: statusColor + "15",
          borderRadius: "3px",
        }}
      >
        {statusText}
      </span>
    </div>
  );
};

// Strategy Quick Actions Panel
const StrategyQuickPanel: React.FC = () => {
  const { runCommand } = useConsoleContext();

  const actions = [
    { id: "open-strategy-repo", label: "策略仓库", icon: "📁", desc: "管理交易策略" },
    { id: "open-backtest", label: "回测中心", icon: "📊", desc: "验证策略效果" },
    { id: "create-strategy", label: "新建策略", icon: "➕", desc: "创建自定义策略" },
    { id: "signal-rules", label: "信号规则", icon: "📡", desc: "配置检测规则" },
  ];

  return (
    <GlassPanel>
      <SectionHeader title="策略系统" subtitle="快速入口" icon="🎯" />
      
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: SPACE.sm }}>
        {actions.map((action) => (
          <InteractiveButton
            key={action.id}
            interaction="text"
            onClick={() => {
              // 打开市场扫描仪或其他面板
              if (action.id === "open-strategy-repo") {
                // 可以打开策略仓库视图
                runCommand?.("al-brooks-console:open-market-scanner");
              } else {
                // 其他功能待实现
                console.log(`[BackendTab] Action: ${action.id}`);
              }
            }}
            style={{
              padding: "12px",
              background: "var(--background-primary)",
              border: "1px solid var(--background-modifier-border)",
              borderRadius: "8px",
              textAlign: "left",
            }}
          >
            <div style={{ fontSize: "20px", marginBottom: "4px" }}>{action.icon}</div>
            <div style={{ fontSize: "13px", fontWeight: 600 }}>{action.label}</div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
              {action.desc}
            </div>
          </InteractiveButton>
        ))}
      </div>
    </GlassPanel>
  );
};

// Sync Status Panel
const SyncStatusPanel: React.FC = () => {
  const { settings } = useConsoleContext();
  const [syncStatus, setSyncStatus] = React.useState<{
    last_sync?: string;
    sync_count: number;
    strategies_count: number;
    trades_count: number;
  } | null>(null);
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [syncResult, setSyncResult] = React.useState<string | null>(null);

  const fetchSyncStatus = async () => {
    try {
      const res = await fetch(`${settings.backend.baseUrl}/api/v1/sync/status`);
      if (res.ok) {
        const data = await res.json();
        setSyncStatus(data);
      }
    } catch (e) {
      // Silently fail
    }
  };

  React.useEffect(() => {
    fetchSyncStatus();
    const interval = setInterval(fetchSyncStatus, 30000);
    return () => clearInterval(interval);
  }, [settings.backend.baseUrl]);

  const triggerSync = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch(`${settings.backend.baseUrl}/api/v1/strategies/sync`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setSyncResult(`✅ 同步完成: ${data.synced_strategies} 策略, ${data.synced_trades} 交易`);
        fetchSyncStatus();
      } else {
        setSyncResult("❌ 同步失败");
      }
    } catch (e) {
      setSyncResult("❌ 同步失败: 后端未运行");
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncResult(null), 5000);
    }
  };

  const formatTime = (iso?: string) => {
    if (!iso) return "从未";
    const date = new Date(iso);
    const now = new Date();
    const diff = (now.getTime() - date.getTime()) / 1000;
    if (diff < 60) return "刚刚";
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
    return date.toLocaleDateString("zh-CN");
  };

  return (
    <GlassPanel>
      <SectionHeader title="Obsidian 同步" subtitle="Vault Sync" icon="🔄" />
      
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: SPACE.sm }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "8px",
        }}>
          <div style={{
            padding: "10px",
            background: "var(--background-primary)",
            borderRadius: "6px",
            textAlign: "center",
          }}>
            <div style={{ fontSize: "18px", fontWeight: 600 }}>{syncStatus?.strategies_count ?? "-"}</div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>策略</div>
          </div>
          <div style={{
            padding: "10px",
            background: "var(--background-primary)",
            borderRadius: "6px",
            textAlign: "center",
          }}>
            <div style={{ fontSize: "18px", fontWeight: 600 }}>{syncStatus?.trades_count ?? "-"}</div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>交易</div>
          </div>
          <div style={{
            padding: "10px",
            background: "var(--background-primary)",
            borderRadius: "6px",
            textAlign: "center",
          }}>
            <div style={{ fontSize: "18px", fontWeight: 600 }}>{syncStatus?.sync_count ?? "-"}</div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>同步次数</div>
          </div>
        </div>

        <div style={{
          padding: "8px 12px",
          background: "var(--background-primary)",
          borderRadius: "6px",
          fontSize: "12px",
          color: "var(--text-muted)",
        }}>
          上次同步: {formatTime(syncStatus?.last_sync)}
        </div>

        {syncResult && (
          <div style={{
            padding: "8px 12px",
            background: syncResult.includes("✅") ? V5_COLORS.live + "15" : V5_COLORS.loss + "15",
            borderRadius: "6px",
            fontSize: "12px",
          }}>
            {syncResult}
          </div>
        )}

        <InteractiveButton
          interaction="text"
          onClick={triggerSync}
          disabled={isSyncing}
          style={{
            padding: "10px",
            background: V5_COLORS.accent,
            color: "white",
            borderRadius: "6px",
            fontSize: "13px",
          }}
        >
          {isSyncing ? "🔄 同步中..." : "🔄 手动同步"}
        </InteractiveButton>
      </div>
    </GlassPanel>
  );
};

// Script Executor Helper
const executeScript = async (scriptName: string): Promise<{ success: boolean; output: string }> => {
  try {
    // @ts-ignore - Obsidian has Node.js access
    const { exec } = require("child_process");
    const path = require("path");
    
    // Get vault root path
    // @ts-ignore
    const vaultPath = (window as any).app?.vault?.adapter?.basePath || "";
    // 脚本现在位于 "📁 启动工具/" 目录下
    const scriptPath = path.join(vaultPath, "📁 启动工具", scriptName);
    
    return new Promise((resolve) => {
      exec(`"${scriptPath}"`, { timeout: 120000 }, (error: any, stdout: string, stderr: string) => {
        if (error) {
          resolve({ success: false, output: stderr || error.message });
        } else {
          resolve({ success: true, output: stdout || "执行成功" });
        }
      });
    });
  } catch (e) {
    return { success: false, output: `无法执行脚本: ${e}` };
  }
};

// Backend Control Panel with Script Execution
const BackendControlPanel: React.FC = () => {
  const { settings } = useConsoleContext();
  const [isStarting, setIsStarting] = React.useState(false);
  const [isExecuting, setIsExecuting] = React.useState<string | null>(null);
  const [backendStatus, setBackendStatus] = React.useState<"stopped" | "starting" | "running">("stopped");
  const [backendError, setBackendError] = React.useState<string | null>(null);
  const [scriptOutput, setScriptOutput] = React.useState<string | null>(null);

  // 检查后端是否实际运行
  React.useEffect(() => {
    const checkBackend = async () => {
      try {
        const res = await fetch(`${settings.backend.baseUrl}/health`, { 
          method: "GET",
          signal: undefined
        });
        if (res.ok) {
          setBackendStatus("running");
          setBackendError(null);
        } else {
          setBackendStatus("stopped");
        }
      } catch {
        setBackendStatus("stopped");
      }
    };
    
    checkBackend();
    const interval = setInterval(checkBackend, 5000);
    return () => clearInterval(interval);
  }, [settings.backend.baseUrl]);

  const checkConnection = async () => {
    setIsStarting(true);
    try {
      const res = await fetch(`${settings.backend.baseUrl}/health`, { signal: undefined });
      if (res.ok) {
        setBackendStatus("running");
        setBackendError(null);
      } else {
        setBackendStatus("stopped");
      }
    } catch {
      setBackendStatus("stopped");
    } finally {
      setIsStarting(false);
    }
  };

  const runScript = async (script: string, action: string) => {
    setIsExecuting(action);
    setScriptOutput(null);
    
    const result = await executeScript(script);
    
    setScriptOutput(result.output.slice(0, 500)); // Limit output length
    setIsExecuting(null);
    
    // Check status after script execution
    setTimeout(checkConnection, 3000);
  };

  const openWebDashboard = () => {
    window.open("http://localhost:3000", "_blank");
  };

  const openApiDocs = () => {
    window.open("http://localhost:8088/docs", "_blank");
  };

  const copyCommand = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
  };

  // Quick command buttons data
  const quickCommands = [
    { 
      id: "start-all", 
      label: "🚀 启动后端", 
      script: "🚀 启动 AB Console.command",
      desc: "启动完整后端服务",
      color: V5_COLORS.live,
      showWhen: "stopped"
    },
    { 
      id: "stop-all", 
      label: "🛑 停止全部", 
      script: "🛑 停止 AB Console.command",
      desc: "停止所有服务",
      color: V5_COLORS.loss,
      showWhen: "running"
    },
  ];

  const visibleCommands = quickCommands.filter(cmd => 
    cmd.showWhen === "always" || 
    (cmd.showWhen === "running" && backendStatus === "running") ||
    (cmd.showWhen === "stopped" && backendStatus !== "running")
  );

  return (
    <GlassPanel>
      <SectionHeader title="后端控制" subtitle="一键管理 AB Console 服务" icon="🖥️" />
      
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: SPACE.sm }}>
        {/* Status Indicator */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "12px",
            background: backendStatus === "running" ? V5_COLORS.live + "10" : 
                       backendStatus === "starting" ? V5_COLORS.back + "10" : V5_COLORS.textDim + "10",
            borderRadius: "8px",
            border: `1px solid ${backendStatus === "running" ? V5_COLORS.live + "30" : 
                                backendStatus === "starting" ? V5_COLORS.back + "30" : "var(--background-modifier-border)"}`,
          }}
        >
          <span
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: backendStatus === "running" ? V5_COLORS.live : 
                         backendStatus === "starting" ? V5_COLORS.back : V5_COLORS.textDim,
              animation: backendStatus === "starting" ? "pulse 1s infinite" : undefined,
            }}
          />
          <span style={{ fontWeight: 600, fontSize: "14px" }}>
            {backendStatus === "running" ? "🟢 运行中" : 
             backendStatus === "starting" ? "🟡 连接中..." : "🔴 未连接"}
          </span>
          <span style={{ fontSize: "11px", color: "var(--text-muted)", marginLeft: "auto" }}>
            {settings.backend.baseUrl}
          </span>
        </div>

        {/* Quick Action Buttons */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px" }}>
          {visibleCommands.map((cmd) => (
            <InteractiveButton
              key={cmd.id}
              interaction="text"
              onClick={() => runScript(cmd.script, cmd.id)}
              disabled={isExecuting !== null}
              style={{
                padding: "12px",
                background: isExecuting === cmd.id ? "var(--background-secondary)" : cmd.color,
                color: "white",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 600,
                textAlign: "center",
                opacity: isExecuting === cmd.id ? 0.7 : 1,
              }}
            >
              {isExecuting === cmd.id ? "⏳ 执行中..." : cmd.label}
            </InteractiveButton>
          ))}
          
          <InteractiveButton
            interaction="text"
            onClick={checkConnection}
            disabled={isStarting}
            style={{
              padding: "12px",
              background: "var(--background-primary)",
              border: "1px solid var(--background-modifier-border)",
              borderRadius: "8px",
              fontSize: "13px",
            }}
          >
            {isStarting ? "🔄 检测中..." : "🔄 刷新状态"}
          </InteractiveButton>
          
          <InteractiveButton
            interaction="text"
            onClick={() => {
              // @ts-ignore
              (window as any).app?.setting?.open();
              setTimeout(() => {
                const tab = document.querySelector('.modal-container [data-tab="al-brooks-console"]');
                if (tab) (tab as HTMLElement).click();
              }, 100);
            }}
            style={{
              padding: "12px",
              background: "var(--background-primary)",
              border: "1px solid var(--background-modifier-border)",
              borderRadius: "8px",
              fontSize: "13px",
            }}
          >
            ⚙️ 设置
          </InteractiveButton>
        </div>

        {/* Script Output */}
        {scriptOutput && (
          <div style={{
            padding: "10px",
            background: "var(--background-primary)",
            border: "1px solid var(--background-modifier-border)",
            borderRadius: "6px",
            fontSize: "11px",
            fontFamily: "monospace",
            maxHeight: "100px",
            overflow: "auto",
            whiteSpace: "pre-wrap",
          }}>
            {scriptOutput}
          </div>
        )}

        {/* Quick Access Buttons */}
        {backendStatus === "running" && (
          <div style={{ 
            display: "grid", 
            gridTemplateColumns: "1fr 1fr", 
            gap: "8px",
            marginTop: "4px",
            paddingTop: "12px",
            borderTop: "1px solid var(--background-modifier-border)",
          }}>
            <InteractiveButton
              interaction="text"
              onClick={openWebDashboard}
              style={{
                padding: "10px",
                background: "var(--background-primary)",
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "6px",
                fontSize: "12px",
              }}
            >
              🌐 打开 Web Dashboard
            </InteractiveButton>
            <InteractiveButton
              interaction="text"
              onClick={openApiDocs}
              style={{
                padding: "10px",
                background: "var(--background-primary)",
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "6px",
                fontSize: "12px",
              }}
            >
              📚 打开 API 文档
            </InteractiveButton>
          </div>
        )}

        {/* Manual Commands Help */}
        {backendStatus !== "running" && !scriptOutput && (
          <div style={{
            padding: "10px",
            background: V5_COLORS.back + "10",
            border: `1px solid ${V5_COLORS.back}30`,
            borderRadius: "6px",
            fontSize: "11px",
            color: "var(--text-muted)",
          }}>
            <div style={{ fontWeight: 600, marginBottom: "4px" }}>💡 手动启动方式:</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <div 
                style={{ cursor: "pointer", fontFamily: "monospace" }}
                onClick={() => copyCommand('cd "AB Console-Backend" && docker-compose up -d')}
              >
                🐳 cd &quot;AB Console-Backend&quot; && docker-compose up -d
              </div>
              <div 
                style={{ cursor: "pointer", fontFamily: "monospace" }}
                onClick={() => copyCommand('./start-all.sh')}
              >
                📜 ./start-all.sh
              </div>
            </div>
          </div>
        )}
      </div>
    </GlassPanel>
  );
};

// Main Backend Tab
export const BackendTab: React.FC = () => {
  const { settings } = useConsoleContext();
  const backendSettings = settings.backend;

  const { isConnected, isChecking, status, error, checkConnection } = useBackendConnection(backendSettings);
  const { statusMap } = useDataSourceStatus(backendSettings);

  const [dataHealth, setDataHealth] = React.useState<
    Array<{ symbol: string; category: string; delayMinutes: number; lastPrice?: number }>
  >([]);
  const [isLoadingHealth, setIsLoadingHealth] = React.useState(false);

  const loadDataHealth = React.useCallback(async () => {
    if (!isConnected) return;
    setIsLoadingHealth(true);
    try {
      const symbols = settings.watchedSymbols.filter((s) => s.isActive);
      const healthData = await Promise.all(
        symbols.map(async (symbol) => {
          try {
            const res = await fetch(
              `${backendSettings.baseUrl}/api/v1/candles/${symbol.ticker}?limit=1&interval=1m`
            );
            if (!res.ok) throw new Error("Failed to fetch");
            const data = await res.json();
            const latestCandle = data[0];
            const candleTime = new Date(latestCandle.open_time).getTime();
            const now = Date.now();
            const delayMinutes = (now - candleTime) / 60000;
            return {
              symbol: symbol.id,
              category: symbol.category,
              delayMinutes,
              lastPrice: latestCandle.close,
            };
          } catch {
            return {
              symbol: symbol.id,
              category: symbol.category,
              delayMinutes: 999,
            };
          }
        })
      );
      setDataHealth(healthData);
    } finally {
      setIsLoadingHealth(false);
    }
  }, [isConnected, backendSettings.baseUrl, settings.watchedSymbols]);

  React.useEffect(() => {
    if (isConnected) loadDataHealth();
  }, [isConnected, loadDataHealth]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.lg, maxWidth: "600px" }}>
      {/* Backend Control */}
      <BackendControlPanel />

      {/* Obsidian Sync Status */}
      <SyncStatusPanel />

      {/* Strategy Quick Actions */}
      <StrategyQuickPanel />

      {/* Connection Status */}
      <GlassPanel>
        <SectionHeader title="连接状态" subtitle="Backend API" icon="🔌" />
        
        <div style={{ marginTop: SPACE.sm }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "12px",
              background: isConnected ? V5_COLORS.live + "10" : V5_COLORS.loss + "10",
              borderRadius: "8px",
              border: `1px solid ${isConnected ? V5_COLORS.live + "30" : V5_COLORS.loss + "30"}`,
            }}
          >
            <span
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                background: isConnected ? V5_COLORS.live : V5_COLORS.loss,
                boxShadow: isConnected ? `0 0 6px ${V5_COLORS.live}` : "none",
              }}
            />
            <span style={{ fontWeight: 600, fontSize: "14px" }}>
              {isChecking ? "检测中..." : isConnected ? "已连接" : "未连接"}
            </span>
            <InteractiveButton
              interaction="text"
              onClick={checkConnection}
              disabled={isChecking}
              style={{ marginLeft: "auto", fontSize: "12px", padding: "4px 8px" }}
            >
              {isChecking ? "..." : "刷新"}
            </InteractiveButton>
          </div>

          {status && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginTop: "10px" }}>
              <ServiceStatusBadge name="数据库" status={status.services.database} />
              <ServiceStatusBadge name="数据采集" status={status.services.data_service} />
              <ServiceStatusBadge name="指标计算" status={status.services.trading_service} />
              <ServiceStatusBadge name="信号检测" status={status.services.signal_service} />
            </div>
          )}
        </div>
      </GlassPanel>

      {/* Data Source Status */}
      <GlassPanel>
        <SectionHeader title="数据源" subtitle="Availability" icon="🌐" />
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: SPACE.sm }}>
          <DataSourceStatusBadge source="BINANCE" isAvailable={statusMap.BINANCE.isAvailable} />
          <DataSourceStatusBadge source="YAHOO" isAvailable={statusMap.YAHOO.isAvailable} />
        </div>
      </GlassPanel>

      {/* AI Chat */}
      <AIChatPanel />

      {/* Data Health */}
      <GlassPanel>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <SectionHeader title="数据健康" subtitle="Latency" icon="💓" />
          <InteractiveButton
            interaction="text"
            onClick={loadDataHealth}
            disabled={isLoadingHealth}
            style={{ fontSize: "11px", padding: "4px 8px" }}
          >
            {isLoadingHealth ? "..." : "刷新"}
          </InteractiveButton>
        </div>
        
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: SPACE.sm, maxHeight: "200px", overflowY: "auto" }}>
          {!isConnected ? (
            <div style={{ padding: "12px", textAlign: "center", color: "var(--text-muted)", fontSize: "12px" }}>
              未连接
            </div>
          ) : (
            dataHealth.map((item) => (
              <DataHealthItem
                key={item.symbol}
                symbol={item.symbol}
                category={item.category}
                delayMinutes={item.delayMinutes}
                lastPrice={item.lastPrice}
              />
            ))
          )}
        </div>
      </GlassPanel>
    </div>
  );
};
