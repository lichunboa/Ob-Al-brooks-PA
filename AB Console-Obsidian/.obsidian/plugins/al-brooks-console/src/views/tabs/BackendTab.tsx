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

// Category display names
const CATEGORY_LABELS: Record<string, string> = {
  momentum: "动量",
  pattern: "形态",
  trend: "趋势",
  volatility: "波动率",
  volume: "成交量",
  futures: "期货",
};

// Signal Monitor Panel
const SignalMonitorPanel: React.FC = () => {
  const { settings } = useConsoleContext();
  const syncServiceUrl = settings.backend.baseUrl.replace(/:\d+$/, ":8089");

  const [categories, setCategories] = React.useState<
    { category: string; count: number; enabled_count: number }[]
  >([]);
  const [isLoading, setIsLoading] = React.useState(false);

  const fetchCategories = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${syncServiceUrl}/api/v1/config/signal-rules/categories`, {
        signal: undefined,
      });
      if (res.ok) {
        setCategories(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [syncServiceUrl]);

  React.useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const totalRules = categories.reduce((s, c) => s + c.count, 0);
  const totalEnabled = categories.reduce((s, c) => s + c.enabled_count, 0);

  const openSignalRules = () => {
    import("../../ui/components/SignalRulesModal").then(({ SignalRulesModal }) => {
      const modal = new SignalRulesModal(
        // @ts-ignore
        window.app,
        `${syncServiceUrl}/api/v1`
      );
      modal.open();
    }).catch((err) => {
      console.error("Failed to load SignalRulesModal:", err);
    });
  };

  return (
    <GlassPanel>
      <SectionHeader title="信号监控" subtitle="Signal Rules" icon="📡" />

      <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: SPACE.sm }}>
        {/* Summary stats */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "10px 12px",
            background: "var(--background-primary)",
            borderRadius: "6px",
            border: "1px solid var(--background-modifier-border)",
          }}
        >
          <span style={{ fontSize: "13px", fontWeight: 600 }}>
            {isLoading ? "..." : `${totalEnabled}/${totalRules}`}
          </span>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>规则启用中</span>
        </div>

        {/* Per-category breakdown */}
        {categories.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px" }}>
            {categories.map((cat) => (
              <div
                key={cat.category}
                style={{
                  padding: "8px",
                  background: "var(--background-primary)",
                  borderRadius: "6px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "14px", fontWeight: 600 }}>
                  {cat.enabled_count}/{cat.count}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                  {CATEGORY_LABELS[cat.category] || cat.category}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Open signal rules button */}
        <InteractiveButton
          interaction="text"
          onClick={openSignalRules}
          style={{
            padding: "10px",
            background: "var(--background-primary)",
            border: "1px solid var(--background-modifier-border)",
            borderRadius: "8px",
            fontSize: "13px",
          }}
        >
          📡 信号规则管理
        </InteractiveButton>
      </div>
    </GlassPanel>
  );
};

// Docker Command Executor Helper
const executeDockerCommand = async (action: "start" | "stop"): Promise<{ success: boolean; output: string }> => {
  try {
    // @ts-ignore - Obsidian has Node.js access
    const { exec } = require("child_process");
    const path = require("path");

    // Get project root path (Vault parent directory)
    // @ts-ignore
    const vaultPath = (window as any).app?.vault?.adapter?.basePath || "";
    const projectRoot = path.dirname(vaultPath);
    const backendDir = path.join(projectRoot, "AB Console-Backend");

    // Docker 命令
    const dockerCmd = action === "start"
      ? "docker compose up -d"
      : "docker compose stop";

    return new Promise((resolve) => {
      exec(
        dockerCmd,
        { cwd: backendDir, timeout: 120000 },
        (error: any, stdout: string, stderr: string) => {
          if (error) {
            resolve({ success: false, output: stderr || error.message });
          } else {
            resolve({ success: true, output: stdout || `Docker Compose ${action} 成功` });
          }
        }
      );
    });
  } catch (e) {
    return { success: false, output: `执行 Docker 命令失败: ${e}` };
  }
};

// Backend Control Panel with Script Execution
interface BackendControlPanelProps {
  serviceStatus?: {
    database: string;
    data_service: string;
    trading_service: string;
    signal_service: string;
  } | null;
}

const BackendControlPanel: React.FC<BackendControlPanelProps> = ({ serviceStatus }) => {
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

  const runDockerAction = async (action: "start" | "stop", actionId: string) => {
    setIsExecuting(actionId);
    setScriptOutput(null);

    const result = await executeDockerCommand(action);

    setScriptOutput(result.output.slice(0, 500)); // Limit output length
    setIsExecuting(null);

    // Check status after command execution
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

  // Quick command buttons data - 使用 docker compose 命令
  const quickCommands = [
    {
      id: "start-all",
      label: "🚀 启动后端",
      command: 'cd "$PROJECT_ROOT/AB Console-Backend" && docker compose up -d',
      desc: "启动 Docker Compose 服务",
      color: V5_COLORS.live,
      showWhen: "stopped"
    },
    {
      id: "stop-all",
      label: "🛑 停止全部",
      command: 'cd "$PROJECT_ROOT/AB Console-Backend" && docker compose stop',
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
              onClick={() => runDockerAction(cmd.id === "start-all" ? "start" : "stop", cmd.id)}
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
              // 打开后端配置编辑器
              import("../../ui/components/ConfigEditorModal").then(({ ConfigEditorModal }) => {
                const syncServiceUrl = settings.backend.baseUrl.replace(/:\d+$/, ":8089");
                const modal = new ConfigEditorModal(
                  // @ts-ignore
                  window.app,
                  `${syncServiceUrl}/api/v1`
                );
                modal.open();
              }).catch((err) => {
                console.error("Failed to load ConfigEditorModal:", err);
              });
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

        {/* Service Sub-Status + Quick Access */}
        {backendStatus === "running" && (
          <>
            {serviceStatus && (
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "6px",
                marginTop: "4px",
                paddingTop: "12px",
                borderTop: "1px solid var(--background-modifier-border)",
              }}>
                <ServiceStatusBadge name="数据库" status={serviceStatus.database} />
                <ServiceStatusBadge name="数据采集" status={serviceStatus.data_service} />
                <ServiceStatusBadge name="指标计算" status={serviceStatus.trading_service} />
                <ServiceStatusBadge name="信号检测" status={serviceStatus.signal_service} />
              </div>
            )}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px",
              marginTop: "4px",
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
          </>
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

  const { isConnected, status } = useBackendConnection(backendSettings);
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
      {/* 1. Backend Control (with service sub-status) */}
      <BackendControlPanel serviceStatus={status?.services ?? null} />

      {/* 2. Signal Monitor */}
      <SignalMonitorPanel />

      {/* 3. AI Chat */}
      <AIChatPanel />

      {/* 4. Data Source Status */}
      <GlassPanel>
        <SectionHeader title="数据源" subtitle="Availability" icon="🌐" />
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: SPACE.sm }}>
          <DataSourceStatusBadge source="BINANCE" isAvailable={statusMap.BINANCE.isAvailable} />
          <DataSourceStatusBadge source="YAHOO" isAvailable={statusMap.YAHOO.isAvailable} />
        </div>
      </GlassPanel>

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
