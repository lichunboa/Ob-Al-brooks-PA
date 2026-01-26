import * as React from "react";
import { useBackendConnection, useSignals } from "../../../hooks/useBackendData";
import { BackendSettings } from "../../../settings";
import { SignalData } from "../../../services/backend-client";
import { Notice } from "obsidian";

interface SignalTickerProps {
    settings: BackendSettings;
    onSignalClick?: (signal: SignalData) => void;
}

export const SignalTicker: React.FC<SignalTickerProps> = ({ settings, onSignalClick }) => {
    // Only connect/fetch if enabled
    const { isConnected } = useBackendConnection(settings);
    const { signals, fetchAllSignals } = useSignals(settings);

    // Auto-refresh signals every 10 seconds if connected
    React.useEffect(() => {
        if (!settings.enabled || !isConnected) return;

        fetchAllSignals(20); // Get last 20 signals

        // Set up polling interval independent of global refresh
        const intervalId = setInterval(() => {
            fetchAllSignals(20);
        }, 10000); // 10s refresh for signals

        return () => clearInterval(intervalId);
    }, [settings.enabled, isConnected, fetchAllSignals]);

    const signalList = (signals.data as any)?.signals || Array.isArray(signals.data) ? signals.data : [];

    if (!settings.enabled || !isConnected || signalList.length === 0) {
        return null; // Don't show if nothing to show
    }

    return (
        <div style={{
            display: "flex",
            alignItems: "center",
            background: "var(--background-secondary-alt)",
            borderBottom: "1px solid var(--background-modifier-border)",
            padding: "4px 16px",
            fontSize: "0.80em",
            overflow: "hidden",
            whiteSpace: "nowrap",
            height: "28px"
        }}>
            <div style={{
                marginRight: "10px",
                fontWeight: "bold",
                color: "var(--text-muted)",
                display: "flex",
                alignItems: "center",
                gap: "4px"
            }}>
                <span>📡</span>
                <span>信号:</span>
            </div>

            <div className="signal-marquee" style={{
                display: "flex",
                gap: "24px",
                animation: "none" // complex marquee animation omitted for simplicity, just scroll
            }}>
                {(signalList as SignalData[]).slice(0, 5).map((signal: SignalData, idx: number) => (
                    <div
                        key={`${signal.symbol}-${signal.timestamp}-${idx}`}
                        onClick={() => onSignalClick?.(signal)}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            cursor: "pointer",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            background: "var(--background-primary)",
                            border: "1px solid var(--background-modifier-border)"
                        }}
                    >
                        <span style={{ fontWeight: 600 }}>{signal.symbol}</span>
                        <span style={{
                            color: signal.direction === "BUY" ? "var(--color-green)" :
                                signal.direction === "SELL" ? "var(--color-red)" : "var(--color-yellow)"
                        }}>
                            {signal.direction === "BUY" ? "🟢" : signal.direction === "SELL" ? "🔴" : "🟡"}
                        </span>
                        <span>{signal.signal_name}</span>
                        <span style={{ opacity: 0.7 }}>{new Date(signal.timestamp).toLocaleTimeString()}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};
