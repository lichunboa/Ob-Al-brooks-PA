import type { TradeRecord } from "./contracts";

export type Unsubscribe = () => void;

export interface TradeIndex {
	getAll(): TradeRecord[];
	onChanged(handler: () => void): Unsubscribe;
	dispose(): void;
}
