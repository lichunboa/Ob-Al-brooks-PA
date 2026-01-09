import * as React from "react";
import { Button } from "../../../ui/components/Button";

/**
 * 数据统计面板组件
 * 显示Ticker/Setup/Exec分布和标签全景
 */

interface DataStatisticsPanelProps {
    // 数据Props
    distTicker: [string, number][];
    distSetup: [string, number][];
    distExec: [string, number][];
    topTags: [string, number][];
    paTagSnapshot: any;

    // 函数Props
    openGlobalSearch: (query: string) => void;
    onTextBtnMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => void;
    onTextBtnMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => void;
    onTextBtnFocus: (e: React.FocusEvent<HTMLButtonElement>) => void;
    onTextBtnBlur: (e: React.FocusEvent<HTMLButtonElement>) => void;

    // 样式Props
    SPACE: any;
}

export const DataStatisticsPanel: React.FC<DataStatisticsPanelProps> = ({
    distTicker,
    distSetup,
    distExec,
    topTags,
    paTagSnapshot,
    openGlobalSearch,
    onTextBtnMouseEnter,
    onTextBtnMouseLeave,
    onTextBtnFocus,
    onTextBtnBlur,
    SPACE,
}) => {
    return (
        <div
            style={{
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "8px",
                padding: "10px",
                background: "rgba(var(--mono-rgb-100), 0.03)",
                marginBottom: "12px",
            }}
        >
            <details>
                <summary
                    style={{
                        cursor: "pointer",
                        fontWeight: 800,
                        listStyle: "none",
                    }}
                >
                    📊 分布摘要（可展开）
                    <span
                        style={{
                            marginLeft: "10px",
                            color: "var(--text-faint)",
                            fontSize: "0.9em",
                            fontWeight: 600,
                        }}
                    >
                        完整图像建议看 Schema
                    </span>
                </summary>

                <div style={{ marginTop: "10px" }}>
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr 1fr",
                            gap: "10px",
                            marginBottom: "10px",
                        }}
                    >
                        {[
                            { title: "Ticker", data: distTicker },
                            { title: "Setup", data: distSetup },
                            { title: "Exec", data: distExec },
                        ].map((col) => (
                            <div
                                key={col.title}
                                style={{
                                    border: "1px solid var(--background-modifier-border)",
                                    borderRadius: "10px",
                                    padding: "10px",
                                    background: "var(--background-primary)",
                                }}
                            >
                                <div
                                    style={{
                                        fontWeight: 700,
                                        marginBottom: "8px",
                                        color: "var(--text-muted)",
                                    }}
                                >
                                    {col.title}
                                </div>
                                {col.data.length === 0 ? (
                                    <div
                                        style={{
                                            color: "var(--text-faint)",
                                            fontSize: "0.85em",
                                        }}
                                    >
                                        无数据
                                    </div>
                                ) : (
                                    <div style={{ display: "grid", gap: "6px" }}>
                                        {col.data.map(([k, v]) => (
                                            <div
                                                key={k}
                                                style={{
                                                    display: "flex",
                                                    justifyContent: "space-between",
                                                    gap: "10px",
                                                    fontSize: "0.9em",
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        color: "var(--text-normal)",
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        whiteSpace: "nowrap",
                                                    }}
                                                    title={k}
                                                >
                                                    {k}
                                                </div>
                                                <div
                                                    style={{
                                                        color: "var(--text-muted)",
                                                        fontVariantNumeric: "tabular-nums",
                                                    }}
                                                >
                                                    {v}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    <div
                        style={{
                            border: "1px solid var(--background-modifier-border)",
                            borderRadius: "10px",
                            padding: "10px",
                            background: "var(--background-primary)",
                        }}
                    >
                        <div style={{ fontWeight: 800, marginBottom: "8px" }}>
                            🏷️ 标签全景（Tag System）
                        </div>
                        {!paTagSnapshot ? (
                            <div
                                style={{
                                    color: "var(--text-faint)",
                                    fontSize: "0.9em",
                                }}
                            >
                                标签扫描不可用。
                            </div>
                        ) : (
                            <div
                                style={{
                                    display: "flex",
                                    flexWrap: "wrap",
                                    gap: "6px",
                                }}
                            >
                                {topTags.map(([tag, count]) => (
                                    <Button
                                        key={tag}
                                        variant="text"
                                        onClick={() => openGlobalSearch(`tag:${tag}`)}
                                        onMouseEnter={onTextBtnMouseEnter}
                                        onMouseLeave={onTextBtnMouseLeave}
                                        onFocus={onTextBtnFocus}
                                        onBlur={onTextBtnBlur}
                                        style={{
                                            padding: "2px 8px",
                                            borderRadius: "999px",
                                            border: "1px solid var(--background-modifier-border)",
                                            background: "var(--background-primary)",
                                            fontSize: "0.85em",
                                            color: "var(--text-muted)",
                                        }}
                                    >
                                        #{tag} ({count})
                                    </Button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </details>
        </div>
    );
};
