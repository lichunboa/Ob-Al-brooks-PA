# 数据目录说明

> 更新于 2026-03-12

`data/` 现在承接 `AB Patrol-Agent` 的所有运行产物，避免 PID、日志和报告继续堆在项目根目录。

## 当前目录

- `pa_trader/`
  - Patrol 主运行态、状态文件、周期记录、决策日志
- `pa_trader_crypto/`
  - Crypto 巡逻运行态
- `charts/`
  - 图表导出结果
- `backtest_cache/`
  - 回测缓存数据
- `cache/`
  - 通用缓存
- `run/`
  - 服务 PID、服务日志、launchd 包装脚本
- `reports/backtest/`
  - 回测矩阵和实验报告

## 放置规则

1. 运行时状态优先写入 `pa_trader/` 或 `pa_trader_crypto/`
2. 服务级日志和 PID 统一写入 `run/`
3. 回测输出统一写入 `reports/backtest/`
4. 不要在项目根目录新建新的日志、PID、JSON 报告目录
