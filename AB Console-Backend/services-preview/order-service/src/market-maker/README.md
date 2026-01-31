# Market Maker V2 - 完整 Avellaneda-Stoikov 做市系统

基于论文 "High-frequency trading in a limit order book" (Avellaneda & Stoikov, 2008)

## 核心公式

```
保留价格: r = s - q * γ * σ * (T-t)
最优价差: δ = γ * σ * (T-t) + (2/γ) * ln(1 + γ/κ)
```

## 目录结构

```
market-maker-v2/
├── main.py                 # 入口
├── requirements.txt        # 依赖
├── config/
│   └── default.json        # 默认配置
├── src/
│   ├── core/
│   │   ├── config.py       # 配置管理
│   │   ├── engine.py       # 交易引擎
│   │   └── risk.py         # 风控模块
│   └── strategies/
│       └── avellaneda_stoikov.py  # A-S 策略
├── logs/                   # 日志
└── tests/                  # 测试
```

## 快速开始

```bash
# 1. 创建虚拟环境
python3 -m venv .venv
source .venv/bin/activate

# 2. 安装依赖
pip install -r requirements.txt

# 3. 配置 API 密钥
cp config/default.json config/my.json
# 编辑 config/my.json 填入密钥

# 4. 运行
python main.py --config config/my.json
```

## 配置说明

| 参数 | 说明 | 默认值 |
|------|------|--------|
| gamma | 风险厌恶系数 | 0.1 |
| T | 周期（小时） | 0.05 (3分钟) |
| max_inventory | 最大库存 | 0.01 |
| order_size | 单笔订单量 | 0.001 |
| min_spread_bps | 最小价差 | 2 bps |
| strict_no_rest_markets | 预置市场元数据，禁用 load_markets REST | true（使用 config/markets.json） |
| markets_sha256_path | markets.json 校验文件 | config/markets.sha256 |
| use_rest_snapshot | 启动时是否拉取一次账户快照 | false（零 REST 场景保持关闭） |
| mid_none_limit | 连续 mid 缺失阈值，超出暂停下单 | 3 |
| order_ttl_seconds | 挂单 TTL，0 关闭刷新 | 0 |
| order_price_deviation_bps | 价格偏离触发撤单阈值 | 0 |
| cancel_cooldown_seconds | 撤单最小间隔，避免过度撤单 | 0.2 |
| risk_log_details | 风控日志打印持仓/挂单明细 | false |
| flat_retries | 平仓失败重试次数 | 2 |
| flat_retry_backoff | 平仓重试退避秒数 | 0.5 |

### 市场元数据校验
- 预置文件：`config/markets.json`，校验值：`config/markets.sha256`
- 自动生成（默认测试网）：`python scripts/gen_markets.py --out config/markets.json`
- 仅更新校验：`python scripts/gen_markets_sha.py --json config/markets.json --out config/markets.sha256`
- 校验失败将阻止启动，避免过期或被篡改的元数据导致下单精度错误。

### 依赖锁定
- 可复现安装：`pip install -r requirements.lock`（精确版本）
- 如需更新锁文件：在虚拟环境中运行 `pip install pip-tools && pip-compile --generate-hashes -o requirements.lock requirements.txt`

## 风控

- 单品种名义上限: 200 USDT
- 全局名义上限: 2000 USDT
- 强平阈值: 400 USDT
