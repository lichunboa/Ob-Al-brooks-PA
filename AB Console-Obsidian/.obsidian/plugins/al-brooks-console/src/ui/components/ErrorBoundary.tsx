import * as React from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
    children: React.ReactNode;
    fallback?: React.ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error("ErrorBoundary caught an error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;

            return (
                <div style={{
                    padding: 16,
                    border: "1px solid var(--text-error)",
                    borderRadius: 8,
                    background: "rgba(var(--text-error-rgb), 0.1)",
                    color: "var(--text-error)"
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: "bold", marginBottom: 8 }}>
                        <AlertTriangle size={16} />
                        <span>组件渲染错误</span>
                    </div>
                    <div style={{ fontSize: "0.85em", opacity: 0.8 }}>
                        {this.state.error?.message || "未知错误"}
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
