import * as React from "react";
import { GlassPanel } from "../../ui/components/GlassPanel";
import { SectionHeader } from "../../ui/components/SectionHeader";
import { InteractiveButton } from "../../ui/components/InteractiveButton";
import { useConsoleContext } from "../../context/ConsoleContext";
import { Send, Bot, User, Loader2 } from "lucide-react";
import { SPACE } from "../../ui/styles/dashboardPrimitives";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export const AIChatPanel: React.FC = () => {
  const { settings } = useConsoleContext();
  const [messages, setMessages] = React.useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "你好！我是 AI 交易助手。我可以帮你分析市场、解释价格行为概念，或回答交易相关问题。",
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  React.useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // 调用后端 AI API
      const response = await fetch(`${settings.backend.baseUrl}/api/v1/ai/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(settings.backend.apiToken && { Authorization: `Bearer ${settings.backend.apiToken}` }),
        },
        body: JSON.stringify({
          symbol: settings.backend.defaultSymbol,
          prompt: userMessage.content,
          interval: settings.backend.defaultInterval,
        }),
      });

      let aiResponse: string;

      if (response.ok) {
        const data = await response.json();
        aiResponse = data.analysis || "AI 分析完成，但没有返回内容。";
      } else {
        // 如果后端 AI 不可用，使用模拟回复
        aiResponse = `[模拟回复] 我收到了你的问题："${userMessage.content}"\n\n在实际部署中，这里会调用后端 AI 服务进行分析。\n\n你可以问：\n- 分析当前 BTC 趋势\n- 解释什么是 H1/L1\n- 这个形态是看涨还是看跌？`;
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: aiResponse,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `抱歉，请求失败：${error instanceof Error ? error.message : "未知错误"}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const quickPrompts = [
    "分析当前 BTC 趋势",
    "解释 H1/L1 概念",
    "什么是趋势线突破？",
    "布林带收窄意味着什么？",
  ];

  return (
    <GlassPanel>
      <SectionHeader title="AI 交易助手" subtitle="Gemini / Claude / GPT" icon="🤖" />

      {/* Quick Prompts */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: SPACE.sm, marginBottom: SPACE.sm }}>
        {quickPrompts.map((prompt) => (
          <button
            key={prompt}
            onClick={() => setInput(prompt)}
            style={{
              padding: "4px 10px",
              background: "var(--background-secondary)",
              border: "1px solid var(--background-modifier-border)",
              borderRadius: "12px",
              fontSize: "11px",
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div
        style={{
          height: "300px",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          padding: "12px",
          background: "var(--background-primary)",
          borderRadius: "8px",
          marginBottom: SPACE.sm,
        }}
      >
        {messages.map((message) => (
          <div
            key={message.id}
            style={{
              display: "flex",
              gap: "8px",
              alignItems: "flex-start",
              flexDirection: message.role === "user" ? "row-reverse" : "row",
            }}
          >
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                background: message.role === "user" ? "var(--interactive-accent)" : "var(--background-secondary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {message.role === "user" ? <User size={14} /> : <Bot size={14} />}
            </div>
            <div
              style={{
                maxWidth: "80%",
                padding: "10px 12px",
                background: message.role === "user" ? "var(--interactive-accent)" : "var(--background-secondary)",
                color: message.role === "user" ? "var(--text-on-accent)" : "var(--text-normal)",
                borderRadius: "12px",
                fontSize: "13px",
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
              }}
            >
              {message.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                background: "var(--background-secondary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Bot size={14} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--text-muted)", fontSize: "12px" }}>
              <Loader2 size={14} className="spinning" />
              思考中...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{ display: "flex", gap: "8px" }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="输入问题..."
          disabled={isLoading}
          style={{
            flex: 1,
            padding: "10px 12px",
            border: "1px solid var(--background-modifier-border)",
            borderRadius: "8px",
            background: "var(--background-primary)",
            color: "var(--text-normal)",
            fontSize: "13px",
          }}
        />
        <InteractiveButton
          interaction="text"
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          style={{
            padding: "10px 14px",
            background: "var(--interactive-accent)",
            color: "var(--text-on-accent)",
            borderRadius: "8px",
            opacity: !input.trim() || isLoading ? 0.6 : 1,
          }}
        >
          <Send size={16} />
        </InteractiveButton>
      </div>

      {/* Settings hint */}
      <div style={{ marginTop: "8px", fontSize: "11px", color: "var(--text-muted)", textAlign: "center" }}>
        AI 配置: {settings.ai.apiEndpoint ? settings.ai.apiEndpoint : "未配置 (使用模拟回复)"}
      </div>
    </GlassPanel>
  );
};
