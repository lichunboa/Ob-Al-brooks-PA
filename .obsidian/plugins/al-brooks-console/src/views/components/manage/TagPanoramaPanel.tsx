import * as React from "react";
import { Button } from "../../../ui/components/Button";
import { GlassPanel } from "../../../ui/components/GlassPanel";
import { SectionHeader } from "../../../ui/components/SectionHeader";

/**
 * 标签全景面板组件
 * 按 PA 标签体系分类显示所有标签，支持搜索和点击跳转
 */

interface TagPanoramaPanelProps {
    // 标签快照数据：{ tagName: count }
    paTagSnapshot: Record<string, number> | null;
    // 打开全局搜索
    openGlobalSearch: (query: string) => void;
}

// PA 标签体系分类定义
const TAG_CATEGORIES = [
    {
        id: "core",
        name: "📂 核心架构",
        description: "系统地基，控制台读取数据的来源",
        prefixes: ["PA/Daily", "PA/Trade", "PA/Course", "PA/Strategy"],
    },
    {
        id: "collection",
        name: "⭐ 收藏夹",
        description: "主观评价和特殊用途",
        prefixes: ["PA/Textbook", "PA/Print"],
    },
    {
        id: "memory",
        name: "🧠 记忆背诵",
        description: "配合 Spaced Repetition 插件",
        prefixes: ["flashcards", "review"],
    },
    {
        id: "task",
        name: "📓 任务管理",
        description: "配合控制台任务面板",
        prefixes: ["task/todo", "task/urgent", "task/question", "task/study", "task/verify", "task/organize"],
    },
];

export const TagPanoramaPanel: React.FC<TagPanoramaPanelProps> = ({
    paTagSnapshot,
    openGlobalSearch,
}) => {
    const [searchTerm, setSearchTerm] = React.useState("");
    const [expandedCategory, setExpandedCategory] = React.useState<string | null>("core");

    // 将标签按分类组织
    const categorizedTags = React.useMemo(() => {
        if (!paTagSnapshot) return { categories: [], uncategorized: [] };

        const allTags = Object.entries(paTagSnapshot).sort((a, b) => b[1] - a[1]);
        const categorized = new Set<string>();

        const categories = TAG_CATEGORIES.map(cat => {
            const matchedTags = allTags.filter(([tag]) => {
                const matches = cat.prefixes.some(prefix =>
                    tag === prefix || tag.startsWith(`${prefix}/`)
                );
                if (matches) categorized.add(tag);
                return matches;
            });
            return {
                ...cat,
                tags: matchedTags,
                totalCount: matchedTags.reduce((sum, [, count]) => sum + count, 0),
            };
        });

        // 未分类的标签
        const uncategorized = allTags.filter(([tag]) => !categorized.has(tag));

        return { categories, uncategorized };
    }, [paTagSnapshot]);

    // 搜索过滤
    const filteredCategories = React.useMemo(() => {
        if (!searchTerm.trim()) return categorizedTags;

        const term = searchTerm.toLowerCase();
        return {
            categories: categorizedTags.categories.map(cat => ({
                ...cat,
                tags: cat.tags.filter(([tag]) => tag.toLowerCase().includes(term)),
            })).filter(cat => cat.tags.length > 0),
            uncategorized: categorizedTags.uncategorized.filter(([tag]) =>
                tag.toLowerCase().includes(term)
            ),
        };
    }, [categorizedTags, searchTerm]);

    const totalTags = paTagSnapshot ? Object.keys(paTagSnapshot).length : 0;

    return (
        <GlassPanel style={{ marginBottom: "16px" }}>
            <SectionHeader title="标签全景" subtitle="Tag Panorama" icon="🏷️" />

            {/* 搜索框 */}
            <div style={{ marginBottom: "12px" }}>
                <input
                    type="text"
                    placeholder="🔍 搜索标签..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{
                        width: "100%",
                        padding: "8px 12px",
                        border: "1px solid var(--background-modifier-border)",
                        borderRadius: "6px",
                        background: "var(--background-primary)",
                        color: "var(--text-normal)",
                        fontSize: "0.9em",
                    }}
                />
            </div>

            {/* 统计摘要 */}
            <div style={{
                display: "flex",
                gap: "12px",
                marginBottom: "12px",
                fontSize: "0.85em",
                color: "var(--text-muted)",
            }}>
                <span>共 {totalTags} 个标签</span>
                <span>·</span>
                <span>{filteredCategories.categories.length} 个分类</span>
                {filteredCategories.uncategorized.length > 0 && (
                    <>
                        <span>·</span>
                        <span>{filteredCategories.uncategorized.length} 个自定义</span>
                    </>
                )}
            </div>

            {!paTagSnapshot ? (
                <div style={{ color: "var(--text-faint)", fontSize: "0.9em", textAlign: "center", padding: "20px" }}>
                    标签扫描不可用
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {/* PA 标签体系分类 */}
                    {filteredCategories.categories.map(cat => (
                        <div
                            key={cat.id}
                            style={{
                                border: "1px solid var(--background-modifier-border)",
                                borderRadius: "8px",
                                overflow: "hidden",
                            }}
                        >
                            {/* 分类标题 */}
                            <div
                                onClick={() => setExpandedCategory(
                                    expandedCategory === cat.id ? null : cat.id
                                )}
                                style={{
                                    padding: "10px 12px",
                                    background: expandedCategory === cat.id
                                        ? "rgba(96, 165, 250, 0.1)"
                                        : "var(--background-primary)",
                                    cursor: "pointer",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    transition: "background 0.15s",
                                }}
                            >
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: "0.95em" }}>
                                        {cat.name}
                                    </div>
                                    <div style={{ fontSize: "0.8em", color: "var(--text-muted)", marginTop: "2px" }}>
                                        {cat.description}
                                    </div>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <span style={{
                                        fontSize: "0.8em",
                                        padding: "2px 8px",
                                        borderRadius: "4px",
                                        background: "var(--background-modifier-border)",
                                        color: "var(--text-muted)",
                                    }}>
                                        {cat.tags.length} 标签 · {cat.totalCount} 条
                                    </span>
                                    <span style={{ color: "var(--text-faint)" }}>
                                        {expandedCategory === cat.id ? "▼" : "▶"}
                                    </span>
                                </div>
                            </div>

                            {/* 分类内的标签 */}
                            {expandedCategory === cat.id && cat.tags.length > 0 && (
                                <div style={{
                                    padding: "10px 12px",
                                    background: "rgba(var(--mono-rgb-100), 0.02)",
                                    display: "flex",
                                    flexWrap: "wrap",
                                    gap: "6px",
                                }}>
                                    {cat.tags.map(([tag, count]) => (
                                        <Button
                                            key={tag}
                                            variant="text"
                                            onClick={() => openGlobalSearch(`tag:${tag}`)}
                                            style={{
                                                padding: "4px 10px",
                                                borderRadius: "999px",
                                                border: "1px solid var(--background-modifier-border)",
                                                background: "var(--background-primary)",
                                                fontSize: "0.85em",
                                                color: "var(--text-normal)",
                                                cursor: "pointer",
                                                transition: "all 0.15s",
                                            }}
                                        >
                                            #{tag} <span style={{ color: "var(--text-muted)", marginLeft: "4px" }}>({count})</span>
                                        </Button>
                                    ))}
                                </div>
                            )}

                            {expandedCategory === cat.id && cat.tags.length === 0 && (
                                <div style={{
                                    padding: "16px",
                                    textAlign: "center",
                                    color: "var(--text-faint)",
                                    fontSize: "0.85em",
                                }}>
                                    该分类暂无标签
                                </div>
                            )}
                        </div>
                    ))}

                    {/* 自定义标签（未分类） */}
                    {filteredCategories.uncategorized.length > 0 && (
                        <div
                            style={{
                                border: "1px solid var(--background-modifier-border)",
                                borderRadius: "8px",
                                overflow: "hidden",
                            }}
                        >
                            <div
                                onClick={() => setExpandedCategory(
                                    expandedCategory === "other" ? null : "other"
                                )}
                                style={{
                                    padding: "10px 12px",
                                    background: expandedCategory === "other"
                                        ? "rgba(96, 165, 250, 0.1)"
                                        : "var(--background-primary)",
                                    cursor: "pointer",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                }}
                            >
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: "0.95em" }}>
                                        📁 其他标签
                                    </div>
                                    <div style={{ fontSize: "0.8em", color: "var(--text-muted)", marginTop: "2px" }}>
                                        自定义标签
                                    </div>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <span style={{
                                        fontSize: "0.8em",
                                        padding: "2px 8px",
                                        borderRadius: "4px",
                                        background: "var(--background-modifier-border)",
                                        color: "var(--text-muted)",
                                    }}>
                                        {filteredCategories.uncategorized.length} 标签
                                    </span>
                                    <span style={{ color: "var(--text-faint)" }}>
                                        {expandedCategory === "other" ? "▼" : "▶"}
                                    </span>
                                </div>
                            </div>

                            {expandedCategory === "other" && (
                                <div style={{
                                    padding: "10px 12px",
                                    background: "rgba(var(--mono-rgb-100), 0.02)",
                                    display: "flex",
                                    flexWrap: "wrap",
                                    gap: "6px",
                                    maxHeight: "200px",
                                    overflowY: "auto",
                                }}>
                                    {filteredCategories.uncategorized.map(([tag, count]) => (
                                        <Button
                                            key={tag}
                                            variant="text"
                                            onClick={() => openGlobalSearch(`tag:${tag}`)}
                                            style={{
                                                padding: "4px 10px",
                                                borderRadius: "999px",
                                                border: "1px solid var(--background-modifier-border)",
                                                background: "var(--background-primary)",
                                                fontSize: "0.85em",
                                                color: "var(--text-muted)",
                                                cursor: "pointer",
                                            }}
                                        >
                                            #{tag} ({count})
                                        </Button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </GlassPanel>
    );
};
