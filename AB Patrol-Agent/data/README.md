# 数据目录说明

> 更新于 2026-03-13

`data/` 现在承接 `AB Patrol-Agent` 的所有运行产物，避免 PID、日志和报告继续堆在项目根目录。

## 当前目录

- `pa_trader/`
  - Patrol 主运行态、状态文件、周期记录、决策日志
- `pa_trader_crypto/`
  - Crypto 巡逻运行态
- `charts/`
  - 图表导出结果
- `history/`
  - 统一历史行情入口
  - `cache/`：回测 Parquet 缓存
  - `hf_downloads/`：HuggingFace 原始 CSV.gz 与下载缓存
  - `hf_parquet/`：可选的本地 HF Parquet 分片
- `cache/`
  - 通用缓存
- `run/`
  - 服务 PID、服务日志、launchd 包装脚本
- `reports/backtest/`
  - 回测矩阵和实验报告

## 放置规则

1. 运行时状态优先写入 `pa_trader/` 或 `pa_trader_crypto/`
2. 服务级日志和 PID 统一写入 `run/`
3. 历史行情统一放 `history/`，不要再把原始 CSV、Parquet 缓存散落在 `data/` 根层
4. `history/` 下的原始下载、parquet 切片和窗口缓存都是本地数据，不再纳入 Git 跟踪
5. 回测输出统一写入 `reports/backtest/`
6. 不要在项目根目录新建新的日志、PID、JSON 报告目录
