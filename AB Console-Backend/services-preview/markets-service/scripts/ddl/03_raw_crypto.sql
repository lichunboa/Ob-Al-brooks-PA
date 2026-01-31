-- ============================================================
-- TradeCat 全市场数据库 DDL - Part 3: Raw Schema (时序数据)
-- ============================================================

-- ============================================================
-- raw.crypto_kline_1m - 加密货币 K线 (最小粒度 1分钟)
-- 保留策略: 6个月热数据，之后冷存
-- 命名规范: {market}_{datatype}_{timeframe}
-- ============================================================
CREATE TABLE IF NOT EXISTS raw.crypto_kline_1m (
    exchange                TEXT NOT NULL,
    symbol                  TEXT NOT NULL,
    open_time               TIMESTAMPTZ NOT NULL,
    close_time              TIMESTAMPTZ,
    open                    NUMERIC(38,18) NOT NULL,
    high                    NUMERIC(38,18) NOT NULL,
    low                     NUMERIC(38,18) NOT NULL,
    close                   NUMERIC(38,18) NOT NULL,
    volume                  NUMERIC(38,18) NOT NULL,
    quote_volume            NUMERIC(38,18),
    trades                  BIGINT,
    taker_buy_volume        NUMERIC(38,18),
    taker_buy_quote_volume  NUMERIC(38,18),
    is_closed               BOOLEAN NOT NULL DEFAULT FALSE,
    -- 血缘字段
    source                  TEXT NOT NULL DEFAULT 'binance_ws',
    ingest_batch_id         BIGINT NOT NULL,
    source_event_time       TIMESTAMPTZ,
    ingested_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    PRIMARY KEY (exchange, symbol, open_time)
);

SELECT create_hypertable('raw.crypto_kline_1m', 'open_time',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

CREATE INDEX idx_crypto_kline_symbol_time ON raw.crypto_kline_1m (symbol, open_time DESC);
CREATE INDEX idx_crypto_kline_time ON raw.crypto_kline_1m (open_time DESC);
CREATE INDEX idx_crypto_kline_batch ON raw.crypto_kline_1m (ingest_batch_id);

-- 压缩策略: 7天后压缩
SELECT add_compression_policy('raw.crypto_kline_1m', INTERVAL '7 days', if_not_exists => TRUE);
ALTER TABLE raw.crypto_kline_1m SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'exchange, symbol',
    timescaledb.compress_orderby = 'open_time DESC'
);

-- 保留策略: 6个月 (冷存迁移预留，暂不自动删除)
-- SELECT add_retention_policy('raw.crypto_kline_1m', INTERVAL '6 months', if_not_exists => TRUE);

COMMENT ON TABLE raw.crypto_kline_1m IS '加密货币1分钟K线 (chunk=1d, compress=7d, retain=6m)';

-- ============================================================
-- raw.trades - 逐笔成交
-- 保留策略: 3个月热数据
-- ============================================================
CREATE TABLE IF NOT EXISTS raw.trades (
    exchange        TEXT NOT NULL,
    symbol          TEXT NOT NULL,
    trade_id        BIGINT NOT NULL,
    timestamp       TIMESTAMPTZ NOT NULL,  -- 毫秒精度
    price           NUMERIC(38,18) NOT NULL,
    quantity        NUMERIC(38,18) NOT NULL,
    side            enum_side NOT NULL,
    is_maker        BOOLEAN,
    -- 血缘字段
    source          TEXT NOT NULL,
    ingest_batch_id BIGINT NOT NULL,
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    UNIQUE (exchange, symbol, trade_id)
);

SELECT create_hypertable('raw.trades', 'timestamp',
    chunk_time_interval => INTERVAL '6 hours',
    if_not_exists => TRUE
);

CREATE INDEX idx_trades_symbol_time ON raw.trades (symbol, timestamp DESC);
CREATE INDEX idx_trades_time ON raw.trades (timestamp DESC);

-- 压缩策略: 1天后压缩
SELECT add_compression_policy('raw.trades', INTERVAL '1 day', if_not_exists => TRUE);
ALTER TABLE raw.trades SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'exchange, symbol',
    timescaledb.compress_orderby = 'timestamp DESC'
);

COMMENT ON TABLE raw.trades IS '逐笔成交 (chunk=6h, compress=1d, retain=3m)';

-- ============================================================
-- raw.orderbook_snapshot - 订单簿快照
-- ============================================================
CREATE TABLE IF NOT EXISTS raw.orderbook_snapshot (
    exchange        TEXT NOT NULL,
    symbol          TEXT NOT NULL,
    timestamp       TIMESTAMPTZ NOT NULL,
    seq_id          BIGINT NOT NULL,
    depth           INT NOT NULL,           -- 档位数
    price_precision INT NOT NULL,
    bids            JSONB NOT NULL,         -- [{p: price, s: size}, ...]
    asks            JSONB NOT NULL,
    -- 血缘字段
    source          TEXT NOT NULL,
    ingest_batch_id BIGINT NOT NULL,
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    UNIQUE (exchange, symbol, seq_id)
);

SELECT create_hypertable('raw.orderbook_snapshot', 'timestamp',
    chunk_time_interval => INTERVAL '6 hours',
    if_not_exists => TRUE
);

CREATE INDEX idx_ob_snap_symbol_time ON raw.orderbook_snapshot (symbol, timestamp DESC);
CREATE INDEX idx_ob_snap_seq ON raw.orderbook_snapshot (symbol, seq_id DESC);

SELECT add_compression_policy('raw.orderbook_snapshot', INTERVAL '1 day', if_not_exists => TRUE);
ALTER TABLE raw.orderbook_snapshot SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'exchange, symbol',
    timescaledb.compress_orderby = 'timestamp DESC'
);

COMMENT ON TABLE raw.orderbook_snapshot IS '订单簿快照 (chunk=6h, compress=1d)';

-- ============================================================
-- raw.orderbook_delta - 订单簿增量
-- ============================================================
CREATE TABLE IF NOT EXISTS raw.orderbook_delta (
    exchange        TEXT NOT NULL,
    symbol          TEXT NOT NULL,
    seq_id          BIGINT NOT NULL,
    prev_seq_id     BIGINT,                 -- 前序 (校验连续性)
    timestamp       TIMESTAMPTZ NOT NULL,
    action          enum_ob_action NOT NULL,
    side            enum_book_side NOT NULL,
    price           NUMERIC(38,18) NOT NULL,
    size            NUMERIC(38,18) NOT NULL, -- delete 时为 0
    -- 血缘字段
    source          TEXT NOT NULL,
    ingest_batch_id BIGINT NOT NULL,
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    UNIQUE (exchange, symbol, seq_id)
);

SELECT create_hypertable('raw.orderbook_delta', 'timestamp',
    chunk_time_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

CREATE INDEX idx_ob_delta_symbol_seq ON raw.orderbook_delta (symbol, seq_id);

SELECT add_compression_policy('raw.orderbook_delta', INTERVAL '6 hours', if_not_exists => TRUE);
ALTER TABLE raw.orderbook_delta SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'exchange, symbol',
    timescaledb.compress_orderby = 'seq_id DESC'
);

COMMENT ON TABLE raw.orderbook_delta IS '订单簿增量 (chunk=1h, compress=6h)';

-- ============================================================
-- raw.crypto_metrics_5m - 加密期货指标 (最小粒度 5分钟)
-- ============================================================
CREATE TABLE IF NOT EXISTS raw.crypto_metrics_5m (
    exchange                TEXT NOT NULL,
    symbol                  TEXT NOT NULL,
    timestamp               TIMESTAMPTZ NOT NULL,
    open_interest           NUMERIC(38,8),
    open_interest_value     NUMERIC(38,8),
    long_short_ratio        NUMERIC(18,8),
    top_long_short_ratio    NUMERIC(18,8),
    taker_buy_sell_ratio    NUMERIC(18,8),
    -- 血缘字段
    source                  TEXT NOT NULL DEFAULT 'binance_api',
    ingest_batch_id         BIGINT NOT NULL,
    ingested_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    PRIMARY KEY (exchange, symbol, timestamp)
);

SELECT create_hypertable('raw.crypto_metrics_5m', 'timestamp',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

CREATE INDEX idx_crypto_metrics_symbol_time ON raw.crypto_metrics_5m (symbol, timestamp DESC);

SELECT add_compression_policy('raw.crypto_metrics_5m', INTERVAL '7 days', if_not_exists => TRUE);

COMMENT ON TABLE raw.crypto_metrics_5m IS '加密期货指标 (OI/多空比)';

-- ============================================================
-- raw.funding_rate - 资金费率
-- ============================================================
CREATE TABLE IF NOT EXISTS raw.funding_rate (
    exchange            TEXT NOT NULL,
    symbol              TEXT NOT NULL,
    funding_time        TIMESTAMPTZ NOT NULL,
    rate                NUMERIC(18,8) NOT NULL,
    next_funding_time   TIMESTAMPTZ,
    -- 血缘字段
    source              TEXT NOT NULL,
    ingest_batch_id     BIGINT NOT NULL,
    ingested_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    PRIMARY KEY (exchange, symbol, funding_time)
);

SELECT create_hypertable('raw.funding_rate', 'funding_time',
    chunk_time_interval => INTERVAL '1 month',
    if_not_exists => TRUE
);

COMMENT ON TABLE raw.funding_rate IS '资金费率历史';

-- ============================================================
-- raw.crypto_order_book_tick - L1 高频 tick (1秒级)
-- 设计原则: 轻量行，仅 top-of-book + 核心指标
-- 主键设计: (exchange, symbol, timestamp) 与 orderbook_snapshot 一致
-- ============================================================
CREATE TABLE IF NOT EXISTS raw.crypto_order_book_tick (
    exchange        TEXT NOT NULL,
    symbol          TEXT NOT NULL,
    timestamp       TIMESTAMPTZ NOT NULL,
    -- 价格指标
    mid_price       NUMERIC(38,18),
    spread_bps      NUMERIC(10,4),
    -- 最优档位
    bid1_price      NUMERIC(38,18),
    bid1_size       NUMERIC(38,18),
    ask1_price      NUMERIC(38,18),
    ask1_size       NUMERIC(38,18),
    -- 快速深度 (1% 内)
    bid_depth_1pct  NUMERIC(38,8),
    ask_depth_1pct  NUMERIC(38,8),
    imbalance       NUMERIC(10,6),
    -- 血缘字段 (与 crypto_kline_1m 一致)
    source          TEXT NOT NULL DEFAULT 'binance_ws',
    ingest_batch_id BIGINT,
    source_event_time TIMESTAMPTZ,
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    PRIMARY KEY (exchange, symbol, timestamp)
);

SELECT create_hypertable('raw.crypto_order_book_tick', 'timestamp',
    chunk_time_interval => INTERVAL '6 hours',
    if_not_exists => TRUE
);

CREATE INDEX idx_crypto_ob_tick_symbol_time ON raw.crypto_order_book_tick (symbol, timestamp DESC);
CREATE INDEX idx_crypto_ob_tick_time ON raw.crypto_order_book_tick (timestamp DESC);
CREATE INDEX idx_crypto_ob_tick_batch ON raw.crypto_order_book_tick (ingest_batch_id);
CREATE INDEX idx_crypto_ob_tick_spread ON raw.crypto_order_book_tick (symbol, spread_bps) 
    WHERE spread_bps IS NOT NULL;
CREATE INDEX idx_crypto_ob_tick_imbalance ON raw.crypto_order_book_tick (symbol, imbalance) 
    WHERE ABS(imbalance) > 0.3;

-- 压缩策略: 6小时后压缩 (高频数据快速压缩)
SELECT add_compression_policy('raw.crypto_order_book_tick', INTERVAL '6 hours', if_not_exists => TRUE);
ALTER TABLE raw.crypto_order_book_tick SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'exchange, symbol',
    timescaledb.compress_orderby = 'timestamp DESC'
);

-- 保留策略: 默认不删除 (可手动启用)
-- SELECT add_retention_policy('raw.crypto_order_book_tick', INTERVAL '7 days', if_not_exists => TRUE);

COMMENT ON TABLE raw.crypto_order_book_tick IS 'L1 tick 层 (1s采样, chunk=6h, compress=6h)';

-- ============================================================
-- raw.crypto_order_book - L2 全量快照 (5秒级)
-- 设计原则: 1行=1快照，关键档位列存 + 完整原始盘口
-- 原始数据结构 (Binance Futures /fapi/v1/depth):
--   lastUpdateId, E (event_time), T (transaction_time)
--   bids: [[price, qty], ...], asks: [[price, qty], ...]
-- ============================================================
CREATE TABLE IF NOT EXISTS raw.crypto_order_book (
    exchange        TEXT NOT NULL,
    symbol          TEXT NOT NULL,
    timestamp       TIMESTAMPTZ NOT NULL,       -- 事件时间 E
    -- 原始元数据 (与 Binance 字段对应)
    last_update_id  BIGINT,                     -- lastUpdateId 序列号
    transaction_time TIMESTAMPTZ,               -- T 交易时间
    depth           INT NOT NULL,               -- 档位数
    -- 预计算指标 (便于快速查询)
    mid_price       NUMERIC(38,18),             -- 中间价 (bid1+ask1)/2
    spread          NUMERIC(38,18),             -- 价差 ask1-bid1
    spread_bps      NUMERIC(10,4),              -- 价差基点 spread/mid*10000
    -- 最优档位 (列存，直接查询)
    bid1_price      NUMERIC(38,18),
    bid1_size       NUMERIC(38,18),
    ask1_price      NUMERIC(38,18),
    ask1_size       NUMERIC(38,18),
    -- 深度统计 (聚合指标)
    bid_depth_1pct  NUMERIC(38,8),              -- 买侧 1% 内深度
    ask_depth_1pct  NUMERIC(38,8),              -- 卖侧 1% 内深度
    bid_depth_5pct  NUMERIC(38,8),              -- 买侧 5% 内深度
    ask_depth_5pct  NUMERIC(38,8),              -- 卖侧 5% 内深度
    bid_notional_1pct NUMERIC(38,8),            -- 买侧 1% 名义价值 (USDT)
    ask_notional_1pct NUMERIC(38,8),            -- 卖侧 1% 名义价值
    bid_notional_5pct NUMERIC(38,8),            -- 买侧 5% 名义价值
    ask_notional_5pct NUMERIC(38,8),            -- 卖侧 5% 名义价值
    imbalance       NUMERIC(10,6),              -- 买卖失衡
    -- 完整原始盘口 (与 Binance 格式一致)
    bids            JSONB NOT NULL,             -- [["price","qty"], ...] 原始字符串格式
    asks            JSONB NOT NULL,             -- [["price","qty"], ...] 原始字符串格式
    -- 血缘字段
    source          TEXT NOT NULL DEFAULT 'binance_ws',
    ingest_batch_id BIGINT,
    source_event_time TIMESTAMPTZ,              -- 原始事件时间 (毫秒精度)
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    PRIMARY KEY (exchange, symbol, timestamp)
);

SELECT create_hypertable('raw.crypto_order_book', 'timestamp',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

CREATE INDEX idx_crypto_ob_symbol_time ON raw.crypto_order_book (symbol, timestamp DESC);
CREATE INDEX idx_crypto_ob_time ON raw.crypto_order_book (timestamp DESC);
CREATE INDEX idx_crypto_ob_batch ON raw.crypto_order_book (ingest_batch_id);
CREATE INDEX idx_crypto_ob_spread ON raw.crypto_order_book (symbol, spread_bps) WHERE spread_bps IS NOT NULL;

-- 压缩策略: 1天后压缩 (订单簿数据量大)
SELECT add_compression_policy('raw.crypto_order_book', INTERVAL '1 day', if_not_exists => TRUE);
ALTER TABLE raw.crypto_order_book SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'exchange, symbol',
    timescaledb.compress_orderby = 'timestamp DESC'
);

-- 保留策略: 30天 (可通过 ORDER_BOOK_RETENTION_DAYS 配置)
-- SELECT add_retention_policy('raw.crypto_order_book', INTERVAL '30 days', if_not_exists => TRUE);

COMMENT ON TABLE raw.crypto_order_book IS '订单簿快照-混合存储 (1行=1快照, chunk=1d, compress=1d)';

-- ============================================================
-- raw.crypto_book_depth - 订单簿百分比深度 (聚合版)
-- 用途: 深度分析、流动性监控
-- ============================================================
CREATE TABLE IF NOT EXISTS raw.crypto_book_depth (
    timestamp       TIMESTAMPTZ NOT NULL,
    exchange        TEXT NOT NULL,
    symbol          TEXT NOT NULL,
    percentage      INT NOT NULL,               -- -5,-4,-3,-2,-1,1,2,3,4,5 (负=买侧)
    depth           NUMERIC(38,18) NOT NULL,    -- 累计数量
    notional        NUMERIC(38,18) NOT NULL,    -- 累计名义价值
    -- 血缘字段
    source          TEXT NOT NULL DEFAULT 'binance_ws',
    ingest_batch_id BIGINT,
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    PRIMARY KEY (exchange, symbol, timestamp, percentage)
);

SELECT create_hypertable('raw.crypto_book_depth', 'timestamp',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

CREATE INDEX idx_crypto_bd_symbol_time ON raw.crypto_book_depth (symbol, timestamp DESC);

SELECT add_compression_policy('raw.crypto_book_depth', INTERVAL '1 day', if_not_exists => TRUE);
ALTER TABLE raw.crypto_book_depth SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'exchange, symbol',
    timescaledb.compress_orderby = 'timestamp DESC'
);

COMMENT ON TABLE raw.crypto_book_depth IS '订单簿百分比深度 (chunk=1d, compress=1d)';

-- ============================================================
-- 连续聚合视图: 订单簿 1 分钟聚合
-- 用途: 快速查询分钟级流动性指标
-- ============================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS agg.order_book_1m
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 minute', timestamp) AS bucket,
    exchange,
    symbol,
    -- 价格统计
    AVG(mid_price) AS avg_mid_price,
    AVG(spread_bps) AS avg_spread_bps,
    MAX(spread_bps) AS max_spread_bps,
    MIN(spread_bps) AS min_spread_bps,
    -- 深度统计
    AVG(bid_depth_1pct) AS avg_bid_depth_1pct,
    AVG(ask_depth_1pct) AS avg_ask_depth_1pct,
    AVG(bid_depth_5pct) AS avg_bid_depth_5pct,
    AVG(ask_depth_5pct) AS avg_ask_depth_5pct,
    -- 名义价值
    AVG(bid_notional_5pct) AS avg_bid_notional_5pct,
    AVG(ask_notional_5pct) AS avg_ask_notional_5pct,
    -- 失衡统计
    AVG(imbalance) AS avg_imbalance,
    MAX(imbalance) AS max_imbalance,
    MIN(imbalance) AS min_imbalance,
    -- 样本数
    COUNT(*) AS sample_count
FROM raw.crypto_order_book
GROUP BY bucket, exchange, symbol
WITH NO DATA;

SELECT add_continuous_aggregate_policy('agg.order_book_1m',
    start_offset => INTERVAL '1 hour',
    end_offset => INTERVAL '1 minute',
    schedule_interval => INTERVAL '1 minute',
    if_not_exists => TRUE
);

COMMENT ON MATERIALIZED VIEW agg.order_book_1m IS '订单簿1分钟聚合 (价差/深度/失衡)';

-- ============================================================
-- 连续聚合视图: 订单簿 1 小时聚合
-- 用途: 长周期流动性分析
-- ============================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS agg.order_book_1h
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', timestamp) AS bucket,
    exchange,
    symbol,
    AVG(mid_price) AS avg_mid_price,
    AVG(spread_bps) AS avg_spread_bps,
    MAX(spread_bps) AS max_spread_bps,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY spread_bps) AS p95_spread_bps,
    AVG(bid_depth_5pct) AS avg_bid_depth_5pct,
    AVG(ask_depth_5pct) AS avg_ask_depth_5pct,
    AVG(bid_notional_5pct + ask_notional_5pct) AS avg_total_liquidity_5pct,
    AVG(imbalance) AS avg_imbalance,
    STDDEV(imbalance) AS std_imbalance,
    COUNT(*) AS sample_count
FROM raw.crypto_order_book
GROUP BY bucket, exchange, symbol
WITH NO DATA;

SELECT add_continuous_aggregate_policy('agg.order_book_1h',
    start_offset => INTERVAL '1 day',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

COMMENT ON MATERIALIZED VIEW agg.order_book_1h IS '订单簿1小时聚合 (含 P95 价差)';
