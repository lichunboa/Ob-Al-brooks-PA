import type { TradeRecord } from "./contracts";

export type Unsubscribe = () => void;

export type TradeIndexPhase = "idle" | "building" | "ready" | "error";

export interface TradeIndexStatus {
	phase: TradeIndexPhase;
	processed?: number;
	total?: number;
	message?: string;
	lastBuildMs?: number;
}

export interface TradeIndex {
	getAll(): TradeRecord[];
	onChanged(handler: () => void): Unsubscribe;
	getStatus?(): TradeIndexStatus;
	onStatusChanged?(handler: () => void): Unsubscribe;
	rebuild?(): Promise<void>;
	dispose(): void;
}
