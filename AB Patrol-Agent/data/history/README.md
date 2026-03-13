# 历史行情目录说明

> 更新于 2026-03-13

`history/` 是 `AB Patrol-Agent` 当前唯一的离线行情入口。

## 目录结构

- `cache/`
  - 回测生成或复用的 Parquet 窗口缓存
- `hf_downloads/`
  - HuggingFace 原始下载文件
  - 当前规范目标目录是这里
- `hf_parquet/`
  - 可选的本地 Parquet 分片
  - 当前规范是 `symbol=BTCUSDT/year=2022/data.parquet` 这种分区形式
  - 适合把大 CSV 切成按币种和年份的长期离线分片

## 使用原则

1. 新下载的原始历史数据统一放 `hf_downloads/`
2. 从原始历史切出来的窗口缓存统一放 `cache/`
3. 如果未来做长期归档切片，统一放 `hf_parquet/`
4. 不再把历史数据直接散放到 `data/` 根目录
5. `hf_downloads/`、`hf_parquet/`、`cache/` 都属于本地离线数据目录，默认不纳入 Git

## 推荐命令

```bash
cd "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent"

uv run --with pandas --with pyarrow --no-project \
  python tools/diagnostics/shard_history_parquet.py \
  --symbols BTCUSDT,ETHUSDT,BNBUSDT,SOLUSDT \
  --overwrite
```
