# cTrader 接入说明

> 更新于 2026-03-11

本文只描述当前仓库里已经落地并验证通过的 cTrader 方案。

## 1. 当前真实状态

当前 Patrol 主栈已经切到：

- `exchange=ctrader`
- `mode=demo`
- `market_profile=multi_asset`

已验证能力：

- 官方 Open API 认证成功
- execution-service 可读取余额、持仓、挂单
- execution-service 可读取外汇 / 贵金属 / 指数 K 线
- Demo 账户可真实开平仓

## 2. 当前实现不是旧 REST 壳

当前 cTrader 接入已经不是之前那套伪 REST 壳。

真实实现是：

- `runtime/adapters/ctrader_openapi_client.py`
  - 直接走 cTrader Open API protobuf 协议
- `runtime/adapters/ctrader_adapter.py`
  - Patrol 侧薄封装
- `services/execution-service/src/executor.py`
  - 通过 execution-service 暴露统一交易接口

所以现在的下单链是：

`Patrol Runtime -> execution-service -> cTrader Open API`

## 3. 根配置

当前统一使用根配置：

`/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/config/.env`

关键变量：

```bash
AB_PATROL_EXCHANGE=ctrader
AB_PATROL_CTRADER_CLIENT_ID=...
AB_PATROL_CTRADER_CLIENT_SECRET=...
AB_PATROL_CTRADER_ACCESS_TOKEN=...
AB_PATROL_CTRADER_ACCOUNT_ID=...
AB_PATROL_CTRADER_DEMO=1
```

说明：

- `AB_PATROL_CTRADER_DEMO=1` 表示 Demo
- execution-service 默认也会从这份根 `.env` 读取，不再依赖旧的 service 内部污染配置

## 4. 当前测试用观察名单

当前 Patrol 多资产默认观察名单是：

- 外汇：`EURUSD`、`GBPUSD`、`USDJPY`
- 贵金属：`XAUUSD`
- 指数：`US 30`、`US TECH 100`

当前 `symbols.json` 中也已经同步成账户真实可交易名：

- `US 30`
- `US 500`
- `US TECH 100`
- `GERMANY 40`
- `UK 100`

注意：

- 不要再写旧名 `US30 / NAS100 / GER40 / UK100`
- Web fallback 现在已经允许带空格的指数代码

## 5. 当前已验证的测试项

已经做过的真实验收：

- `GET /health`
  - 返回 `exchange=ctrader`
  - 返回 `mode=demo`
  - 返回 `trading_enabled=true`
- `GET /balance`
  - 返回 Demo 账户 `USD` 余额
- `GET /positions`
  - 可返回真实持仓
- `GET /klines/{symbol}`
  - `EURUSD / XAUUSD / US 30 / US TECH 100` 可取 K 线
- `POST /order`
  - 已通过 Demo 账户真实下过 `EURUSD`
- `POST /order/{symbol}/close`
  - 已通过 Demo 账户真实平过 `EURUSD`

## 6. 快速验证命令

```bash
curl http://127.0.0.1:8092/health
curl http://127.0.0.1:8092/balance
curl "http://127.0.0.1:8092/klines/EURUSD?interval=5m&limit=5"
curl "http://127.0.0.1:8092/klines/XAUUSD?interval=5m&limit=5"
curl "http://127.0.0.1:8092/klines/US%2030?interval=5m&limit=5"
curl "http://127.0.0.1:8092/klines/US%20TECH%20100?interval=5m&limit=5"
```

如果要让 Patrol 主循环使用 cTrader：

```bash
cd "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent"
./scripts/start.sh recover --execute
```

## 7. 当前 Web / TG 展示

当前多资产接通后：

- Query 卡片标题显示 `PA交易 Multi-Asset`
- TG 图表标题显示 `PA交易 Multi-Asset`
- Web `/pa-bot` 会从 runtime/query 聚合里读取：
  - `exchange=ctrader`
  - `marketProfile=multi_asset`
  - 多资产焦点品种

## 8. 常见问题

### 1. execution 已是 cTrader，但 runtime 还是 Crypto

这是旧缓存问题，不是 API 没接通。

当前已经修复：

- wrapper 启动时强制 source 根 `.env`
- `env_loader.py` 以项目 `.env` 为准
- runtime 会在交易所切换时重置不兼容的 market cache

### 2. 指数代码显示不出来

优先检查是不是还在用旧代码名。  
当前应使用：

- `US 30`
- `US TECH 100`
- `GERMANY 40`
- `UK 100`

### 3. 有连接但没有订单

当前如果 `positions=0 / orders=0`，优先看最新 cycle。  
现在多资产主链常见原因是：

- 当前只到 `watching`
- 当前结构仍是 `TR 边缘限价单环境`
- 没有升级成 `executable`
