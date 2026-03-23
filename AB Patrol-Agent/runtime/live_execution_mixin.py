#!/usr/bin/env python3
"""live 执行动作链。"""

from __future__ import annotations

import json
from typing import Any

from utils import safe_float, utc_iso


class LiveExecutionMixin:
    """抽离实盘动作执行。"""

    @staticmethod
    def _execution_block_reason(payload: dict[str, Any] | None) -> str:
        """把 execution-service 返回的阻断原因统一收口。"""
        if not isinstance(payload, dict):
            return "-"
        exchange_block = payload.get("exchange_block") if isinstance(payload.get("exchange_block"), dict) else {}
        for candidate in (
            exchange_block.get("reason"),
            exchange_block.get("code"),
            payload.get("reason"),
            payload.get("position_fetch_error"),
            payload.get("_error"),
        ):
            text = str(candidate or "").strip()
            if text and text != "-":
                return text
        return "-"

    def execute_action(self, action: dict[str, Any], execution: dict[str, Any]) -> dict[str, Any]:
        action_type = str(action.get("type") or "").upper()
        symbol = str(action.get("symbol") or "")
        target_exchange = self.exchange_for_symbol(symbol) if symbol else self.configured_exchange()
        target_base_url = self.execution_base_for_symbol(symbol) if symbol else self.config.execution_base
        is_ctrader_target = target_exchange == "ctrader"
        can_trade_timeout = 8 if is_ctrader_target else 4
        size_timeout = 12 if is_ctrader_target else 8
        order_timeout = 45 if is_ctrader_target else 20
        control_timeout = 30 if is_ctrader_target else 20
        services = execution.get("services") if isinstance(execution.get("services"), dict) else {}
        service_bundle = services.get(target_exchange) if isinstance(services.get(target_exchange), dict) else {}
        target_can_trade = service_bundle.get("can_trade") if isinstance(service_bundle.get("can_trade"), dict) else (
            execution.get("can_trade") if isinstance(execution.get("can_trade"), dict) else {}
        )
        result: dict[str, Any] = {
            "type": action_type,
            "symbol": symbol,
            "exchange": target_exchange,
            "execution_base": target_base_url,
            "dry_run": self.config.dry_run,
            "started_at": utc_iso(),
        }
        action_snapshot = {
            key: action.get(key)
            for key in (
                "symbol",
                "side",
                "entry",
                "entry_price",
                "sl",
                "stop_loss",
                "tp",
                "take_profit",
                "strategy",
                "style",
                "intent",
                "risk_percent",
                "reentry_attempt",
                "followup_profile",
                "playbook_hint",
                "playbook_id",
                "market_state",
            )
            if action.get(key) not in (None, "")
        }
        if action_snapshot:
            result["action_snapshot"] = action_snapshot

        if action_type == "LOG_ONLY":
            result["success"] = True
            result["status"] = "LOG_ONLY"
            result["message"] = action.get("reason") or action.get("strategy") or "log only"
            return result

        if action_type == "OPEN_ORDER":
            intent = str(action.get("intent") or "").upper()
            if intent not in {"ADD_ON", "SCALE_IN", "PYRAMID_ADD"}:
                preflight_execution, preflight_meta = self._live_entry_preflight_snapshot(
                    symbol,
                    execution,
                    base_url=target_base_url,
                )
                result["live_preflight"] = preflight_meta
                strategy_key = self._live_strategy_key_from_action(action)
                result["live_strategy_key"] = strategy_key or None
                entry_blocked, entry_block_reason = self._live_entry_conflict(symbol, strategy_key, preflight_execution)
                if entry_blocked:
                    result["success"] = False
                    result["status"] = "LIVE_ENTRY_CONFLICT"
                    result["message"] = entry_block_reason
                    return result

            result["trade_gate"] = self.validate_trade_gate(action)
            if not result["trade_gate"].get("ok"):
                gate_message = result["trade_gate"].get("stdout") or result["trade_gate"].get("stderr") or "trade gate rejected"
                result["success"] = False
                result["status"] = "VALIDATION_REJECTED"
                result["message"] = gate_message
                return result

            if not target_can_trade.get("can_trade", False):
                block_reason = str(target_can_trade.get("reason") or "").lower()
                if not target_can_trade or block_reason in {"", "-", "unknown"} or any(
                    token in block_reason
                    for token in ("timed out", "timeout", "service_unavailable", "read operation timed out")
                ):
                    refreshed_can_trade = self.http_get_json(
                        f"/trading/can-trade/{self.config.execution_bot_id}",
                        base_url=target_base_url,
                        timeout=can_trade_timeout,
                    )
                    result["can_trade_refresh"] = refreshed_can_trade
                    if isinstance(refreshed_can_trade, dict) and refreshed_can_trade.get("can_trade", False):
                        target_can_trade = refreshed_can_trade
                    elif (
                        self._is_transport_block_reason(refreshed_can_trade)
                        and self._preflight_has_live_probe(result.get("live_preflight"))
                    ):
                        target_can_trade = {"can_trade": True, "reason": "transport_fallback_after_live_preflight"}
                        result["can_trade_transport_bypass"] = True

            if not target_can_trade.get("can_trade", False):
                exchange_block = (
                    target_can_trade.get("exchange_block")
                    if isinstance(target_can_trade.get("exchange_block"), dict)
                    else {}
                )
                block_code = str(exchange_block.get("code") or target_can_trade.get("reason") or "").strip()
                block_reason = str(exchange_block.get("reason") or target_can_trade.get("reason") or "").strip()
                result["success"] = False
                if block_code == "BINANCE_REGION_RESTRICTED":
                    result["status"] = "EXCHANGE_BLOCKED"
                    result["message"] = f"交易所阻断: {block_reason or block_code}"
                    result["exchange_block"] = exchange_block
                else:
                    result["status"] = "BLOCKED"
                    result["message"] = f"can_trade blocked: {self._execution_block_reason(target_can_trade)}"
                return result

            scale_ok, scale_message = self.validate_scale_in(action, execution)
            result["scale_in_gate"] = {"ok": scale_ok, "message": scale_message}
            if not scale_ok:
                result["success"] = False
                result["status"] = "S7_SCALE_IN_BLOCKED"
                result["message"] = scale_message
                return result

            risk_percent = self.action_risk_percent(action, execution)
            size = self.http_get_json(
                f"/trading/calculate-size/{self.config.execution_bot_id}",
                {
                    "symbol": symbol,
                    "entry_price": safe_float(action.get("entry")),
                    "stop_loss": safe_float(action.get("sl")),
                    "risk_percent": risk_percent,
                    "intent": str(action.get("intent") or ""),
                },
                base_url=target_base_url,
                timeout=size_timeout,
            )
            if (
                is_ctrader_target
                and isinstance(size, dict)
                and size.get("_error")
                and "timed out" in str(size.get("_error") or "").lower()
            ):
                retry_size = self.http_get_json(
                    f"/trading/calculate-size/{self.config.execution_bot_id}",
                    {
                        "symbol": symbol,
                        "entry_price": safe_float(action.get("entry")),
                        "stop_loss": safe_float(action.get("sl")),
                        "risk_percent": risk_percent,
                        "intent": str(action.get("intent") or ""),
                    },
                    base_url=target_base_url,
                    timeout=max(size_timeout, 18),
                )
                result["size_calc_retry"] = retry_size
                if isinstance(retry_size, dict) and not retry_size.get("_error"):
                    size = retry_size
            result["size_calc"] = size
            quantity = safe_float((size or {}).get("quantity"))
            if quantity <= 0:
                result["success"] = False
                result["status"] = "SIZE_FAILED"
                result["message"] = json.dumps(size, ensure_ascii=False)
                return result

            order_payload = {
                "symbol": symbol,
                "side": action.get("side"),
                "quantity": quantity,
                "order_type": action.get("order_type") or "MARKET",
                "price": action.get("price"),
                "stop_loss": action.get("sl"),
                "take_profit": action.get("tp"),
                "intent": action.get("intent"),
                "strategy": action.get("strategy"),
                "signal_source": action.get("signal_source") or self.config.operator_agent,
                "bot_id": self.config.execution_bot_id,
            }
            result["order_payload"] = order_payload
            if self.config.dry_run:
                result["success"] = True
                result["status"] = "DRY_RUN_VALIDATED"
                result["message"] = "dry-run 模式：已完成仓位计算并生成订单载荷，未实际发送"
                return result

            order_resp = self.http_post_json("/order", order_payload, base_url=target_base_url, timeout=order_timeout)
            result["response"] = order_resp
            if isinstance(order_resp, dict) and order_resp.get("_error"):
                reconcile = self._reconcile_post_order_transport_error(
                    symbol,
                    action,
                    base_url=target_base_url,
                )
                result["post_order_reconcile"] = reconcile
                if reconcile.get("success"):
                    result["success"] = True
                    result["status"] = str(reconcile.get("status") or "PLACED_RECONCILED")
                    result["message"] = str(reconcile.get("message") or "")
                    return result
                result["success"] = False
                result["status"] = "UNKNOWN"
                result["message"] = str(order_resp.get("_error") or reconcile.get("message") or "")
                return result
            result["success"] = bool(order_resp.get("success"))
            result["status"] = order_resp.get("status", "UNKNOWN")
            result["message"] = order_resp.get("message")
            return result

        if action_type in {"PARTIAL_CLOSE", "REDUCE_POSITION"}:
            positions = execution.get("positions") if isinstance(execution.get("positions"), list) else []
            normalized_symbol = self._normalize_live_symbol(symbol)
            live_position = next(
                (
                    item
                    for item in positions
                    if isinstance(item, dict)
                    and self._normalize_live_symbol(item.get("symbol")) == normalized_symbol
                ),
                {},
            )
            live_qty = abs(
                safe_float(live_position.get("quantity"))
                or safe_float(live_position.get("contracts"))
                or safe_float(live_position.get("size"))
            )
            quantity = safe_float(action.get("quantity") or action.get("close_quantity"), 0.0)
            close_ratio = safe_float(action.get("close_ratio") or action.get("reduce_ratio") or action.get("ratio"), 0.0)
            if quantity <= 0 and close_ratio > 0 and live_qty > 0:
                quantity = round(live_qty * close_ratio, 8)
            result["position_quantity"] = live_qty
            result["close_quantity"] = quantity
            if quantity <= 0:
                result["success"] = False
                result["status"] = "SIZE_FAILED"
                result["message"] = "partial close 缺少可执行数量"
                return result
            if self.config.dry_run:
                result["success"] = True
                result["status"] = "DRY_RUN_PARTIAL_CLOSE"
                return result
            close_resp = self.http_post_json(
                f"/order/{symbol}/close",
                {},
                {"quantity": quantity, "bot_id": self.config.execution_bot_id},
                base_url=target_base_url,
                timeout=control_timeout,
            )
            result["response"] = close_resp
            result["success"] = bool(close_resp.get("success", True))
            result["status"] = close_resp.get("status", "UNKNOWN")
            result["message"] = close_resp.get("message")
            return result

        if action_type == "CLOSE_POSITION":
            quantity = safe_float(action.get("quantity") or action.get("close_quantity"), 0.0)
            if self.config.dry_run:
                result["success"] = True
                result["status"] = "DRY_RUN_CLOSE"
                if quantity > 0:
                    result["close_quantity"] = quantity
                return result
            close_resp = self.http_post_json(
                f"/order/{symbol}/close",
                {},
                {"bot_id": self.config.execution_bot_id, "quantity": quantity if quantity > 0 else None},
                base_url=target_base_url,
                timeout=control_timeout,
            )
            result["response"] = close_resp
            result["success"] = bool(close_resp.get("success", True))
            result["status"] = close_resp.get("status", "UNKNOWN")
            result["message"] = close_resp.get("message")
            return result

        if action_type == "MODIFY_STOP_LOSS":
            new_sl = action.get("new_stop_loss") or action.get("sl")
            if self.config.dry_run:
                result["success"] = True
                result["status"] = "DRY_RUN_MODIFY_SL"
                result["new_stop_loss"] = new_sl
                return result
            modify_resp = self.http_post_json(
                f"/order/{symbol}/modify-sl",
                {},
                {"new_stop_loss": safe_float(new_sl), "bot_id": self.config.execution_bot_id},
                base_url=target_base_url,
                timeout=control_timeout,
            )
            result["response"] = modify_resp
            result["success"] = "error" not in str(modify_resp).lower()
            result["status"] = "MODIFIED" if result["success"] else "FAILED"
            return result

        if action_type == "MODIFY_TAKE_PROFIT":
            new_tp = action.get("new_take_profit") or action.get("tp") or action.get("take_profit")
            if self.config.dry_run:
                result["success"] = True
                result["status"] = "DRY_RUN_MODIFY_TP"
                result["new_take_profit"] = new_tp
                return result
            modify_resp = self.http_post_json(
                f"/order/{symbol}/modify-tp",
                {},
                {"new_take_profit": safe_float(new_tp), "bot_id": self.config.execution_bot_id},
                base_url=target_base_url,
                timeout=control_timeout,
            )
            result["response"] = modify_resp
            result["success"] = bool(modify_resp.get("success"))
            result["status"] = modify_resp.get("status", "FAILED")
            result["message"] = modify_resp.get("message")
            return result

        if action_type in {"CANCEL_ALL_ORDERS", "CANCEL_PENDING_ENTRY"}:
            if self.config.dry_run:
                result["success"] = True
                result["status"] = "DRY_RUN_CANCEL_ORDERS"
                return result
            cancel_resp = self.http_delete_json("/orders", {"symbol": symbol or None}, base_url=target_base_url)
            result["response"] = cancel_resp
            result["success"] = bool(cancel_resp.get("success", True))
            result["status"] = "CANCELLED" if result["success"] else "FAILED"
            result["message"] = cancel_resp.get("message")
            return result

        result["success"] = False
        result["status"] = "UNSUPPORTED"
        result["message"] = f"unsupported action type: {action_type}"
        return result
