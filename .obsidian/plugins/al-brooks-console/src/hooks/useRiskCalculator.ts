import { useMemo } from 'react';

interface RiskCalculatorInputs {
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    direction: string; // "Long" | "Short" | "做多" | "做空" etc.
}

export interface RiskStats {
    risk: number | null;
    reward: number | null;
    rRequest: number | null;
    isValid: boolean;
    displayColor: string;
}

export const useRiskCalculator = (inputs: RiskCalculatorInputs): RiskStats => {
    return useMemo(() => {
        const { entryPrice, stopLoss, takeProfit, direction } = inputs;

        if (!entryPrice || !stopLoss) {
            return {
                risk: null,
                reward: null,
                rRequest: null,
                isValid: false,
                displayColor: "var(--text-muted)"
            };
        }

        const isLong = direction?.toLowerCase().includes("long") || direction?.includes("多");
        const isShort = direction?.toLowerCase().includes("short") || direction?.includes("空");

        // Simple absolute diff, direction mostly for sanity check if needed, 
        // but absolute math works for R value regardless of direction usually 
        // (Risk is always Entry->Stop gap).

        let risk = Math.abs(entryPrice - stopLoss);

        // Avoid almost-zero risk division
        if (risk < 0.000001) {
            return {
                risk: 0,
                reward: null as number | null,
                rRequest: null as number | null,
                isValid: false,
                displayColor: "var(--text-muted)"
            };
        }

        let reward: number | null = null;
        let rRequest: number | null = null;

        if (takeProfit) {
            reward = Math.abs(takeProfit - entryPrice);
            rRequest = reward / risk;
        }

        // Color Logic
        let displayColor = "var(--text-muted)";
        if (rRequest !== null) {
            if (rRequest >= 2.0) {
                displayColor = "var(--text-success)"; // Green
            } else if (rRequest >= 1.0) {
                displayColor = "var(--text-warning)"; // Yellow/Orange
            } else {
                displayColor = "var(--text-error)"; // Red
            }
        }

        return {
            risk,
            reward,
            rRequest,
            isValid: true,
            displayColor
        };

    }, [inputs.entryPrice, inputs.stopLoss, inputs.takeProfit, inputs.direction]);
};
