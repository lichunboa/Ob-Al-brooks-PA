/**
 * 图表数据缓存服务
 * 
 * 设计原则：
 * 1. 本地缓存优先 - 减少网络请求
 * 2. 增量更新 - 只拉取缺失的数据
 * 3. 分级存储 - 不同周期独立缓存
 * 4. 自动对齐 - 打开应用时自动更新到最新
 */

const DB_NAME = "al-brooks-chart-cache";
const DB_VERSION = 1;
const STORE_NAME = "candles";

// 各周期保留的最大数量
const MAX_CANDLES: Record<string, number> = {
  "1m": 500,    // 约8小时
  "5m": 300,    // 约25小时
  "15m": 250,   // 约2.6天
  "1h": 200,    // 约8天
  "4h": 150,    // 约25天
  "1d": 150,    // 约5个月
};

// 各周期的刷新间隔（毫秒）
const REFRESH_INTERVAL: Record<string, number> = {
  "1m": 5000,   // 5秒
  "5m": 10000,  // 10秒
  "15m": 15000, // 15秒
  "1h": 30000,  // 30秒
  "4h": 60000,  // 1分钟
  "1d": 300000, // 5分钟
};

interface CachedCandle {
  symbol: string;
  interval: string;
  time: number;      // 秒级时间戳
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface CacheMetadata {
  symbol: string;
  interval: string;
  lastUpdate: number;    // 最后更新时间
  oldestTime: number;    // 最老的蜡烛时间
  newestTime: number;    // 最新的蜡烛时间
  count: number;         // 当前数量
}

class ChartDataCache {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  private memoryCache: Map<string, CachedCandle[]> = new Map();
  private metadataCache: Map<string, CacheMetadata> = new Map();

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    
    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("symbol_interval", ["symbol", "interval"], { unique: false });
          store.createIndex("time", "time", { unique: false });
        }
      };
    });

    return this.initPromise;
  }

  private getCacheKey(symbol: string, interval: string): string {
    return `${symbol}_${interval}`;
  }

  private generateId(symbol: string, interval: string, time: number): string {
    return `${symbol}_${interval}_${time}`;
  }

  /**
   * 从缓存获取数据
   */
  async getCandles(symbol: string, interval: string): Promise<CachedCandle[]> {
    await this.init();
    const key = this.getCacheKey(symbol, interval);

    // 优先从内存缓存获取
    if (this.memoryCache.has(key)) {
      return this.memoryCache.get(key)!;
    }

    // 从 IndexedDB 获取
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve([]);
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index("symbol_interval");
      const request = index.getAll(IDBKeyRange.only([symbol, interval]));

      request.onsuccess = () => {
        const candles = request.result
          .map(r => ({
            symbol: r.symbol,
            interval: r.interval,
            time: r.time,
            open: r.open,
            high: r.high,
            low: r.low,
            close: r.close,
            volume: r.volume,
          }))
          .sort((a, b) => a.time - b.time);

        // 存入内存缓存
        this.memoryCache.set(key, candles);
        resolve(candles);
      };

      request.onerror = () => {
        console.error("[ChartCache] Failed to get candles:", request.error);
        resolve([]);
      };
    });
  }

  /**
   * 保存数据到缓存（自动去重和截断）
   */
  async saveCandles(
    symbol: string, 
    interval: string, 
    newCandles: CachedCandle[]
  ): Promise<void> {
    await this.init();
    const key = this.getCacheKey(symbol, interval);
    const maxCount = MAX_CANDLES[interval] || 200;

    // 获取现有数据
    const existing = this.memoryCache.get(key) || [];
    
    // 合并并去重（以时间戳为key）
    const mergedMap = new Map<number, CachedCandle>();
    
    // 先加入现有数据
    for (const c of existing) {
      mergedMap.set(c.time, c);
    }
    
    // 更新/添加新数据
    for (const c of newCandles) {
      mergedMap.set(c.time, { ...c, symbol, interval });
    }

    // 转换为数组并排序
    let merged = Array.from(mergedMap.values()).sort((a, b) => a.time - b.time);

    // 截断：保留最新的 N 根
    if (merged.length > maxCount) {
      merged = merged.slice(-maxCount);
    }

    // 更新内存缓存
    this.memoryCache.set(key, merged);

    // 异步保存到 IndexedDB
    this.persistToDB(symbol, interval, merged);
  }

  private async persistToDB(
    symbol: string, 
    interval: string, 
    candles: CachedCandle[]
  ): Promise<void> {
    if (!this.db) return;

    const transaction = this.db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    // 先删除该品种周期的旧数据
    const index = store.index("symbol_interval");
    const deleteRequest = index.openCursor(IDBKeyRange.only([symbol, interval]));

    deleteRequest.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    // 插入新数据
    for (const candle of candles) {
      store.put({
        id: this.generateId(symbol, interval, candle.time),
        symbol,
        interval,
        time: candle.time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      });
    }

    // 更新元数据
    if (candles.length > 0) {
      const metadata: CacheMetadata = {
        symbol,
        interval,
        lastUpdate: Date.now(),
        oldestTime: candles[0].time,
        newestTime: candles[candles.length - 1].time,
        count: candles.length,
      };
      this.metadataCache.set(this.getCacheKey(symbol, interval), metadata);
    }
  }

  /**
   * 检查是否需要刷新数据
   */
  shouldRefresh(symbol: string, interval: string): boolean {
    const key = this.getCacheKey(symbol, interval);
    const metadata = this.metadataCache.get(key);
    
    if (!metadata) return true;

    const intervalMs = REFRESH_INTERVAL[interval] || 30000;
    return Date.now() - metadata.lastUpdate > intervalMs;
  }

  /**
   * 获取建议的拉取范围（增量更新）
   */
  getFetchRange(symbol: string, interval: string): { 
    needFullFetch: boolean; 
    since?: number;
    limit: number;
  } {
    const key = this.getCacheKey(symbol, interval);
    const metadata = this.metadataCache.get(key);
    const candles = this.memoryCache.get(key);

    // 如果没有缓存，需要全量拉取
    if (!metadata || !candles || candles.length === 0) {
      return { needFullFetch: true, limit: MAX_CANDLES[interval] || 200 };
    }

    // 检查是否需要更新（最新的蜡烛是否已收盘）
    const newestCandle = candles[candles.length - 1];
    const now = Math.floor(Date.now() / 1000);
    const candleDuration = this.getCandleDuration(interval);
    
    // 如果最新的蜡烛已经收盘，或者距离现在超过1个周期，需要拉取新数据
    if (now - newestCandle.time > candleDuration) {
      return { 
        needFullFetch: false, 
        since: newestCandle.time,
        limit: 100 // 增量拉取最近100根
      };
    }

    // 数据还新鲜，不需要拉取
    return { needFullFetch: false, limit: 0 };
  }

  private getCandleDuration(interval: string): number {
    const durationMap: Record<string, number> = {
      "1m": 60,
      "5m": 300,
      "15m": 900,
      "1h": 3600,
      "4h": 14400,
      "1d": 86400,
    };
    return durationMap[interval] || 300;
  }

  /**
   * 清空所有缓存
   */
  async clearAll(): Promise<void> {
    this.memoryCache.clear();
    this.metadataCache.clear();

    if (!this.db) return;

    const transaction = this.db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.clear();
  }

  /**
   * 获取缓存统计
   */
  getStats(): { totalSymbols: number; totalMemory: number } {
    let totalMemory = 0;
    for (const candles of this.memoryCache.values()) {
      totalMemory += candles.length * 56; // 估算每根蜡烛56字节
    }

    return {
      totalSymbols: this.memoryCache.size,
      totalMemory,
    };
  }
}

export const chartDataCache = new ChartDataCache();
export type { CachedCandle, CacheMetadata };
