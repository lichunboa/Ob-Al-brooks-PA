import * as React from "react";
import { GlassPanel } from "../../ui/components/GlassPanel";
import { SectionHeader } from "../../ui/components/SectionHeader";
import { InteractiveButton } from "../../ui/components/InteractiveButton";
import { useConsoleContext } from "../../context/ConsoleContext";
import { useBackendConnection, useAIAnalysis } from "../../hooks/useBackendData";
import { getBackendClient } from "../../services/backend-client";
import { V5_COLORS } from "../../ui/tokens";
import { SPACE } from "../../ui/styles/dashboardPrimitives";

// ============================================================
// Sub-components
// ============================================================

interface ServiceStatusProps {
  name: string;
  status: string;
}

const ServiceStatusBadge: React.FC<ServiceStatusProps> = ({ name, status }) => {
  const isRunning = status === "running" || status === "connected" || status === "healthy";
  const color = isRunning ? V5_COLORS.live : V5_COLORS.textDim;

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "8px 12px",
      background: "var(--background-secondary)",
      borderRadius: "6px",
      border: `1px solid ${isRunning ? V5_COLORS.live + "40" : "var(--background-modifier-border)"}`,
    }}>
      <span style={{
        width: "8px",
        height: "8px",
        borderRadius: "50%",
        background: color,
        boxShadow: isRunning ? `0 0 6px ${color}` : "none",
      }} />
      <span style={{ fontWeight: 500 }}>{name}</span>
      <span style={{ color: "var(--text-muted)", fontSize: "12px", marginLeft: "auto" }}>
        {status}
      </span>
    </div>
  );
};

// ============================================================
// Main Component
// ============================================================

export const BackendTab: React.FC = () => {
  const { settings, onSaveSettings, app } = useConsoleContext();
  const backendSettings = settings.backend;

  // Connection state
  const { isConnected, isChecking, status, error, checkConnection } = useBackendConnection(backendSettings);

  // Local state for settings form
  const [localSettings, setLocalSettings] = React.useState({
    enabled: backendSettings.enabled,
    baseUrl: backendSettings.baseUrl,
    apiToken: backendSettings.apiToken,
    aiApiEndpoint: backendSettings.aiApiEndpoint,
    aiApiKey: backendSettings.aiApiKey,
    aiModel: backendSettings.aiModel,
    telegramBotToken: backendSettings.telegramBotToken,
    telegramChatId: backendSettings.telegramChatId,
  });

  // AI Chat state
  const [aiPrompt, setAiPrompt] = React.useState("");
  const [aiResponse, setAiResponse] = React.useState("");
  const [aiLoading, setAiLoading] = React.useState(false);
  const [aiError, setAiError] = React.useState<string | null>(null);
  const [aiTestResult, setAiTestResult] = React.useState<{ success: boolean; message: string } | null>(null);

  // Telegram state
  const [telegramLoading, setTelegramLoading] = React.useState(false);
  const [telegramTestResult, setTelegramTestResult] = React.useState<{ success: boolean; message: string } | null>(null);

  // Save settings
  const saveSettings = React.useCallback(async () => {
    const newBackendSettings = {
      ...backendSettings,
      ...localSettings,
    };
    const newSettings = {
      ...settings,
      backend: newBackendSettings,
    };
    await onSaveSettings(newSettings);

    // Update client config
    getBackendClient({
      baseUrl: localSettings.baseUrl,
      apiToken: localSettings.apiToken,
      aiApiEndpoint: localSettings.aiApiEndpoint,
      aiApiKey: localSettings.aiApiKey,
      aiModel: localSettings.aiModel,
      telegramBotToken: localSettings.telegramBotToken,
      telegramChatId: localSettings.telegramChatId,
    });
  }, [backendSettings, localSettings, settings, onSaveSettings]);

  // Test AI connection
  const testAIConnection = React.useCallback(async () => {
    setAiTestResult(null);
    setAiLoading(true);

    try {
      const client = getBackendClient({
        aiApiEndpoint: localSettings.aiApiEndpoint,
        aiApiKey: localSettings.aiApiKey,
        aiModel: localSettings.aiModel,
      });
      const result = await client.testAIConnection();
      setAiTestResult(result);
    } catch (err) {
      setAiTestResult({
        success: false,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setAiLoading(false);
    }
  }, [localSettings]);

  // Send AI message
  const sendAIMessage = React.useCallback(async () => {
    if (!aiPrompt.trim()) return;

    setAiLoading(true);
    setAiError(null);

    try {
      const client = getBackendClient({
        aiApiEndpoint: localSettings.aiApiEndpoint,
        aiApiKey: localSettings.aiApiKey,
        aiModel: localSettings.aiModel,
      });
      const response = await client.callAI(aiPrompt);
      setAiResponse(response);
      setAiPrompt("");
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err));
    } finally {
      setAiLoading(false);
    }
  }, [aiPrompt, localSettings]);

  // Test Telegram connection
  const testTelegramConnection = React.useCallback(async () => {
    setTelegramTestResult(null);
    setTelegramLoading(true);

    try {
      const client = getBackendClient({
        telegramBotToken: localSettings.telegramBotToken,
        telegramChatId: localSettings.telegramChatId,
      });
      const result = await client.testTelegramConnection();
      setTelegramTestResult(result);
    } catch (err) {
      setTelegramTestResult({
        success: false,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setTelegramLoading(false);
    }
  }, [localSettings]);

  // Send test signal to Telegram
  const sendTestSignal = React.useCallback(async () => {
    setTelegramTestResult(null);
    setTelegramLoading(true);

    try {
      const client = getBackendClient({
        telegramBotToken: localSettings.telegramBotToken,
        telegramChatId: localSettings.telegramChatId,
      });

      // Create a test signal
      const testSignal = {
        symbol: "BTCUSDT",
        signal_name: "测试信号 - H1/L1 突破",
        direction: "BUY" as const,
        strength: 0.75,
        timestamp: new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
        message: "这是一条测试信号，用于验证数据流是否正常工作。",
      };

      const result = await client.sendSignalToTelegram(testSignal);
      setTelegramTestResult(result);
    } catch (err) {
      setTelegramTestResult({
        success: false,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setTelegramLoading(false);
    }
  }, [localSettings]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.lg }}>
      {/* ============================================================ */}
      {/* Connection Status */}
      {/* ============================================================ */}
      <GlassPanel>
        <SectionHeader
          title="后端连接状态"
          subtitle="Backend API Gateway"
          icon="🔌"
        />

        <div style={{ display: "flex", flexDirection: "column", gap: SPACE.md, marginTop: SPACE.md }}>
          {/* Status indicator */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "16px",
            background: isConnected
              ? `linear-gradient(135deg, ${V5_COLORS.live}15, ${V5_COLORS.live}05)`
              : "var(--background-secondary)",
            borderRadius: "8px",
            border: `1px solid ${isConnected ? V5_COLORS.live + "40" : "var(--background-modifier-border)"}`,
          }}>
            <span style={{
              width: "12px",
              height: "12px",
              borderRadius: "50%",
              background: isConnected ? V5_COLORS.live : V5_COLORS.textDim,
              boxShadow: isConnected ? `0 0 8px ${V5_COLORS.live}` : "none",
            }} />
            <span style={{ fontWeight: 600, fontSize: "15px" }}>
              {isChecking ? "检测中..." : isConnected ? "已连接" : "未连接"}
            </span>
            {error && (
              <span style={{ color: V5_COLORS.loss, fontSize: "13px", marginLeft: "auto" }}>
                {error}
              </span>
            )}
            <InteractiveButton
              interaction="text"
              onClick={checkConnection}
              disabled={isChecking}
              style={{
                marginLeft: "auto",
                padding: "6px 12px",
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "6px",
              }}
            >
              {isChecking ? "检测中..." : "刷新"}
            </InteractiveButton>
          </div>

          {/* Services status */}
          {status && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "8px" }}>
              <ServiceStatusBadge name="数据库" status={status.services.database} />
              <ServiceStatusBadge name="数据采集" status={status.services.data_service} />
              <ServiceStatusBadge name="指标计算" status={status.services.trading_service} />
              <ServiceStatusBadge name="信号检测" status={status.services.signal_service} />
              <ServiceStatusBadge name="AI 服务" status={status.services.ai_service} />
            </div>
          )}
        </div>
      </GlassPanel>

      {/* ============================================================ */}
      {/* Settings Panel */}
      {/* ============================================================ */}
      <GlassPanel>
        <SectionHeader
          title="连接设置"
          subtitle="API 配置"
          icon="⚙️"
        />

        <div style={{ display: "flex", flexDirection: "column", gap: SPACE.md, marginTop: SPACE.md }}>
          {/* Enable toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={localSettings.enabled}
                onChange={(e) => setLocalSettings({ ...localSettings, enabled: e.target.checked })}
              />
              <span>启用后端服务</span>
            </label>
          </div>

          {/* Backend API URL */}
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label style={{ fontSize: "13px", color: "var(--text-muted)" }}>后端 API 地址</label>
            <input
              type="text"
              value={localSettings.baseUrl}
              onChange={(e) => setLocalSettings({ ...localSettings, baseUrl: e.target.value })}
              placeholder="http://localhost:8088"
              style={{
                padding: "8px 12px",
                background: "var(--background-secondary)",
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "6px",
                color: "var(--text-normal)",
              }}
            />
          </div>

          {/* API Token */}
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label style={{ fontSize: "13px", color: "var(--text-muted)" }}>API Token</label>
            <input
              type="password"
              value={localSettings.apiToken}
              onChange={(e) => setLocalSettings({ ...localSettings, apiToken: e.target.value })}
              placeholder="dev-token-123"
              style={{
                padding: "8px 12px",
                background: "var(--background-secondary)",
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "6px",
                color: "var(--text-normal)",
              }}
            />
          </div>

          <div style={{ borderTop: "1px solid var(--background-modifier-border)", paddingTop: SPACE.md }}>
            <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: SPACE.sm }}>AI API 配置 (Gemini)</div>
          </div>

          {/* AI API Endpoint */}
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label style={{ fontSize: "13px", color: "var(--text-muted)" }}>AI API Endpoint</label>
            <input
              type="text"
              value={localSettings.aiApiEndpoint}
              onChange={(e) => setLocalSettings({ ...localSettings, aiApiEndpoint: e.target.value })}
              placeholder="http://127.0.0.1:8045"
              style={{
                padding: "8px 12px",
                background: "var(--background-secondary)",
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "6px",
                color: "var(--text-normal)",
              }}
            />
          </div>

          {/* AI API Key */}
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label style={{ fontSize: "13px", color: "var(--text-muted)" }}>AI API Key</label>
            <input
              type="password"
              value={localSettings.aiApiKey}
              onChange={(e) => setLocalSettings({ ...localSettings, aiApiKey: e.target.value })}
              placeholder="sk-xxx"
              style={{
                padding: "8px 12px",
                background: "var(--background-secondary)",
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "6px",
                color: "var(--text-normal)",
              }}
            />
          </div>

          {/* AI Model */}
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label style={{ fontSize: "13px", color: "var(--text-muted)" }}>AI 模型</label>
            <select
              value={localSettings.aiModel}
              onChange={(e) => setLocalSettings({ ...localSettings, aiModel: e.target.value })}
              style={{
                padding: "8px 12px",
                background: "var(--background-secondary)",
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "6px",
                color: "var(--text-normal)",
              }}
            >
              <option value="gemini-3-pro-high">Gemini 3 Pro High</option>
              <option value="gemini-3-pro">Gemini 3 Pro</option>
              <option value="gemini-3-flash-preview">Gemini 3 Flash Preview</option>
              <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash Exp</option>
              <option value="gpt-4o">GPT-4o</option>
              <option value="gpt-4o-mini">GPT-4o Mini</option>
              <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
            </select>
          </div>

          {/* Buttons */}
          <div style={{ display: "flex", gap: "8px", marginTop: SPACE.sm }}>
            <InteractiveButton
              interaction="text"
              onClick={saveSettings}
              style={{
                padding: "8px 16px",
                background: V5_COLORS.accent,
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                fontWeight: 500,
              }}
            >
              保存设置
            </InteractiveButton>
            <InteractiveButton
              interaction="text"
              onClick={testAIConnection}
              disabled={!localSettings.aiApiKey || aiLoading}
              style={{
                padding: "8px 16px",
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "6px",
              }}
            >
              {aiLoading ? "测试中..." : "测试 AI 连接"}
            </InteractiveButton>
          </div>

          {/* Test result */}
          {aiTestResult && (
            <div style={{
              padding: "12px",
              background: aiTestResult.success
                ? `${V5_COLORS.live}15`
                : `${V5_COLORS.loss}15`,
              borderRadius: "6px",
              border: `1px solid ${aiTestResult.success ? V5_COLORS.live : V5_COLORS.loss}40`,
              color: aiTestResult.success ? V5_COLORS.live : V5_COLORS.loss,
              fontSize: "13px",
            }}>
              {aiTestResult.success ? "✅ " : "❌ "}{aiTestResult.message}
            </div>
          )}

          {/* Telegram Configuration Section */}
          <div style={{ borderTop: "1px solid var(--background-modifier-border)", paddingTop: SPACE.md, marginTop: SPACE.sm }}>
            <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: SPACE.sm }}>📨 Telegram 推送配置</div>
          </div>

          {/* Telegram Bot Token */}
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label style={{ fontSize: "13px", color: "var(--text-muted)" }}>Bot Token</label>
            <input
              type="password"
              value={localSettings.telegramBotToken}
              onChange={(e) => setLocalSettings({ ...localSettings, telegramBotToken: e.target.value })}
              placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
              style={{
                padding: "8px 12px",
                background: "var(--background-secondary)",
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "6px",
                color: "var(--text-normal)",
              }}
            />
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              从 @BotFather 获取 Bot Token
            </span>
          </div>

          {/* Telegram Chat ID */}
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label style={{ fontSize: "13px", color: "var(--text-muted)" }}>Chat ID</label>
            <input
              type="text"
              value={localSettings.telegramChatId}
              onChange={(e) => setLocalSettings({ ...localSettings, telegramChatId: e.target.value })}
              placeholder="-1001234567890 或 123456789"
              style={{
                padding: "8px 12px",
                background: "var(--background-secondary)",
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "6px",
                color: "var(--text-normal)",
              }}
            />
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              私聊 ID 或群组 ID (群组 ID 以 -100 开头)
            </span>
          </div>

          {/* Telegram Buttons */}
          <div style={{ display: "flex", gap: "8px" }}>
            <InteractiveButton
              interaction="text"
              onClick={testTelegramConnection}
              disabled={!localSettings.telegramBotToken || !localSettings.telegramChatId || telegramLoading}
              style={{
                padding: "8px 16px",
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "6px",
              }}
            >
              {telegramLoading ? "发送中..." : "测试连接"}
            </InteractiveButton>
            <InteractiveButton
              interaction="text"
              onClick={sendTestSignal}
              disabled={!localSettings.telegramBotToken || !localSettings.telegramChatId || telegramLoading}
              style={{
                padding: "8px 16px",
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "6px",
              }}
            >
              发送测试信号
            </InteractiveButton>
          </div>

          {/* Telegram Test result */}
          {telegramTestResult && (
            <div style={{
              padding: "12px",
              background: telegramTestResult.success
                ? `${V5_COLORS.live}15`
                : `${V5_COLORS.loss}15`,
              borderRadius: "6px",
              border: `1px solid ${telegramTestResult.success ? V5_COLORS.live : V5_COLORS.loss}40`,
              color: telegramTestResult.success ? V5_COLORS.live : V5_COLORS.loss,
              fontSize: "13px",
            }}>
              {telegramTestResult.success ? "✅ " : "❌ "}{telegramTestResult.message}
            </div>
          )}
        </div>
      </GlassPanel>

      {/* ============================================================ */}
      {/* AI Chat Panel */}
      {/* ============================================================ */}
      <GlassPanel>
        <SectionHeader
          title="AI 交易助手"
          subtitle="智能分析 & 问答"
          icon="🤖"
        />

        <div style={{ display: "flex", flexDirection: "column", gap: SPACE.md, marginTop: SPACE.md }}>
          {/* Response area */}
          {aiResponse && (
            <div style={{
              padding: "16px",
              background: "var(--background-secondary)",
              borderRadius: "8px",
              border: "1px solid var(--background-modifier-border)",
              maxHeight: "300px",
              overflowY: "auto",
              whiteSpace: "pre-wrap",
              fontSize: "14px",
              lineHeight: "1.6",
            }}>
              {aiResponse}
            </div>
          )}

          {/* Error message */}
          {aiError && (
            <div style={{
              padding: "12px",
              background: `${V5_COLORS.loss}15`,
              borderRadius: "6px",
              border: `1px solid ${V5_COLORS.loss}40`,
              color: V5_COLORS.loss,
              fontSize: "13px",
            }}>
              ❌ {aiError}
            </div>
          )}

          {/* Input area */}
          <div style={{ display: "flex", gap: "8px" }}>
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="输入问题或分析请求..."
              rows={3}
              style={{
                flex: 1,
                padding: "12px",
                background: "var(--background-secondary)",
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "8px",
                color: "var(--text-normal)",
                resize: "vertical",
                fontFamily: "inherit",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  sendAIMessage();
                }
              }}
            />
          </div>

          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <InteractiveButton
              interaction="text"
              onClick={sendAIMessage}
              disabled={!aiPrompt.trim() || aiLoading || !localSettings.aiApiKey}
              style={{
                padding: "8px 16px",
                background: V5_COLORS.accent,
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                fontWeight: 500,
              }}
            >
              {aiLoading ? "分析中..." : "发送"}
            </InteractiveButton>
          </div>

          {/* Quick prompts */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {[
              "分析当前 BTCUSDT 市场结构",
              "Al Brooks 价格行为分析指南",
              "如何识别交易区间突破",
              "趋势反转的关键信号",
            ].map((prompt) => (
              <button
                key={prompt}
                onClick={() => setAiPrompt(prompt)}
                style={{
                  padding: "6px 12px",
                  background: "var(--background-secondary)",
                  border: "1px solid var(--background-modifier-border)",
                  borderRadius: "16px",
                  color: "var(--text-muted)",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </GlassPanel>

      {/* ============================================================ */}
      {/* API Endpoints Info */}
      {/* ============================================================ */}
      <GlassPanel>
        <SectionHeader
          title="可用 API 端点"
          subtitle="REST API Reference"
          icon="📡"
        />

        <div style={{
          marginTop: SPACE.md,
          fontSize: "13px",
          fontFamily: "var(--font-monospace)",
          background: "var(--background-secondary)",
          padding: "16px",
          borderRadius: "8px",
          overflowX: "auto",
        }}>
          <div style={{ color: "var(--text-muted)", marginBottom: "8px" }}>Base URL: {localSettings.baseUrl}</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--background-modifier-border)" }}>
                <th style={{ textAlign: "left", padding: "8px 0", color: "var(--text-muted)" }}>Method</th>
                <th style={{ textAlign: "left", padding: "8px 0", color: "var(--text-muted)" }}>Endpoint</th>
                <th style={{ textAlign: "left", padding: "8px 0", color: "var(--text-muted)" }}>Description</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["GET", "/health", "健康检查"],
                ["GET", "/api/v1/status", "系统状态"],
                ["GET", "/api/v1/symbols", "交易对列表"],
                ["GET", "/api/v1/candles/{symbol}", "K线数据"],
                ["GET", "/api/v1/indicators/{symbol}", "技术指标"],
                ["GET", "/api/v1/signals/{symbol}", "信号数据"],
                ["POST", "/api/v1/analysis", "AI 分析"],
                ["GET", "/api/v1/al-brooks/market-cycle", "市场周期"],
                ["GET", "/api/v1/al-brooks/patterns", "形态识别"],
              ].map(([method, endpoint, desc]) => (
                <tr key={endpoint} style={{ borderBottom: "1px solid var(--background-modifier-border-hover)" }}>
                  <td style={{ padding: "8px 0" }}>
                    <span style={{
                      padding: "2px 6px",
                      borderRadius: "4px",
                      fontSize: "11px",
                      fontWeight: 600,
                      background: method === "GET" ? V5_COLORS.live + "20" : V5_COLORS.accent + "20",
                      color: method === "GET" ? V5_COLORS.live : V5_COLORS.accent,
                    }}>
                      {method}
                    </span>
                  </td>
                  <td style={{ padding: "8px 0", color: "var(--text-normal)" }}>{endpoint}</td>
                  <td style={{ padding: "8px 0", color: "var(--text-muted)" }}>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassPanel>
    </div>
  );
};
