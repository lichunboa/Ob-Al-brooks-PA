# Order Service

交易执行服务，包含 Avellaneda-Stoikov 做市系统。

> ⚠️ **注意**：此服务为交易执行模块，需要 API 密钥，请谨慎使用。

## 策略来源

本模块的做市策略基于 [Hummingbot](https://github.com/hummingbot/hummingbot) 开源项目构建，参考了其 Avellaneda-Stoikov 做市策略实现。

## 架构

```
order-service/
├── src/
│   └── market-maker/       # A-S 做市系统
│       ├── main.py         # 入口
│       ├── config/         # 配置文件
│       └── src/
│           ├── core/       # 引擎/风控/数据流
│           └── strategies/ # 策略实现
├── config/
│   └── .env.example        # 配置模板
└── scripts/                # 运维脚本
```

## Market Maker

基于 Avellaneda-Stoikov 论文的做市系统，面向 Binance USDT-M 合约。

### 核心特性

| 特性 | 说明 |
|:---|:---|
| **WebSocket 全链路** | 行情 + 用户数据流 |
| **双向持仓模式** | hedge_mode |
| **名义敞口风控** | 实时监控 |
| **预置市场元数据** | 零 REST 模式 |

### 快速开始

```bash
cd services/order-service

# 1. 创建虚拟环境
python3 -m venv .venv && source .venv/bin/activate

# 2. 安装依赖
pip install -r requirements.txt

# 3. 配置
cp config/.env.example config/.env
# 编辑 config/.env 填入 API 密钥

# 4. 运行
python -m src.market-maker.main
```

### 配置说明

#### 策略参数

| 参数 | 说明 | 默认值 |
|:---|:---|:---|
| `gamma` | 风险厌恶系数 | 0.1 |
| `T` | 周期（小时） | 0.05 |
| `max_inventory` | 最大库存 | 0.01 |
| `order_size` | 单笔订单量 | 0.001 |
| `min_spread_bps` | 最小价差 | 2 bps |

#### 风控参数

| 参数 | 说明 | 默认值 |
|:---|:---|:---|
| `per_symbol_limit` | 单品种名义上限 | 200 USDT |
| `global_limit` | 全局名义上限 | 2000 USDT |
| `flat_threshold` | 强平阈值 | 400 USDT |

## 环境变量

| 变量 | 必填 | 说明 |
|:---|:---:|:---|
| `BINANCE_API_KEY` | ✓ | Binance API Key |
| `BINANCE_API_SECRET` | ✓ | Binance API Secret |

## 依赖

```
ccxt>=4.0.0
cryptofeed>=2.4.0
aiohttp>=3.9.0
```

## 风险提示

- 此服务涉及真实交易，请在测试网验证后再使用
- 建议先使用小额资金测试
- 确保 API 密钥权限最小化（仅开启交易权限）
