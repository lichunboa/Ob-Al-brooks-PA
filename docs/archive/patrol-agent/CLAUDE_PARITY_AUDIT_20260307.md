# Claude Parity Audit - 2026-03-07

## Scope

Audit target:

- Original authority:
  - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/.claude/skills/patrol-l1/SKILL.md`
  - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/.claude/skills/patrol-l1/references/`
- Current runtime:
  - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/runtime/pa_runtime.py`
  - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/tools/patrol_ab_context.py`

Goal:

- Check whether the GPT/OpenClaw patrol loop still follows the original Claude `skill + S-files` logic.
- Identify the real gaps.
- Record the fixes made in this repair batch.

## Repaired In This Batch

0. Restored audit transparency:
   - runtime knowledge loading is now auditable directly from:
     - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/knowledge/patrol-l1/SKILL.md`
     - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/knowledge/patrol-l1/references/`
     - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/data/pa_trader/logs/decision/last_request.md`

1. Restored missing higher-timeframe context:
   - runtime now fetches `30m`, `4h`, `1d` in addition to the primary execution frames.

2. Restored the original bar-reading contract:
   - runtime now explicitly enforces `150 bars available`, `browse 80`, `close-read 20`.

3. Restored Al Brooks structured evidence:
   - added `patrol_ab_context.py` to feed runtime with:
     - `ab_ema`
     - `ab_sr`
     - `ab_mm`
     - `ab_patterns`
     - `H1/H2/L1/L2`
     - quick-scan events
     - alignment score

4. Restored event-driven S-file routing:
   - S-files are now chosen from symbol events and market state instead of only from runtime phase.

5. Fixed an actual indicator bug:
   - `ab_patterns.py` had a syntax error and is now importable again.

6. Fixed OpenClaw runtime blockage:
   - cleaned the oversized `ab-patrol-loop` session store
   - restarted the gateway
   - decision calls are responsive again

7. Fixed Patrol startup:
   - `AB Patrol-Agent/scripts/start.sh` had the runtime arguments in the wrong order
   - this caused fake "started" states while the loop exited immediately

8. Reduced prompt bloat without dropping the rule system:
   - runtime now routes original `SKILL.md` sections and original `S` files by state
   - `ab_context` is compressed into prompt-safe structured evidence instead of the full raw indicator dump
   - JSON prompt rendering no longer hard-cuts the payload mid-structure
   - this reduced a sampled prompt from roughly `87k` characters to about `23k`

9. Restored auxiliary runtime hooks:
   - new `pre_signal` creation now has an immediate dedicated push path
   - every `6` loops now emits a dedicated housekeeping/status summary
   - pre-signal chart prefetch is reintroduced for symbols that just entered watch state

10. Patrol-specific runtime assets are physically isolated under `AB Patrol-Agent`:
   - state now lives in `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/data/pa_trader/`
   - charts now live in `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/data/charts/`
   - patrol tools now live in `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/tools/`

11. Decision path is now provider-driven:
   - OpenClaw remains TG/operator host
   - `ab-patrol-loop` can now route decisions through:
     - `openclaw`
     - `openai_compat`
   - provider adapter lives in:
     - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/runtime/providers.py`

## Current Parity Status

### Now Effectively Restored

- Original patrol authority is still the same `patrol-l1` framework.
- Runtime knowledge authority is externally visible and auditable under:
  - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/knowledge/patrol-l1/SKILL.md`
  - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/knowledge/patrol-l1/references/`
- The runtime still reasons in the same major sequence:
  - execution snapshot
  - daily bias
  - position-first management
  - quick scan
  - deep analysis
  - Trader's Equation
  - next scan decision
- Multi-timeframe context is again present across:
  - `5m`
  - `15m`
  - `30m`
  - `1h`
  - `4h`
  - `1d`
- The loop now uses structured Al Brooks signals instead of only generic summaries.
- The structured evidence path is explicit:
  - `pa_runtime.py -> build_ab_context() -> tools/patrol_ab_context.py`
  - `tools/patrol_ab_context.py` directly calls:
    - `ab_ema.py`
    - `ab_sr.py`
    - `ab_mm.py`
    - `ab_patterns.py`
  - quick scan then consumes:
    - `signal_trigger:*`
    - `hl_signal:*`
    - `first_pb:*`
    - `tr_edge:*`
    - `wedge_or_mtr`
    - `pb_depth:*`
- Decision output now contains:
  - structure summary
  - market state
  - key levels
  - scenarios
  - entry idea
  - evaluation
  - refs used
  - next trigger
  - next scan reason
- Execution still routes through:
  - `tools/patrol_trade.py`
  - `execution-service`

### Verified Running Evidence

- Successful single-cycle execution:
- Successful isolated single-cycle execution:
  - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/data/pa_trader/cycles/cycle_20260307_155659.json`
- Telegram delivery sample:
  - `messageId=221`
- Current repaired timeout-fallback sample after prompt compression:
  - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/data/pa_trader/cycles/cycle_20260307_140713.json`

### Verified Execution Smoke Test

Demo execution path was tested end-to-end on `execution-service` using `claude-pa`:

- `can_trade = true`
- `/trading/calculate-size/claude-pa` returned a valid quantity
- demo `SELL BTCUSDT` market order was placed successfully
- open position became visible in `/positions`
- immediate close order succeeded
- `/positions` returned to empty

This proves that:

- order placement
- position visibility
- close flow

are all functioning on the demo exchange path.

### Still Not 1:1 With Original Claude Runtime

1. The raw original `SKILL.md` and full S-files are not injected verbatim every cycle anymore.
   - Current runtime uses concise briefs derived from them.
   - Reason: full-text injection caused unstable OpenClaw timeouts.
   - Impact: logic is preserved at the rule level, but token-by-token prompt identity is no longer the same.

2. Some original auxiliary behaviors are still partial or absent:
   - periodic every-6-loop special report is not a dedicated separate mode yet
   - wait-period background jobs from the old skill are not fully restored:
     - chart pre-generation loop
     - daily stats precompute
     - explicit cache/position diff audit during idle waits
   - pre_signal expiry and renewal rules are not yet fully enforced as explicit timers

3. Session hygiene still depends on OpenClaw behavior.
   - The decision session was reset in this repair batch because it had grown past context budget.
   - Durable state is already externalized in `data/pa_trader`, but OpenClaw still keeps some session-level cache internally.

4. Actual live order opening by patrol has not happened in the repaired cycles yet.
   - Latest repaired patrol journal still shows `LOG_ONLY` only.
   - Evidence:
     - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/data/pa_trader/journal/decision_log.jsonl`
     - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/data/pa_trader/journal/execution_log.jsonl`
   - Execution path is wired and validated through the gate, but no repaired-cycle market setup has yet crossed the final threshold into `OPEN_ORDER`.

5. In-tool background persistence is still a verification gap.
   - Single cycles are now recoverable and write correct fallback cycles.
   - But long-running background loop validation from the Codex tool environment is unreliable because launched child processes may be reaped after the tool command returns.
   - Real persistence should be verified from the user's local one-click launcher / OpenClaw-trigger path.

## Honest Conclusion

The system is no longer in the earlier "simple status reply" state.

It is now doing real patrol work again:

- reading deeper market structure
- using Al Brooks context modules
- producing structured state updates
- selecting S-file rules on demand
- pushing live cycle updates to Telegram

But it is not yet a perfect 1:1 replica of the old Claude terminal runtime.

The largest remaining gap is no longer "it cannot analyze"; that is fixed.
The remaining gap is:

- exact parity of all auxiliary runtime behaviors
- more long-run validation until live `OPEN_ORDER` cycles appear naturally
- OpenClaw still times out frequently, so current repaired production behavior is "timeout-safe watch mode", not "stable natural order generation"

## Recommended Next Work

1. Add explicit `pre_signal` expiry / renewal enforcement.
2. Restore the old every-6-loop reporting behavior as a dedicated runtime branch.
3. Re-add wait-period housekeeping tasks from the old skill.
4. Keep collecting repaired live cycles until a natural `OPEN_ORDER` occurs, then verify:
   - order placement
   - SL/TP
   - position management
   - close / modify-stop path
