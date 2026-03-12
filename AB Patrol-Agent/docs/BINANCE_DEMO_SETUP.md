# Binance Demo 接入说明

> 更新于 2026-03-11

本文只记录当前仓库里的 Binance Demo 接法与验证方式。

## 1. 当前状态

Binance Demo 不是主栈当前正在使用的交易所。  
主栈当前跑的是 `ctrader demo / multi_asset`。

但 Binance Demo 配置已经保留并验证可用，适合作为单独回切测试环境。

我在本机临时拉起过一个独立 execution-service 探针：

- `exchange=binance`
- `mode=demo`
- `status=healthy`
- `trading_enabled=true`
- 余额约 `4994.80 USDT`

说明根配置里的 Binance Demo API 目前是可用的。

## 2. 当前配置位置

统一使用根配置：

`/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/config/.env`

不要再把 key 写到旧的：

- `services/execution-service/config/.env`

当前 execution-service 已优先读取根 `.env`。

## 3. 关键变量

```bash
AB_PATROL_BINANCE_TESTNET=1
BINANCE_MODE=demo
BINANCE_TESTNET_API_KEY=...
BINANCE_TESTNET_SECRET=...
```

如果要显式切 execution-service 到 Binance Demo：

```bash
EXCHANGE=binance
EXCHANGE_MODE=demo
BINANCE_MODE=demo
```

## 4. 快速验证

主栈不切换的情况下，可以临时起一个独立探针端口：

```bash
cd "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/execution-service"
ENV_FILE="/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/config/.env" \
EXCHANGE=binance \
EXCHANGE_MODE=demo \
BINANCE_MODE=demo \
PYTHONPATH="/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent" \
.venv/bin/python -m src --port 8094
```

然后检查：

```bash
curl http://127.0.0.1:8094/health
curl http://127.0.0.1:8094/balance
curl http://127.0.0.1:8094/positions
```

## 5. 当前已验证结果

最近一次独立探针验证结果：

- `/health`
  - `exchange=binance`
  - `mode=demo`
  - `status=healthy`
  - `trading_enabled=true`
- `/balance`
  - `USDT balance ≈ 4994.80`
- `/positions`
  - 当前空仓

## 6. 如何切回 Binance Demo 主栈

如果后续要让 Patrol 主循环回到 Binance Demo：

1. 在根 `.env` 把 `AB_PATROL_EXCHANGE` 改成 `binance`
2. 保持 `BINANCE_MODE=demo`
3. 重启 Patrol

```bash
cd "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent"
./scripts/start.sh restart --execute
```

## 7. 注意事项

- 现在币安配置已经恢复，但不是当前主栈默认交易所
- 当前 Web / TG 主展示跟随 Patrol runtime，所以主栈切在 cTrader 时会显示 Multi-Asset
- 如果只是验 Binance key，不要直接改动主栈，优先用独立探针端口验证
