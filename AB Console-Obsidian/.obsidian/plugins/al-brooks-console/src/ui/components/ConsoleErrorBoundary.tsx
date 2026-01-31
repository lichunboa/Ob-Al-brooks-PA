import * as React from "react";

export class ConsoleErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { hasError: boolean; message?: string }
> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: unknown) {
        return {
            hasError: true,
            message: error instanceof Error ? error.message : String(error),
        };
    }

    componentDidCatch(error: unknown) {
        console.warn("[al-brooks-console] Dashboard render error", error);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div
                    style={{
                        padding: "16px",
                        fontFamily: "var(--font-interface)",
                        maxWidth: "1200px",
                        margin: "0 auto",
                    }}
                >
                    <h2
                        style={{
                            borderBottom: "1px solid var(--background-modifier-border)",
                            paddingBottom: "10px",
                            marginBottom: "12px",
                        }}
                    >
                        🦁 交易员控制台
                    </h2>
                    <div style={{ color: "var(--text-error)", marginBottom: "8px" }}>
                        控制台渲染失败：{this.state.message ?? "未知错误"}
                    </div>
                    <div style={{ color: "var(--text-muted)" }}>
                        建议重新打开视图后，在顶部使用“重建索引”。
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
