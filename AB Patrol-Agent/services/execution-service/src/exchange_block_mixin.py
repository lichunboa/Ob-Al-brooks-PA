"""交易所阻断状态混入。"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from .config import SHARED_WORKSPACE

logger = logging.getLogger(__name__)

EXCHANGE_BLOCK_STATE_FILE = SHARED_WORKSPACE / "exchange_block_state.json"


class ExchangeBlockMixin:
    """交易所级别阻断状态持久化与识别。"""

    def _normalized_exchange_block_map(self, payload: Any) -> dict[str, dict[str, Any]]:
        """兼容历史单值结构，统一转成 exchange -> payload 映射。"""
        if not isinstance(payload, dict) or not payload:
            return {}
        if "blocked" in payload:
            exchange = str(payload.get("exchange") or self.exchange_name or "binance").strip().lower()
            return {exchange: payload}
        normalized: dict[str, dict[str, Any]] = {}
        for exchange, block_payload in payload.items():
            if not isinstance(block_payload, dict):
                continue
            normalized[str(exchange or "").strip().lower()] = block_payload
        return normalized

    def _load_exchange_block_state(self) -> dict[str, Any]:
        """加载交易所级别阻断状态。"""
        try:
            if EXCHANGE_BLOCK_STATE_FILE.exists():
                payload = json.loads(EXCHANGE_BLOCK_STATE_FILE.read_text(encoding="utf-8"))
                return self._normalized_exchange_block_map(payload)
        except Exception as exc:
            logger.warning("加载交易所阻断状态失败: %s", exc)
        return {}

    def _save_exchange_block_state(self) -> None:
        """保存交易所级别阻断状态。"""
        try:
            EXCHANGE_BLOCK_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
            EXCHANGE_BLOCK_STATE_FILE.write_text(
                json.dumps(self._exchange_block_state, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )
        except Exception as exc:
            logger.warning("保存交易所阻断状态失败: %s", exc)

    def get_exchange_block_status(self) -> dict[str, Any]:
        """获取当前交易所阻断状态。"""
        payload_map = self._normalized_exchange_block_map(self._exchange_block_state)
        payload = payload_map.get(str(self.exchange_name or "").strip().lower(), {})
        return {
            "blocked": bool(payload.get("blocked")),
            "code": str(payload.get("code") or ""),
            "reason": str(payload.get("reason") or ""),
            "detail": str(payload.get("detail") or ""),
            "updated_at": str(payload.get("updated_at") or ""),
            "exchange": str(payload.get("exchange") or self.exchange_name),
        }

    def _clear_exchange_block_state(self, code: str | None = None) -> None:
        """清理交易所阻断状态。"""
        current = self.get_exchange_block_status()
        if not current.get("blocked"):
            return
        if code and current.get("code") != code:
            return
        payload_map = self._normalized_exchange_block_map(self._exchange_block_state)
        payload_map.pop(str(self.exchange_name or "").strip().lower(), None)
        self._exchange_block_state = payload_map
        self._save_exchange_block_state()

    def _mark_exchange_block_state(self, code: str, reason: str, detail: str) -> None:
        """写入交易所阻断状态。"""
        payload_map = self._normalized_exchange_block_map(self._exchange_block_state)
        payload_map[str(self.exchange_name or "").strip().lower()] = {
            "blocked": True,
            "code": code,
            "reason": reason,
            "detail": detail,
            "exchange": self.exchange_name,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        self._exchange_block_state = payload_map
        self._save_exchange_block_state()

    def _clear_exchange_block_on_private_success(self) -> None:
        """私有接口已经成功时，清除当前交易所的旧阻断状态。"""
        if str(self.exchange_name or "").strip().lower() != "binance":
            return
        self._clear_exchange_block_state("BINANCE_REGION_RESTRICTED")

    def _capture_exchange_block(self, error: Exception | str) -> dict[str, Any] | None:
        """识别并记录交易所级别阻断问题。"""
        text = str(error or "").strip()
        lowered = text.lower()

        if self.exchange_name == "binance" and (
            "restricted location" in lowered
            or ("451" in lowered and "service unavailable" in lowered)
            or "eligibility" in lowered
        ):
            block = {
                "code": "BINANCE_REGION_RESTRICTED",
                "reason": "Binance Demo 受地域限制，当前环境无法实际下单",
                "detail": text,
            }
            self._mark_exchange_block_state(block["code"], block["reason"], block["detail"])
            return block

        return None
