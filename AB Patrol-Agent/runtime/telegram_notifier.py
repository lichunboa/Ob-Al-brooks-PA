"""Telegram 卡片渲染与推送。"""

from __future__ import annotations

import os
import time
from datetime import datetime
from typing import Any

from state_manager import infer_signal_timeframe
from utils import (
    canonical_action_type,
    format_ai_direction_text,
    format_gate_message,
    format_pre_signal_text,
    format_trigger_prices_text,
    load_json,
    normalize_refs,
    order_type_cn,
)


class TelegramNotifierMixin:
    """封装预信号卡片、巡逻汇总与 Telegram 推送。"""

    def detect_new_pre_signals(
        self,
        previous_symbols: dict[str, Any],
        current_symbols: dict[str, Any],
        analysis_board: dict[str, Any],
        quick_scan_events: dict[str, Any],
    ) -> list[dict[str, Any]]:
        notices: list[dict[str, Any]] = []
        for symbol, current in current_symbols.items():
            if not isinstance(current, dict):
                continue
            pre_signal = str(current.get("pre_signal") or "").strip()
            if not pre_signal:
                continue
            previous = previous_symbols.get(symbol) if isinstance(previous_symbols.get(symbol), dict) else {}
            previous_pre_signal = str(previous.get("pre_signal") or "").strip()
            if previous_pre_signal == pre_signal:
                continue
            board = analysis_board.get(symbol) if isinstance(analysis_board.get(symbol), dict) else {}
            live_frames = board.get("live_timeframes") if isinstance(board.get("live_timeframes"), dict) else {}
            latest_bar = (live_frames.get("5m") or {}).get("latest_bar") if isinstance(live_frames.get("5m"), dict) else {}
            meta = current.get("pre_signal_meta") if isinstance(current.get("pre_signal_meta"), dict) else {}
            notices.append(
                {
                    "symbol": symbol,
                    "status": current.get("status"),
                    "market_state": current.get("market_state"),
                    "pre_signal": pre_signal,
                    "expires_at": meta.get("expires_at"),
                    "timeframe": meta.get("timeframe") or infer_signal_timeframe(pre_signal),
                    "close": latest_bar.get("C") if isinstance(latest_bar, dict) else None,
                    "thesis": current.get("thesis") or current.get("structure_summary") or current.get("market_state_detail"),
                    "events": self.flatten_events(quick_scan_events.get(symbol)),
                    "planned_trade": current.get("planned_trade") if isinstance(current.get("planned_trade"), dict) else {},
                    "chart_context": board.get("chart_context") if isinstance(board.get("chart_context"), dict) else {},
                    "brooks_filter": current.get("brooks_filter") if isinstance(current.get("brooks_filter"), dict) else {},
                }
            )
        return notices

    def monitoring_snapshot(self, knowledge_loading: dict[str, Any] | None = None) -> dict[str, Any]:
        knowledge_loading = knowledge_loading if isinstance(knowledge_loading, dict) else {}
        session_state = load_json(self.state_dir / "decision_session.json", {})
        request_path = self.logs_dir / "last_request.md"
        request_text = request_path.read_text(encoding="utf-8") if request_path.exists() else ""
        session_bootstrapped_at = session_state.get("bootstrapped_at")
        session_age_seconds = None
        if session_bootstrapped_at:
            try:
                session_age_seconds = max(0, int(time.time() - float(session_bootstrapped_at)))
            except (TypeError, ValueError):
                session_age_seconds = None
        refs_count = int(knowledge_loading.get("full_reference_count") or 0) + int(
            knowledge_loading.get("brief_reference_count") or 0
        )
        return {
            "knowledge_chars": knowledge_loading.get("knowledge_chars"),
            "refs_count": refs_count,
            "request_chars": len(request_text),
            "session_age_seconds": session_age_seconds,
            "session_turn_count": session_state.get("turn_count"),
            "session_model": session_state.get("model"),
        }

    def render_pre_signal_push(self, notice: dict[str, Any]) -> str:
        def status_cn(value: str) -> str:
            mapping = {
                "watching": "继续观察",
                "pre_signal": "预信号",
                "entry_ready": "候选单",
                "entry_ready_blocked": "候选单（规则待通过）",
                "in_trade": "持仓中",
                "manage": "正在管理",
                "cooldown": "冷却中",
            }
            return mapping.get(str(value), str(value))

        def trim_text(value: Any, limit: int = 180) -> str:
            text = " ".join(str(value or "-").split())
            if len(text) <= limit:
                return text
            return text[: max(0, limit - 1)].rstrip() + "…"

        def format_event(raw: Any) -> str:
            text = str(raw or "").strip()
            if not text:
                return ""
            mapping = {
                "ema_touch": "EMA回踩",
                "wedge_or_mtr": "楔形/MTR",
                "cached_pre_signal": "沿用上一轮预信号",
            }
            if text in mapping:
                return mapping[text]
            if text.startswith("signal_trigger:"):
                return "触发:" + text.split(":", 1)[1]
            if text.startswith("hl_signal:"):
                return "高低点:" + text.split(":", 1)[1]
            if text.startswith("state_change:"):
                return "状态切换:" + text.split(":", 1)[1].replace("->", "→")
            if text.startswith("state:"):
                return "状态:" + text.split(":", 1)[1]
            if text.startswith("tr_edge:"):
                edge = text.split(":", 1)[1]
                edge = {"top": "区间上沿", "bottom": "区间下沿"}.get(edge, edge)
                return edge
            if text.startswith("pb_depth:"):
                depth = text.split(":", 1)[1]
                depth = {"deep": "回撤偏深", "shallow": "回撤偏浅", "normal": "回撤正常", "too_deep": "回撤过深"}.get(depth, depth)
                return depth
            if text.startswith("first_pb:"):
                token = text.split(":", 1)[1]
                token = {"bull_pb": "首次回踩多", "bear_pb": "首次回踩空"}.get(token, token)
                return token
            return text

        symbol = str(notice.get("symbol") or "-")
        direction = str(notice.get("status") or "pre_signal")
        close = notice.get("close")
        close_text = f"{close}" if close not in (None, "") else "-"
        raw_events = [format_event(item) for item in (notice.get("events") or [])]
        events = " / ".join(item for item in raw_events if item) or "-"
        thesis = " ".join(str(notice.get("thesis") or "-").split())
        if len(thesis) > 180:
            thesis = thesis[:179].rstrip() + "…"
        expiry = notice.get("expires_at") or "-"
        timeframe = notice.get("timeframe") or "-"
        pre_signal_text = format_pre_signal_text(notice.get("pre_signal"))
        planned_trade = notice.get("planned_trade") if isinstance(notice.get("planned_trade"), dict) else {}
        brooks_filter = notice.get("brooks_filter") if isinstance(notice.get("brooks_filter"), dict) else {}
        planned_bits = []
        if planned_trade.get("candidate_stage_cn"):
            planned_bits.append(str(planned_trade.get("candidate_stage_cn")))
        if planned_trade.get("execution_mode_cn"):
            planned_bits.append(str(planned_trade.get("execution_mode_cn")))
        if planned_trade.get("order_type"):
            planned_bits.append(order_type_cn(str(planned_trade.get("order_type") or "")))
        if planned_trade.get("entry_price"):
            planned_bits.append(f"触发价 {planned_trade.get('entry_price')}")
        elif planned_trade.get("entry_zone"):
            planned_bits.append(f"触发区 {planned_trade.get('entry_zone')}")
        if planned_trade.get("stop_loss"):
            planned_bits.append(f"止损 {planned_trade.get('stop_loss')}")
        if planned_trade.get("take_profit"):
            planned_bits.append(f"止盈 {planned_trade.get('take_profit')}")
        plan_text = "｜".join(str(item) for item in planned_bits if item) or "-"
        filter_text = trim_text(brooks_filter.get("label") or "-", 80)
        upgrade_text = trim_text(brooks_filter.get("upgrade_condition") or "-", 120)
        chart_context = notice.get("chart_context") if isinstance(notice.get("chart_context"), dict) else {}
        chart_files = ", ".join(str(item) for item in (chart_context.get("chart_files") or [])[:3]) or "-"
        chart_hint = chart_context.get("primary_chart_path") or "-"
        monitoring = self.monitoring_snapshot()
        monitor_text = (
            f"knowledge {monitoring.get('knowledge_chars') or '-'} | refs {monitoring.get('refs_count') or 0}"
            f" | request {monitoring.get('request_chars') or '-'} | age {monitoring.get('session_age_seconds') or '-'}s"
        )

        # 格式化价格
        try:
            price_num = float(close_text.replace(',', ''))
            close_formatted = f"${price_num:,.2f}" if price_num > 100 else f"${price_num:.4f}"
        except:
            close_formatted = close_text

        # 简化状态
        market_state = notice.get('market_state', '')
        if isinstance(market_state, str) and '/' in market_state:
            state_parts = market_state.split('/')
            state_summary = ' / '.join(part.strip() for part in state_parts[:4])
        else:
            state_summary = str(market_state)[:80]

        # 格式化有效期
        if 'T' in expiry:
            expiry_date = expiry.split('T')[0]
            expiry_time = expiry.split('T')[1][:5]
            expiry_formatted = f"{expiry_date} {expiry_time}"
        else:
            expiry_formatted = expiry

        return "\n".join(
            [
                "━━━━━━━━━━━━━━━━━━━━",
                f"🟡 预信号 | {symbol}",
                "━━━━━━━━━━━━━━━━━━━━",
                "",
                f"⏱️  周期: {timeframe}",
                f"💵 价格: {close_formatted}",
                "",
                f"📊 市场状态",
                f"  {state_summary}",
                "",
                f"🎯 等待触发",
                f"  {pre_signal_text[:120]}",
                "",
                f"📚 Brooks 分类",
                f"  {filter_text}",
                "",
                f"🔓 升级条件",
                f"  {upgrade_text}",
                "",
                f"📝 结构分析",
                f"  {thesis[:180]}",
                "",
                f"📋 计划",
                f"  {plan_text[:150]}",
                "",
                f"🖼 图表",
                f"  {chart_files}",
                "",
                f"🧠 上下文",
                f"  {monitor_text}",
                "",
                f"⏰ 有效期: {expiry_formatted}",
                "━━━━━━━━━━━━━━━━━━━━",
            ]
        )

    def render_housekeeping_card(
        self,
        updated_runtime: dict[str, Any],
        market_cache: dict[str, Any],
        execution: dict[str, Any],
        decision: dict[str, Any],
        next_scan_seconds: int,
    ) -> str:
        balance = execution.get("balance") if isinstance(execution.get("balance"), dict) else {}
        positions = execution.get("positions") if isinstance(execution.get("positions"), list) else []
        pending_pre_signals = updated_runtime.get("pending_pre_signals") or []
        meta = market_cache.get("_meta") if isinstance(market_cache.get("_meta"), dict) else {}
        actions = decision.get("actions") if isinstance(decision.get("actions"), list) else []
        pass_wait = sum(1 for item in actions if "[PASS-WAIT]" in str(item.get("reason") or ""))
        pass_rule = sum(1 for item in actions if "[PASS-RULE]" in str(item.get("reason") or ""))
        pre_signal_text = "、".join(str(item) for item in pending_pre_signals[:4]) if pending_pre_signals else "无"
        balance_value = (
            balance.get("available_balance")
            or balance.get("balance")
            or balance.get("wallet_balance")
            or "-"
        )
        # 提取市场总结
        market_summary = decision.get('market_summary') or {}
        regime = market_summary.get('regime', '-') if isinstance(market_summary, dict) else str(market_summary)[:200]
        best_candidate = market_summary.get('best_candidate', '-') if isinstance(market_summary, dict) else '-'
        trade_posture = market_summary.get('trade_posture', '-') if isinstance(market_summary, dict) else '-'

        # 格式化余额
        try:
            balance_num = float(str(balance_value).replace(',', '').replace('$', ''))
            balance_formatted = f"${balance_num:,.2f}"
        except:
            balance_formatted = str(balance_value)

        return "\n".join(
            [
                "━━━━━━━━━━━━━━━━━━━━",
                f"📊 PA交易 Loop #{updated_runtime.get('loop_seq')}",
                "━━━━━━━━━━━━━━━━━━━━",
                "",
                f"💰 余额: {balance_formatted}",
                f"📈 持仓: {len(positions)} 个",
                f"🎯 预信号: {pre_signal_text}",
                "",
                f"📊 累计统计",
                f"  • 信号: {meta.get('total_signals', 0)}",
                f"  • 交易: {meta.get('total_trades', 0)}",
                f"  • PASS: {meta.get('total_passes', 0)}",
                "",
                f"🎯 本轮最佳品种: {best_candidate}",
                "",
                f"📝 策略",
                f"{trade_posture[:200]}",
                "",
                f"📉 市场概况",
                f"{regime[:200]}",
                "",
                f"⏱️ 下轮扫描: {next_scan_seconds} 秒后",
                "━━━━━━━━━━━━━━━━━━━━",
            ]
        )

    def render_push_card(
        self,
        cycle_id: str,
        runtime: dict[str, Any],
        decision: dict[str, Any],
        execution: dict[str, Any],
        execution_results: list[dict[str, Any]],
        next_scan_seconds: int,
        next_scan_info: dict[str, Any] | None,
        trigger: dict[str, Any] | None,
        quick_scan_events: dict[str, Any],
        analysis_board: dict[str, Any] | None = None,
    ) -> str:
        runtime_state = runtime if isinstance(runtime, dict) else {}
        next_scan_info = next_scan_info if isinstance(next_scan_info, dict) else {}
        can_trade = execution.get("can_trade") if isinstance(execution.get("can_trade"), dict) else {}
        positions = execution.get("positions") if isinstance(execution.get("positions"), list) else []
        orders = execution.get("orders") if isinstance(execution.get("orders"), list) else []
        actions = [item for item in (decision.get("actions") or []) if isinstance(item, dict)]
        position_management = [item for item in (decision.get("position_management") or []) if isinstance(item, dict)]
        execution_results = [item for item in execution_results if isinstance(item, dict)]
        symbol_updates = decision.get("symbol_updates") or {}

        def phase_cn(value: str) -> str:
            mapping = {
                "BOOTSTRAP": "初始化扫描",
                "SCAN": "全市场扫描",
                "WATCH": "观察阶段",
                "PRE_SIGNAL": "预信号",
                "ENTRY_READY": "临近触发",
                "IN_TRADE": "持仓中",
                "MANAGE": "管理持仓",
                "EXIT": "退出阶段",
                "COOLDOWN": "冷却期",
            }
            return mapping.get(str(value), str(value))

        def market_state_cn(value: str) -> str:
            mapping = {
                "TR": "区间",
                "BO": "突破",
                "TC": "紧通道",
                "BC": "宽通道",
                "SC": "高潮反转",
            }
            return mapping.get(str(value).upper(), str(value))

        def status_cn(value: str) -> str:
            mapping = {
                "watching": "继续观察",
                "pre_signal": "预信号",
                "entry_ready": "候选单",
                "entry_ready_blocked": "候选单（规则待通过）",
                "in_trade": "持仓中",
                "manage": "正在管理",
                "cooldown": "冷却中",
            }
            return mapping.get(str(value), str(value))

        def scan_reason_cn() -> str:
            focus = decision.get("focus_symbols") or []
            exchange = self.configured_exchange()
            if exchange == "ctrader":
                if focus:
                    return "当前按外汇 / 指数 / 贵金属观察名单复扫，优先盯住最接近触发点的主流品种。"
                return "当前按多资产观察名单复扫。"
            if "BTCUSDT" in focus or "ETHUSDT" in focus:
                if "BNBUSDT" in focus:
                    return "BTC、ETH 仍最接近触发点，BNB 也在区间边缘，需要继续快扫确认。"
                return "BTC、ETH 仍最接近触发点，需要继续快扫确认。"
            if "BNBUSDT" in focus:
                return "BNB 仍在关键区间边缘，需要继续确认。"
            return "继续按照当前观察名单复扫。"

        def trim_text(value: Any, limit: int = 180) -> str:
            text = " ".join(str(value or "").split())
            if not text:
                return "-"
            if len(text) <= limit:
                return text
            return text[: limit - 1].rstrip() + "…"

        def action_state_cn(patch: dict[str, Any], action: dict[str, Any], result: dict[str, Any]) -> str:
            result_status = str(result.get("status") or "")
            action_type = str(action.get("type") or "").upper()
            patch_status = str(patch.get("status") or "").lower()
            planned_trade = patch.get("planned_trade") if isinstance(patch.get("planned_trade"), dict) else {}
            candidate_stage = str(planned_trade.get("candidate_stage_cn") or "").strip()
            if result_status in {"FILLED", "PLACED", "MODIFIED", "closed", "CLOSED", "NEW"}:
                return "已执行"
            if action_type == "OPEN_ORDER":
                if result_status == "VALIDATION_REJECTED":
                    return "候选单（规则拒绝）"
                if result_status in {"BLOCKED", "SIZE_FAILED", "FAILED"}:
                    return "候选单（执行受阻）"
                return candidate_stage or "候选单"
            if candidate_stage:
                return candidate_stage
            if patch_status == "entry_ready_blocked":
                return "候选单（规则待通过）"
            if patch_status == "entry_ready":
                return "候选单"
            if patch_status == "pre_signal":
                return "预信号"
            if patch_status in {"in_trade", "manage"}:
                return "持仓管理"
            return status_cn(str(patch.get("status") or "-"))

        def event_text(symbol: str) -> str:
            def format_event(raw: Any) -> str:
                text = str(raw or "").strip()
                if not text:
                    return ""
                mapping = {
                    "ema_touch": "EMA回踩",
                    "wedge_or_mtr": "楔形/MTR",
                    "cached_pre_signal": "沿用预信号",
                }
                if text in mapping:
                    return mapping[text]
                if text.startswith("signal_trigger:"):
                    return "触发:" + text.split(":", 1)[1]
                if text.startswith("hl_signal:"):
                    return "高低点:" + text.split(":", 1)[1]
                if text.startswith("state_change:"):
                    return "状态切换:" + text.split(":", 1)[1].replace("->", "→")
                if text.startswith("state:"):
                    return "状态:" + text.split(":", 1)[1]
                if text.startswith("tr_edge:"):
                    edge = text.split(":", 1)[1]
                    return {"top": "区间上沿", "bottom": "区间下沿"}.get(edge, edge)
                if text.startswith("pb_depth:"):
                    depth = text.split(":", 1)[1]
                    return {"deep": "回撤偏深", "shallow": "回撤偏浅", "normal": "回撤正常", "too_deep": "回撤过深"}.get(depth, depth)
                if text.startswith("first_pb:"):
                    token = text.split(":", 1)[1]
                    return {"bull_pb": "首次回踩多", "bear_pb": "首次回踩空"}.get(token, token)
                return text

            event_map = quick_scan_events.get(symbol) if isinstance(quick_scan_events, dict) else {}
            if not isinstance(event_map, dict):
                return "-"
            parts: list[str] = []
            for timeframe in ("5m", "15m", "1h", "30m", "4h", "1d"):
                items = event_map.get(timeframe)
                if isinstance(items, list) and items:
                    pretty = [format_event(item) for item in items[:2]]
                    pretty = [item for item in pretty if item]
                    if pretty:
                        parts.append(f"{timeframe}:{' / '.join(pretty)}")
            return "；".join(parts)[:160] if parts else "-"

        def action_for_symbol(symbol: str) -> dict[str, Any]:
            for action in actions:
                if isinstance(action, dict) and str(action.get("symbol") or "").upper() == symbol:
                    return action
            return {}

        def management_for_symbol(symbol: str) -> dict[str, Any]:
            for item in position_management:
                if isinstance(item, dict) and str(item.get("symbol") or "").upper() == symbol:
                    return item
            return {}

        def chart_for_symbol(symbol: str) -> dict[str, Any]:
            if not analysis_board or not isinstance(analysis_board, dict):
                return {}
            board = analysis_board.get(symbol) if isinstance(analysis_board.get(symbol), dict) else {}
            return board.get("chart_context") if isinstance(board.get("chart_context"), dict) else {}

        def execution_result_for_symbol(symbol: str) -> dict[str, Any]:
            for item in execution_results:
                if isinstance(item, dict) and str(item.get("symbol") or "").upper() == symbol:
                    return item
            return {}

        def collect_refs() -> list[str]:
            ordered: list[str] = []
            for bucket in (actions, position_management):
                for item in bucket:
                    if not isinstance(item, dict):
                        continue
                    for ref in normalize_refs(item.get("refs")):
                        if ref not in ordered:
                            ordered.append(ref)
            return ordered[:8]

        def concise_action_text(action: dict[str, Any], manage_item: dict[str, Any], patch: dict[str, Any]) -> str:
            action_type = canonical_action_type(action.get("type"))
            side = str(action.get("side") or (patch.get("entry_idea") or {}).get("side") or "").upper()
            style = str(action.get("style") or (patch.get("entry_idea") or {}).get("style") or "").strip()
            planned_trade = patch.get("planned_trade") if isinstance(patch.get("planned_trade"), dict) else {}
            candidate_stage = str(planned_trade.get("candidate_stage_cn") or "").strip()
            execution_mode = str(planned_trade.get("execution_mode_cn") or "").strip()
            label_map = {
                "OPEN_ORDER": "准备开仓",
                "PARTIAL_CLOSE": "分批减仓",
                "CLOSE_POSITION": "平仓",
                "MODIFY_STOP_LOSS": "移动止损",
                "MODIFY_TAKE_PROFIT": "调整止盈",
                "CANCEL_ALL_ORDERS": "撤销挂单",
                "LOG_ONLY": "仅记录",
            }
            label = label_map.get(action_type or "", "观察")
            side_text = {"BUY": "做多", "SELL": "做空"}.get(side, "")
            base = " ".join(part for part in [label, side_text, style, candidate_stage, execution_mode] if part)
            reason = manage_item.get("reason") if isinstance(manage_item, dict) and manage_item.get("reason") else action.get("reason")
            if base and reason:
                return f"{base}｜{trim_text(reason, 100)}"
            return base or trim_text(reason, 100)

        def local_summary_cn() -> str:
            if positions:
                return "当前存在持仓，本轮优先做 premise check、保护性止损和退出管理。"
            if actions and all(str(action.get("type") or "") == "LOG_ONLY" for action in actions):
                focus_notes = [
                    f"{symbol}:{status_cn(str((symbol_updates.get(symbol) or {}).get('status') or '-'))}"
                    for symbol in (decision.get("focus_symbols") or [])[:3]
                ]
                if focus_notes:
                    return "当前没有满足完整触发条件的入场机会，继续观察。重点监控 " + " / ".join(focus_notes) + "。"
                return "当前没有满足完整触发条件的入场机会，本轮继续观察。"
            if actions:
                return "已有明确动作候选，优先根据图形、风控和执行可用性处理。"
            return "本轮没有新增动作，继续按观察名单复扫。"

        def local_explanation_cn() -> str:
            if not can_trade_ok:
                return "当前首先受执行条件限制，即使图形接近可做，也不能直接下单。"
            if positions:
                return "当前重点不是找新单，而是确认原始 premise 是否仍成立，以及是否需要移损或退出。"
            return "当前重点仍是等信号K线完成、确认触发有效，并且让 post-fee Trader's Equation 达标。"

        focus_text = ", ".join(decision.get("focus_symbols") or []) or "-"
        can_trade_ok = bool(can_trade.get("can_trade"))
        trade_text = "可以" if can_trade_ok else "不可以"
        trade_reason = str(can_trade.get("reason") or "-")
        dry_run_text = "是" if self.config.dry_run else "否"
        exchange = self.configured_exchange()
        title_text = {
            "ctrader": "🦁 PA交易 Multi-Asset｜巡逻报告",
            "okx": "🦁 PA交易 OKX｜巡逻报告",
        }.get(exchange, "🦁 PA交易 Crypto｜巡逻报告")
        knowledge_loading = (decision.get("state_patch") or {}).get("knowledge_loading") or {}
        monitoring = self.monitoring_snapshot(knowledge_loading)
        refs_text = ", ".join(collect_refs()) or "-"
        summary_text = trim_text(decision.get("market_summary"), 260)
        explanation_text = trim_text(decision.get("explanation"), 320)
        knowledge_text = (
            f"skill={knowledge_loading.get('skill_mode', '-')}"
            f" | refs完整={knowledge_loading.get('full_reference_count', 0)}"
        )
        skill_sections = knowledge_loading.get("skill_sections") if isinstance(knowledge_loading.get("skill_sections"), list) else []
        skill_sections_text = " / ".join(str(item) for item in skill_sections[:6]) if skill_sections else "-"

        lines = [
            title_text,
            "",
            "━━ 当前状态 ━━",
            f"• 轮次: {cycle_id}",
            f"• 阶段: {phase_cn(str(decision.get('phase', '-')))}",
            f"• 关注品种: {focus_text}",
            f"• 当前可交易: {trade_text} ({trade_reason})",
            f"• 持仓 / 挂单 / dry-run: {len(positions)} / {len(orders)} / {dry_run_text}",
            "• 读盘窗口: 后端每周期 150 根，浏览 80 根，精读最近 20 根",
        ]

        if trigger:
            trigger_text = f"{trigger.get('trigger_type', '-')}"
            if trigger.get("symbol"):
                trigger_text += f" {trigger.get('symbol')}"
            if trigger.get("interval"):
                trigger_text += f" {trigger.get('interval')}"
            lines.append(f"• 触发来源: {trigger_text}")

        lines.extend(
            [
                "",
                "━━ 巡逻结论 ━━",
                f"• 总结: {local_summary_cn()}",
                f"• 模型结论: {summary_text}",
            ]
        )

        focus_symbols = [str(item).upper() for item in (decision.get("focus_symbols") or [])]
        for symbol in focus_symbols[:3]:
            patch = (symbol_updates.get(symbol) or {}) if isinstance(symbol_updates, dict) else {}
            action = action_for_symbol(symbol)
            manage_item = management_for_symbol(symbol)
            result = execution_result_for_symbol(symbol)
            rank = focus_symbols.index(symbol) + 1
            direction = str(patch.get("ai_direction") or action.get("ai_direction") or "-")
            market_state = str(patch.get("market_state") or action.get("market_state") or "-")
            thesis = trim_text(
                patch.get("thesis")
                or patch.get("structure_summary")
                or patch.get("market_state_detail")
                or "-",
                140,
            )
            pre_signal = format_pre_signal_text(patch.get("pre_signal") or patch.get("signal") or "-")
            equation = trim_text(
                action.get("equation")
                or ((patch.get("evaluation") or {}).get("equation") if isinstance(patch.get("evaluation"), dict) else "")
                or "-",
                120,
            )
            entry_idea = patch.get("entry_idea") if isinstance(patch.get("entry_idea"), dict) else {}
            planned_trade = patch.get("planned_trade") if isinstance(patch.get("planned_trade"), dict) else {}
            planned_summary = ""
            if planned_trade:
                planned_bits = [
                    str(planned_trade.get("candidate_stage_cn") or "").strip(),
                    str(planned_trade.get("execution_mode_cn") or "").strip(),
                    order_type_cn(str(planned_trade.get("order_type") or "").strip()),
                    {"BUY": "做多", "SELL": "做空"}.get(str(planned_trade.get("side") or "").upper(), ""),
                    str(planned_trade.get("style") or "").strip(),
                ]
                planned_bits = [item for item in planned_bits if item]
                if planned_bits:
                    planned_summary = "计划委托｜" + " ".join(planned_bits)
            entry_text = trim_text(
                concise_action_text(action, manage_item, patch)
                or entry_idea.get("idea")
                or entry_idea.get("setup")
                or entry_idea.get("summary")
                or planned_summary
                or "-",
                140,
            )
            result_text = "-"
            if result:
                status = str(result.get("status") or "-")
                if status == "LOG_ONLY":
                    result_text = "仅记录，不执行"
                elif status.startswith("DRY_RUN"):
                    result_text = "已通过校验，当前仅 dry-run"
                elif status in {"FILLED", "PLACED", "MODIFIED", "NEW", "closed", "CLOSED"}:
                    result_text = "已执行"
                elif status == "VALIDATION_REJECTED":
                    result_text = "规则拒绝｜" + format_gate_message(result.get("message") or status)
                else:
                    result_text = format_gate_message(result.get("message") or status)
            price_text = format_trigger_prices_text(
                planned_trade
                or ((patch.get("pre_signal") or {}).get("trigger_price") if isinstance(patch.get("pre_signal"), dict) else action)
            )
            stage_text = action_state_cn(patch, action, result)
            direction_text = format_ai_direction_text(direction)

            lines.extend(
                [
                    "",
                    f"━━ {rank}. {symbol}｜{stage_text} ━━",
                    f"• 方向: {direction_text}",
                    f"• 市场状态: {market_state_cn(market_state)}",
                    f"• Brooks 分类: {trim_text((patch.get('brooks_filter') or {}).get('label') or '-', 80)}",
                    f"• 升级条件: {trim_text((patch.get('brooks_filter') or {}).get('upgrade_condition') or '-', 120)}",
                    f"• 触发事件: {event_text(symbol)}",
                    f"• 结构: {thesis}",
                    f"• 入场条件: {pre_signal}",
                    f"• 计划价位: {price_text}",
                    f"• 执行语义: {trim_text((planned_trade.get('candidate_stage_cn') or '-') + '｜' + (planned_trade.get('execution_mode_cn') or '-') + '｜' + order_type_cn(planned_trade.get('order_type') or '-'), 140)}",
                    f"• 交易方程: {equation}",
                    f"• 候选动作: {entry_text}",
                    f"• 最终执行: {result_text}",
                ]
            )
            chart_context = chart_for_symbol(symbol)
            chart_files = ", ".join(str(item) for item in (chart_context.get("chart_files") or [])[:3]) or "-"
            primary_chart = chart_context.get("primary_chart_path") or "-"
            lines.extend(
                [
                    f"• 图表文件: {chart_files}",
                    f"• Web查看: http://127.0.0.1:3001/pa-bot（图: {primary_chart}）",
                ]
            )

        if positions:
            lines.extend(["", "━━ 持仓管理 ━━"])
            for item in positions[:5]:
                symbol = str(item.get("symbol") or "-")
                manage_item = management_for_symbol(symbol)
                premise = trim_text(manage_item.get("reason") if isinstance(manage_item, dict) else "-", 120)
                lines.append(
                    f"• {symbol}: {item.get('side')} @ {item.get('entry_price')} | 浮盈亏 {item.get('unrealized_pnl')} | 管理结论: {premise}"
                )

        show_debug = bool(trigger) or bool(positions) or any(
            str(item.get("status") or "") not in {"", "LOG_ONLY", "SKIPPED", "NO_ACTION"}
            for item in execution_results
            if isinstance(item, dict)
        ) or int(runtime_state.get("loop_seq") or 0) % 6 == 0
        if show_debug:
            lines.extend(
                [
                    "",
                    "━━ 调试信息 ━━",
                    f"• 参考文件: {refs_text}",
                    f"• 知识加载: {knowledge_text}",
                    (
                        f"• 上下文监控: knowledge {monitoring.get('knowledge_chars') or '-'}"
                        f" | refs {monitoring.get('refs_count') or 0}"
                        f" | request {monitoring.get('request_chars') or '-'}"
                        f" | session_age {monitoring.get('session_age_seconds') or '-'}s"
                    ),
                    f"• Skill章节: {trim_text(skill_sections_text, 180)}",
                    f"• 原始模型解释: {explanation_text}",
                    "• 图表上下文: chart_gen.py + ab_ema / ab_sr / ab_mm / ab_patterns 已接入分析板",
                ]
            )
        lines.extend(
            [
                "",
                "━━ 下一次扫描 ━━",
                f"• 时间: {next_scan_seconds} 秒后",
                f"• 模型建议: {next_scan_info.get('model_suggested_seconds') or decision.get('next_scan_seconds') or '-'} 秒 / {trim_text(next_scan_info.get('model_suggested_reason') or decision.get('next_scan_reason') or '-', 120)}",
                f"• 系统分桶: {next_scan_info.get('in_seconds') or next_scan_seconds} 秒 / {trim_text(next_scan_info.get('reason_text') or next_scan_info.get('reason_code') or '-', 120)}",
                f"• 分桶规则: {trim_text(next_scan_info.get('bucket_rule') or '-', 120)}",
                f"• 规则来源: {', '.join(str(item) for item in (next_scan_info.get('bucket_source_refs') or [])[:4]) or '-'}",
                f"• 巡逻说明: {scan_reason_cn()}",
                f"• 推送时间: {datetime.now().astimezone().strftime('%Y-%m-%d %H:%M:%S %Z')}",
            ]
        )
        return "\n".join(lines)[:4000]

    def should_push_cycle_card(
        self,
        runtime: dict[str, Any],
        updated_runtime: dict[str, Any],
        decision: dict[str, Any],
        execution: dict[str, Any],
        execution_results: list[dict[str, Any]],
        pre_signal_notices: list[dict[str, Any]],
        trigger: dict[str, Any] | None,
    ) -> bool:
        # 1. 有触发事件（手动触发、外部信号等）
        if trigger:
            return True

        # 2. 有预信号通知
        if pre_signal_notices:
            return True

        # 3. 有持仓（需要持续监控）
        positions = execution.get("positions") if isinstance(execution.get("positions"), list) else []
        if positions:
            return True

        # 4. 有实际执行的订单（开仓、平仓、调整止损止盈）
        for item in execution_results:
            status = str(item.get("status") or "")
            if status and status not in {"LOG_ONLY", "SKIPPED", "NO_ACTION"}:
                return True

        # 5. 有重要的状态变化（entry_ready、in_trade 等）
        for patch in (decision.get("symbol_updates") or {}).values():
            status = str((patch or {}).get("status") or "")
            if status in {"entry_ready", "entry_ready_blocked", "in_trade", "manage"}:
                return True

        # 6. LLM 超时不推送（避免噪音）
        if bool((decision.get("state_patch") or {}).get("model_timeout")):
            return False

        # 7. 市场总结发生变化（重要的市场状态改变）
        previous_summary = str(runtime.get("last_scan_decision") or "").strip()
        current_summary = str(decision.get("market_summary") or "").strip()
        if previous_summary and current_summary and previous_summary != current_summary:
            return True

        # 8. 默认不推送（只在有意义的事件时推送，避免每轮都推送）
        return False

    def push_telegram_update(self, message: str) -> dict[str, Any]:
        if not self.config.post_to_telegram:
            return {"ok": False, "skipped": True}
        direct = self.openclaw_message_send(message)
        if not direct.get("_error"):
            return direct
        payload = {
            "chat_id": self.config.telegram_chat_id,
            "message_thread_id": self.config.telegram_thread_id,
            "message": message,
            "disable_notification": True,
        }
        fallback = self.http_post_telegram(payload)
        return {"openclaw": direct, "fallback": fallback}

    def push_telegram_photo(self, photo_path: str | None, caption: str) -> dict[str, Any]:
        if not self.config.post_to_telegram:
            return {"ok": False, "skipped": True, "reason": "telegram_disabled"}
        absolute_path = self.chart_absolute_path(photo_path)
        if absolute_path is None:
            return {"ok": False, "skipped": True, "reason": "photo_missing"}
        direct = self.telegram_api_send_photo(absolute_path, caption)
        if not direct.get("_error"):
            return {"mode": "direct_bot_api", **direct}
        payload = {
            "chat_id": self.config.telegram_chat_id,
            "message_thread_id": self.config.telegram_thread_id,
            "message": "",
            "caption": caption[:1024],
            "photo_path": str(absolute_path),
            "disable_notification": True,
        }
        via_forward = self.http_post_telegram(payload)
        if not via_forward.get("_error"):
            return {"mode": "forward", **via_forward}
        direct_openclaw = self.openclaw_photo_send(absolute_path, caption)
        if not direct_openclaw.get("_error"):
            return {"mode": "openclaw", **direct_openclaw}
        return {
            "ok": False,
            "mode": "photo_failed",
            "direct_bot_api": direct,
            "forward": via_forward,
            "openclaw": direct_openclaw,
        }
