import * as React from "react";
import { Button } from "../../../ui/components/Button";

interface TiltAlertModalProps {
    streak: number;
    onClose: () => void;
    onOpenChecklist?: () => void;
}

export const TiltAlertModal: React.FC<TiltAlertModalProps> = ({ streak, onClose, onOpenChecklist }) => {
    const [secondsLeft, setSecondsLeft] = React.useState(5);

    React.useEffect(() => {
        if (secondsLeft <= 0) return;
        const timer = setInterval(() => {
            setSecondsLeft((prev) => prev - 1);
        }, 1000);
        return () => clearInterval(timer);
    }, [secondsLeft]);

    return (
        <div style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.85)",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backdropFilter: "blur(5px)",
            animation: "fadeIn 0.3s ease-in-out"
        }}>
            <div style={{
                background: "var(--background-primary)",
                border: "2px solid var(--text-error)",
                padding: "32px",
                borderRadius: "16px",
                maxWidth: "400px",
                width: "90%",
                textAlign: "center",
                boxShadow: "0 0 50px rgba(255, 0, 0, 0.3)"
            }}>
                <div style={{ fontSize: "48px", marginBottom: "16px", color: "var(--text-error)" }}>
                    🛑
                </div>
                <h2 style={{ color: "var(--text-error)", fontSize: "24px", margin: "0 0 16px 0", fontWeight: "800" }}>
                    STOP TRADING
                </h2>
                <p style={{ fontSize: "16px", marginBottom: "24px", color: "var(--text-normal)" }}>
                    You have verified <span style={{ fontWeight: "bold", color: "var(--text-error)" }}>{streak} consecutive losses</span>.
                    <br />
                    Your probability of winning the next trade is significantly reduced due to emotional displacement.
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <Button
                        variant="default"
                        onClick={onOpenChecklist}
                        style={{ width: "100%", justifyContent: "center", fontSize: "16px", padding: "12px", backgroundColor: "var(--text-error)", color: "white" }}
                    >
                        📋 Open Psychology Checklist
                    </Button>

                    <Button
                        variant="default"
                        onClick={onClose}
                        disabled={secondsLeft > 0}
                        style={{
                            width: "100%",
                            justifyContent: "center",
                            opacity: secondsLeft > 0 ? 0.5 : 1
                        }}
                    >
                        {secondsLeft > 0 ? `Wait ${secondsLeft}s...` : "I Have Calmed Down"}
                    </Button>
                </div>
            </div>
        </div>
    );
};
