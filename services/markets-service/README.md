# Markets Service

全市场数据采集服务 - 支持加密货币、股票、期货、期权、外汇、债券、宏观经济

## 数据源联通性测试 (2026-01-04)

| Provider | 市场 | 测试符号 | 状态 | 数据量 | 备注 |
|:---|:---|:---|:---:|---:|:---|
| **yfinance** | 美股 | AAPL | ✅ | 21 | 免费，无需 API Key |
| **akshare** | A股 | 000001 | ✅ | 1455 | 免费，数据全 |
| **baostock** | A股 | 000001 | ✅ | 2674 | 免费，历史数据长 |
| **ccxt** | 加密货币 | BTCUSDT | ✅ | 5 | 支持 100+ 交易所 |
| **fredapi** | 宏观 | DGS10 | ✅ | 15984 | 10年期国债收益率 |
| **quantlib** | 定价 | 期权 | ✅ | - | 本地计算，无需网络 |
| **openbb** | 聚合 | AAPL | ✅ | 249 | 首次启动需 build |
| **cryptofeed** | 加密WS | - | ✅ | - | 导入成功，流式数据 |

### 测试命令

```bash
# 美股
python -m src test --provider yfinance --symbol AAPL

# A股
python -m src test --provider akshare --symbol 000001
python -m src test --provider baostock --symbol 000001

# 加密货币
python -m src test --provider ccxt --symbol BTCUSDT

# 期权定价
python -m src pricing
```

## 架构

采用 **Provider + Router 模式** (参考 OpenBB Platform):

```
src/
├── core/              # 核心框架
│   ├── fetcher.py     # TET Pipeline 基类
│   ├── registry.py    # Provider 注册表
│   └── quality.py     # 数据质量监控
│
├── models/            # 标准化数据模型
│   ├── candle.py      # K线
│   ├── ticker.py      # 行情
│   ├── trade.py       # 成交
│   └── instrument.py  # 统一标的标识
│
├── providers/         # 数据源适配器 (8个)
│   ├── ccxt/          # 加密货币 REST (100+ 交易所)
│   ├── cryptofeed/    # 加密货币 WebSocket
│   ├── akshare/       # A股/港股/期货/债券
│   ├── baostock/      # A股免费历史数据
│   ├── yfinance/      # 美股/港股/外汇
│   ├── fredapi/       # 美联储宏观数据
│   ├── quantlib/      # 期权/债券定价
│   └── openbb/        # 综合聚合 (降级备份)
│
├── collectors/        # 采集任务调度
│   ├── base.py        # Collector 基类
│   ├── crypto.py      # 加密货币采集器
│   ├── ashare.py      # A股采集器
│   └── macro.py       # 宏观数据采集器
│
├── routers/           # 统一路由层
│   └── market.py      # 自动路由到合适 Provider
│
└── storage/           # 存储层
    └── timescale.py
```

## 依赖库

| 类别 | 库 | Stars | 免费 |
|:---|:---|---:|:---:|
| 加密货币 | ccxt | 33k | ✅ |
| 加密货币 | cryptofeed | 2.7k | ✅ |
| A股 | akshare | 15k | ✅ |
| A股 | baostock | 2k | ✅ |
| 美股 | yfinance | 14k | ✅ |
| 多源 | pandas-datareader | 3k | ✅ |
| 宏观 | fredapi | 官方 | ✅ |
| 定价 | QuantLib | 5k | ✅ |
| 聚合 | openbb | 35k | ⚠️ |

## 快速开始

```bash
# 初始化
cd services/markets-service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 可选: 安装定价和聚合模块
pip install QuantLib openbb

# 测试
python -m src test --provider yfinance --symbol AAPL     # 美股
python -m src test --provider akshare --symbol 000001    # A股
python -m src test --provider baostock --symbol 000001   # A股(免费)
python -m src test --provider ccxt --symbol BTCUSDT      # 加密

# 期权定价
python -m src pricing
```

## 历史数据集

| 市场 | 数据源 | 链接 |
|:---|:---|:---|
| 加密货币 | Binance Vision | https://data.binance.vision/ |
| 加密货币 | 你的 HuggingFace | https://huggingface.co/datasets/123olp/binance-futures-ohlcv-2018-2026 |
| 美股 | Kaggle S&P 500 | https://www.kaggle.com/datasets/andrewmvd/sp-500-stocks |
| A股 | BaoStock API | 通过 baostock 库 |
| 宏观 | FRED | https://fred.stlouisfed.org/ |

## TET Pipeline

每个 Provider 实现 Transform-Extract-Transform 流程:

1. **Transform**: 验证并转换查询参数
2. **Extract**: 从数据源获取原始数据
3. **Transform**: 将原始数据转换为标准模型

## 配置

在 `config/.env` 中添加:

```bash
# 可选: FRED 宏观数据 API Key (免费申请: https://fred.stlouisfed.org/docs/api/api_key.html)
FRED_API_KEY=your_api_key_here

# 代理 (如需)
HTTP_PROXY=http://127.0.0.1:7890
```
