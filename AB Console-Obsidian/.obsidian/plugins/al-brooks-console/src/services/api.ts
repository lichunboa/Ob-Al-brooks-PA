
import { Notice, requestUrl, RequestUrlParam } from "obsidian";
import { BackendSettings } from "../settings";

export interface CandleData {
    symbol: string;
    interval: string;
    open_time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    quote_volume: number;
}

export class BackendV2Client {
    constructor(private settings: BackendSettings) { }

    private get headers() {
        return {
            "Content-Type": "application/json",
            "x-api-token": this.settings.apiToken,
        };
    }

    async checkHealth(): Promise<boolean> {
        try {
            const resp = await requestUrl({
                url: `${this.settings.baseUrl}/health`,
                method: "GET",
                headers: this.headers,
            });
            return resp.status === 200;
        } catch (e) {
            console.warn("Backend health check failed:", e);
            return false;
        }
    }

    async getCandles(symbol: string, interval: string = "1m", limit: number = 100): Promise<CandleData[]> {
        try {
            const url = `${this.settings.baseUrl}/api/v1/candles/${symbol}?interval=${interval}&limit=${limit}`;
            const resp = await requestUrl({
                url,
                method: "GET",
                headers: this.headers,
            });

            if (resp.status !== 200) {
                throw new Error(`API Error ${resp.status}: ${resp.text}`);
            }

            return resp.json as CandleData[];
        } catch (e) {
            console.error("Failed to fetch candles:", e);
            new Notice(`Failed to fetch market data: ${e.message}`);
            return [];
        }
    }
}
