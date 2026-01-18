import * as React from "react";
import { Button } from "../../../ui/components/Button";

/**
 * DailyActionsPanel Props接口
 */
export interface DailyActionsPanelProps {
    // 功能检查
    can: (feature: string) => boolean;

    // 组件
    MarkdownBlock: React.FC<{ markdown: string; sourcePath?: string }>;
}

// 任务卡片内容配置
const taskContents: Record<string, string> = {
    inbox: `**❓ 疑难杂症 (Questions)**

\`\`\`tasks
not done
tag includes #task/question
path does not include Templates
hide backlink
short mode
\`\`\`

**🚨 紧急事项 (Urgent)**

\`\`\`tasks
not done
tag includes #task/urgent
path does not include Templates
hide backlink
short mode
\`\`\`
`,
    improve: `**🧪 回测任务 (Backtest)**

\`\`\`tasks
not done
tag includes #task/backtest
path does not include Templates
hide backlink
short mode
\`\`\`

**📝 复盘任务 (Review)**

\`\`\`tasks
not done
tag includes #task/review
path does not include Templates
hide backlink
short mode
\`\`\`

**📖 待学习/阅读 (Study)**

\`\`\`tasks
not done
(tag includes #task/study) OR (tag includes #task/read) OR (tag includes #task/watch)
path does not include Templates
limit 5
hide backlink
short mode
\`\`\`

**🔬 待验证想法 (Verify)**

\`\`\`tasks
not done
tag includes #task/verify
path does not include Templates
hide backlink
short mode
\`\`\`
`,
    routine: `**📝 手动打卡 (Checklist)**

- [ ] ☀️ **盘前**:阅读新闻,标记关键位 (S/R Levels) 🔁 every day
- [ ] 🧘 **盘中**:每小时检查一次情绪 (FOMO Check) 🔁 every day
- [ ] 🌙 **盘后**:填写当日 \`复盘日记\` 🔁 every day

**🧹 杂项待办 (To-Do)**

\`\`\`tasks
not done
tag includes #task/todo
path does not include Templates
hide backlink
short mode
limit 5
\`\`\`
`,
    waiting: `**🖨️ 待打印 (Print Queue)**

\`\`\`tasks
not done
tag includes #task/print
path does not include Templates
hide backlink
short mode
\`\`\`

**📂 待整理 (Organize)**

\`\`\`tasks
not done
tag includes #task/organize
path does not include Templates
hide backlink
short mode
\`\`\`
`,
};

// 任务类别配置
const taskCategories = [
    { key: "inbox", icon: "🔥", label: "必须解决", sublabel: "Inbox" },
    { key: "improve", icon: "🛠️", label: "持续改进", sublabel: "Improve" },
    { key: "routine", icon: "📅", label: "每日例行", sublabel: "Routine" },
    { key: "waiting", icon: "⏳", label: "等待任务", sublabel: "Wait" },
];

/**
 * 每日行动面板组件
 * 显示4个任务类别:必须解决、持续改进、每日例行、等待任务
 * 默认折叠，点击展开
 */
export const DailyActionsPanel: React.FC<DailyActionsPanelProps> = ({
    can,
    MarkdownBlock,
}) => {
    // 控制每个类别的展开状态，默认全部折叠
    const [expandedCategories, setExpandedCategories] = React.useState<Set<string>>(new Set());

    const toggleCategory = (key: string) => {
        setExpandedCategories(prev => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    };

    return (
        <>
            {/* 标题栏 */}
            <div
                style={{
                    margin: "18px 0 10px",
                    paddingBottom: "8px",
                    borderBottom: "1px solid var(--background-modifier-border)",
                    display: "flex",
                    alignItems: "baseline",
                    gap: "10px",
                }}
            >
                <div style={{ fontWeight: 700 }}>✅ 每日行动</div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>Actions</div>
            </div>

            {/* Tasks 插件不可用提示 */}
            {!can("tasks:open") && (
                <div style={{ color: "var(--text-faint)", fontSize: "0.9em", marginBottom: "12px" }}>
                    v5.0 在控制台内联展示 Tasks 查询块;当前未检测到 Tasks 集成可用。
                </div>
            )}

            {/* 2x2 可折叠网格 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "16px" }}>
                {taskCategories.map(cat => {
                    const isExpanded = expandedCategories.has(cat.key);
                    return (
                        <div
                            key={cat.key}
                            style={{
                                border: "1px solid var(--background-modifier-border)",
                                borderRadius: "8px",
                                overflow: "hidden",
                                background: "rgba(var(--mono-rgb-100), 0.03)",
                            }}
                        >
                            {/* 可点击头部 */}
                            <div
                                onClick={() => toggleCategory(cat.key)}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    padding: "8px 10px",
                                    cursor: "pointer",
                                    userSelect: "none",
                                    transition: "background 0.15s ease",
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(var(--mono-rgb-100), 0.06)")}
                                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                            >
                                <span>{cat.icon}</span>
                                <span style={{ fontWeight: 600, flex: 1, fontSize: "0.9em" }}>{cat.label}</span>
                                <span style={{ color: "var(--text-muted)", fontSize: "0.75em" }}>{cat.sublabel}</span>
                                <span style={{
                                    transform: isExpanded ? "rotate(180deg)" : "rotate(0)",
                                    transition: "transform 0.2s ease",
                                    fontSize: "0.7em",
                                    color: "var(--text-muted)"
                                }}>▼</span>
                            </div>

                            {/* 展开内容 */}
                            {isExpanded && (
                                <div style={{
                                    padding: "6px 10px 10px",
                                    borderTop: "1px solid var(--background-modifier-border)",
                                    maxHeight: "300px",
                                    overflow: "auto"
                                }}>
                                    <MarkdownBlock markdown={taskContents[cat.key] || ""} />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </>
    );
};
