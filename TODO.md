# Trading-Service Performance Execution TODO

Source: PERFORMANCE_AUDIT_TRADING_SERVICE.md
Date: 2026-01-22
Scope: services/trading-service

## Phase 0: Baseline and profiling (evidence first)

- [ ] Run baseline workload with fixed symbols/intervals; record t_read/t_compute/t_write.
  - Command: `cd services/trading-service && python -m src --once --mode all --symbols BTCUSDT,ETHUSDT --intervals 5m,1h --workers 4`
  - Accept: log line includes durations and total rows.
- [ ] cProfile to confirm Python hotspots.
  - Command: `python -m cProfile -o /tmp/trading.pstats -m src --once --mode all --symbols BTCUSDT,ETHUSDT --intervals 5m,1h`
  - Accept: top cumtime functions identified (psycopg/sqlite3/indicator compute).
- [ ] py-spy flamegraph for CPU vs IO.
  - Command: `py-spy record -o /tmp/trading.svg -- python -m src --once --mode all --symbols BTCUSDT,ETHUSDT --intervals 5m,1h`
  - Accept: dominant stacks mapped to read/compute/write stages.
- [ ] Record DB pressure counters (SQLite commit count, PG query count).
  - Accept: per-run counters saved alongside timing.

## Phase 1: Quick wins (low risk, minimal code)

- [x] Vectorize row-wise apply in TvTrendCloud.
  - File: `services/trading-service/src/indicators/batch/tv_trend_cloud.py`
  - Accept: output parity on same df; compute time reduced.
- [x] Replace iterrows deletes with executemany in DataWriter.
  - File: `services/trading-service/src/db/reader.py`
  - Accept: same row counts; write time reduced.
- [x] Single transaction for per-indicator writes.
  - Files: `services/trading-service/src/db/reader.py`, `services/trading-service/src/core/engine.py`
  - Accept: commit count drops from O(K) to O(1) per run.
- [x] Reuse indicator instances per batch after verifying statelessness.
  - File: `services/trading-service/src/core/engine.py`
  - Accept: output parity across repeated runs.

## Phase 2: Medium refactor (remove N+1 IO)

- [x] Move futures metrics IO out of indicator compute; add batch reader and cache.
  - Files: `services/trading-service/src/indicators/batch/futures_aggregate.py`, `services/trading-service/src/indicators/batch/futures_gap_monitor.py`, `services/trading-service/src/core/engine.py`
  - Accept: PG query count drops to O(intervals).
- [ ] Batch update DataCache per interval instead of per symbol.
  - File: `services/trading-service/src/db/cache.py`
  - Accept: TimescaleDB query count drops to O(intervals).
- [ ] Avoid DataFrame .copy() in cache path; enforce read-only contract.
  - File: `services/trading-service/src/db/cache.py`
  - Accept: peak RSS reduced without output drift.

## Phase 3: Deep refactor (maintainability + performance)

- [ ] Split IO / compute / storage into clear modules (datasource, indicators, storage, pipeline).
  - Accept: indicators are pure compute; IO isolated.
- [ ] Define data contracts and add tests for non-mutating inputs.
  - Accept: tests fail if indicators mutate input df.
- [ ] Add a benchmark harness (no new runtime deps).
  - Accept: repeatable median timing and RSS snapshot.

## Validation checklist

- [ ] Output parity: SQLite row counts and sampled value comparisons.
- [ ] Performance: total time and t_read/t_compute/t_write before/after.
- [ ] Resource: peak RSS and DB query/commit counters before/after.

## Execution log

- 2026-01-22: Completed TvTrendCloud vectorization (Phase 1).
- 2026-01-22: Added batch futures metrics caches to reduce per-symbol IO.
