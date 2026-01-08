import * as React from "react";

/**
 * Schema异常详情面板组件
 * 显示schema验证异常列表
 */

interface SchemaIssuesPanelProps {
    // 数据Props
    schemaIssues: any[];
    issueCount: number;

    // 函数Props
    openFile: (path: string) => void;
    onTextBtnMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => void;
    onTextBtnMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => void;
    onTextBtnFocus: (e: React.FocusEvent<HTMLButtonElement>) => void;
    onTextBtnBlur: (e: React.FocusEvent<HTMLButtonElement>) => void;

    // 样式Props
    V5_COLORS: any;
}

export const SchemaIssuesPanel: React.FC<SchemaIssuesPanelProps> = ({
    schemaIssues,
    issueCount,
    openFile,
    onTextBtnMouseEnter,
    onTextBtnMouseLeave,
    onTextBtnFocus,
    onTextBtnBlur,
    V5_COLORS,
}) => {
    return (
        <div style={{
            border: "1px solid var(--background-modifier-border)",
            borderRadius: "10px",
            padding: "12px",
            background: "var(--background-primary)",
            marginBottom: "10px"
        }}>
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: "10px",
                    marginBottom: "8px",
                }}
            >
                <div style={{ fontWeight: 800 }}>⚠️ 异常详情</div>
                <div
                    style={{
                        color: "var(--text-muted)",
                        fontSize: "0.9em",
                    }}
                >
                    {issueCount}
                </div>
            </div>

            {schemaIssues.length === 0 ? (
                <div
                    style={{
                        color: V5_COLORS.win,
                        fontSize: "0.9em",
                    }}
                >
                    ✅ 无异常
                </div>
            ) : (
                <div
                    style={{
                        maxHeight: "260px",
                        overflow: "auto",
                        border: "1px solid var(--background-modifier-border)",
                        borderRadius: "10px",
                        background: "rgba(var(--mono-rgb-100), 0.03)",
                    }}
                >
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "2fr 1fr 1fr",
                            gap: "10px",
                            padding: "8px",
                            borderBottom: "1px solid var(--background-modifier-border)",
                            color: "var(--text-faint)",
                            fontSize: "0.85em",
                            background: "var(--background-primary)",
                        }}
                    >
                        <div>文件</div>
                        <div>问题</div>
                        <div>字段</div>
                    </div>
                    {schemaIssues.slice(0, 80).map((item, idx) => (
                        <button
                            key={`${item.path}:${item.key}:${idx}`}
                            type="button"
                            onClick={() => openFile(item.path)}
                            title={item.path}
                            onMouseEnter={onTextBtnMouseEnter}
                            onMouseLeave={onTextBtnMouseLeave}
                            onFocus={onTextBtnFocus}
                            onBlur={onTextBtnBlur}
                            style={{
                                width: "100%",
                                textAlign: "left",
                                padding: 0,
                                border: "none",
                                borderBottom: "1px solid var(--background-modifier-border)",
                                background: "transparent",
                                cursor: "pointer",
                                outline: "none",
                            }}
                        >
                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "2fr 1fr 1fr",
                                    gap: "10px",
                                    padding: "10px",
                                    alignItems: "baseline",
                                }}
                            >
                                <div style={{ minWidth: 0 }}>
                                    <div
                                        style={{
                                            fontWeight: 650,
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {item.name}
                                    </div>
                                    <div
                                        style={{
                                            color: "var(--text-faint)",
                                            fontSize: "0.85em",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {item.path}
                                    </div>
                                </div>
                                <div
                                    style={{
                                        color: "var(--text-error)",
                                        fontWeight: 700,
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    {item.type}
                                </div>
                                <div
                                    style={{
                                        color: "var(--text-muted)",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                    }}
                                    title={item.key}
                                >
                                    {item.key}
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};
