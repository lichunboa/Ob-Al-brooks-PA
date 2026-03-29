"""订单与持仓归属映射管理。"""

from __future__ import annotations

import json
import logging

from libs.common.market_symbols import normalize_bar_symbol, normalize_symbol_key

from .config import WORKSPACE

logger = logging.getLogger(__name__)

ORDER_BOT_MAP_FILE = WORKSPACE / "order_bot_map.json"
POSITION_BOT_MAP_FILE = WORKSPACE / "position_bot_map.json"


class BotRegistryMixin:
    """管理 order_id / symbol 与 bot_id 的归属映射。"""

    def _load_order_bot_map(self) -> dict:
        """加载 order_id -> {bot_id, symbol} 映射，兼容旧格式。"""
        try:
            if ORDER_BOT_MAP_FILE.exists():
                with open(ORDER_BOT_MAP_FILE, encoding="utf-8") as handle:
                    data = json.load(handle)

                migrated = False
                for order_id, value in list(data.items()):
                    if isinstance(value, str):
                        data[order_id] = {"bot_id": value, "symbol": ""}
                        migrated = True

                if migrated:
                    with open(ORDER_BOT_MAP_FILE, "w", encoding="utf-8") as handle:
                        json.dump(data, handle, indent=2)
                    logger.info("order_bot_map 已迁移到新格式")

                return data
        except Exception as exc:
            logger.warning(f"加载 order_bot_map 失败: {exc}")
        return {}

    def _save_order_bot_map(self):
        """保存 order_id -> bot_id 映射。"""
        try:
            ORDER_BOT_MAP_FILE.parent.mkdir(parents=True, exist_ok=True)
            with open(ORDER_BOT_MAP_FILE, "w", encoding="utf-8") as handle:
                json.dump(self._order_bot_map, handle, indent=2)
        except Exception as exc:
            logger.warning(f"保存 order_bot_map 失败: {exc}")

    def _load_position_bot_map(self) -> dict:
        """加载 symbol -> bot_id 持仓映射。"""
        try:
            if POSITION_BOT_MAP_FILE.exists():
                with open(POSITION_BOT_MAP_FILE, encoding="utf-8") as handle:
                    return json.load(handle)
        except Exception as exc:
            logger.warning(f"加载 position_bot_map 失败: {exc}")
        return {}

    def _save_position_bot_map(self):
        """保存 symbol -> bot_id 持仓映射。"""
        try:
            POSITION_BOT_MAP_FILE.parent.mkdir(parents=True, exist_ok=True)
            with open(POSITION_BOT_MAP_FILE, "w", encoding="utf-8") as handle:
                json.dump(self._position_bot_map, handle, indent=2)
        except Exception as exc:
            logger.warning(f"保存 position_bot_map 失败: {exc}")

    def _norm_position_key(self, symbol: str) -> str:
        """标准化 position_bot_map key 为 `XXXUSDT:USDT` 格式。"""
        normalized = normalize_bar_symbol(symbol)
        if ":" not in normalized:
            normalized += ":USDT"
        return normalized

    def register_position(
        self,
        symbol: str,
        bot_id: str,
        strategy: str = "auto",
        quantity: float = 0,
        side: str = "",
    ):
        """注册持仓归属。"""
        if not (bot_id and symbol):
            return

        key = self._norm_position_key(symbol)
        entry = {"bot_id": bot_id, "strategy": strategy, "quantity": quantity, "side": side}
        existing = self._position_bot_map.get(key)

        if isinstance(existing, list):
            for index, item in enumerate(existing):
                if isinstance(item, dict) and item.get("bot_id") == bot_id:
                    existing[index] = entry
                    break
            else:
                existing.append(entry)
        elif isinstance(existing, dict):
            if existing.get("bot_id") == bot_id:
                self._position_bot_map[key] = [entry]
            else:
                self._position_bot_map[key] = [existing, entry]
        elif isinstance(existing, str):
            if existing == bot_id:
                self._position_bot_map[key] = [entry]
            else:
                self._position_bot_map[key] = [{"bot_id": existing, "strategy": "auto"}, entry]
        else:
            self._position_bot_map[key] = [entry]

        self._save_position_bot_map()

    def unregister_position(self, symbol: str, bot_id: str = None):
        """注销持仓归属。"""
        key = self._norm_position_key(symbol)
        existing = self._position_bot_map.get(key)
        if existing is None:
            return

        if bot_id is None:
            del self._position_bot_map[key]
        elif isinstance(existing, list):
            self._position_bot_map[key] = [
                item for item in existing if not (isinstance(item, dict) and item.get("bot_id") == bot_id)
            ]
            if not self._position_bot_map[key]:
                del self._position_bot_map[key]
        elif isinstance(existing, dict) and existing.get("bot_id") == bot_id:
            del self._position_bot_map[key]
        elif existing == bot_id:
            del self._position_bot_map[key]

        self._save_position_bot_map()

    def get_position_bot_id(self, symbol: str) -> str | None:
        """查找持仓归属的主 bot_id。"""
        key = self._norm_position_key(symbol)
        value = self._position_bot_map.get(key)
        if isinstance(value, list):
            if value and isinstance(value[0], dict):
                return value[0].get("bot_id")
            return value[0] if value else None
        if isinstance(value, dict):
            return value.get("bot_id")
        return value

    def get_position_bot_ids(self, symbol: str) -> list:
        """获取某品种的全部 bot_id。"""
        key = self._norm_position_key(symbol)
        value = self._position_bot_map.get(key)
        if isinstance(value, list):
            return [item.get("bot_id") if isinstance(item, dict) else item for item in value if item]
        if isinstance(value, dict):
            bot_id = value.get("bot_id")
            return [bot_id] if bot_id else []
        if isinstance(value, str):
            return [value]
        return []

    def _get_bot_registered_quantity(self, symbol: str, bot_id: str) -> float:
        """获取某 bot 在某品种上的注册数量。"""
        key = self._norm_position_key(symbol)
        value = self._position_bot_map.get(key)
        if isinstance(value, list):
            for item in value:
                if isinstance(item, dict) and item.get("bot_id") == bot_id:
                    return item.get("quantity", 0)
        elif isinstance(value, dict) and value.get("bot_id") == bot_id:
            return value.get("quantity", 0)
        return 0

    def get_position_strategy(self, symbol: str, bot_id: str = None) -> str:
        """获取持仓对应的策略名。"""
        key = self._norm_position_key(symbol)
        value = self._position_bot_map.get(key)
        if isinstance(value, list):
            for item in value:
                if isinstance(item, dict):
                    if bot_id is None or item.get("bot_id") == bot_id:
                        return item.get("strategy", "auto")
            return "auto"
        if isinstance(value, dict):
            return value.get("strategy", "auto")
        return "auto"

    def get_order_strategy(self, order_id: str) -> str:
        """通过 order_id 获取策略名。"""
        value = self._order_bot_map.get(str(order_id))
        if isinstance(value, dict):
            return value.get("strategy", "auto")
        return "auto"

    def _register_order(self, order_id: str, bot_id: str, symbol: str = "", strategy: str = "auto"):
        """注册订单与机器人的映射。"""
        if not bot_id:
            return

        normalized_symbol = normalize_bar_symbol(symbol) if symbol else ""
        self._order_bot_map[str(order_id)] = {
            "bot_id": bot_id,
            "symbol": normalized_symbol,
            "strategy": strategy,
        }
        self._save_order_bot_map()

    def _lookup_bot_id(self, order_id: str) -> str | None:
        """通过 order_id 查找 bot_id。"""
        value = self._order_bot_map.get(str(order_id))
        if isinstance(value, dict):
            return value.get("bot_id")
        return value if isinstance(value, str) else None

    @staticmethod
    def _norm_symbol_base(symbol: str) -> str:
        """统一提取 symbol 基础部分用于比较。"""
        return normalize_symbol_key(symbol)

    def get_bot_symbols(self, bot_id: str) -> set:
        """获取某 bot 关联的所有 symbol。"""
        symbols = set()
        for value in self._order_bot_map.values():
            if isinstance(value, dict):
                if value.get("bot_id") == bot_id and value.get("symbol"):
                    symbols.add(self._norm_symbol_base(value["symbol"]))
        return symbols

    def _parse_bot_id_from_client_order_id(self, client_order_id: str) -> str | None:
        """从 `AB_{bot_id}_{timestamp}` 解析 bot_id。"""
        if not client_order_id or not client_order_id.startswith("AB_"):
            return None
        parts = client_order_id.split("_")
        if len(parts) < 3:
            return None
        bot_id = parts[1]
        if parts[1] == "al" and len(parts) >= 4:
            bot_id = f"{parts[1]}-{parts[2]}"
        return bot_id

    async def recover_bot_map_from_binance(self) -> dict:
        """从挂单和订单历史恢复 bot 映射。"""
        recovered_orders = 0
        recovered_positions = 0
        try:
            open_orders = self.exchange.fetch_open_orders()
            for order in open_orders:
                order_id = str(order.get("id", ""))
                client_order_id = order.get("clientOrderId", "")
                if order_id in self._order_bot_map:
                    continue
                bot_id = self._parse_bot_id_from_client_order_id(client_order_id)
                if bot_id:
                    raw_symbol = normalize_bar_symbol(order.get("symbol", ""))
                    self._order_bot_map[order_id] = {"bot_id": bot_id, "symbol": raw_symbol}
                    recovered_orders += 1

            positions = await self.get_positions()
            for position in positions:
                normalized_symbol = position.symbol.replace("/", "")
                if normalized_symbol in self._position_bot_map:
                    continue

                position_base = self._norm_symbol_base(normalized_symbol)
                best_order_id = -1
                best_value = None
                for order_id, value in self._order_bot_map.items():
                    if isinstance(value, dict) and value.get("symbol"):
                        order_base = self._norm_symbol_base(value["symbol"])
                        if order_base == position_base:
                            try:
                                order_id_int = int(order_id)
                            except ValueError:
                                order_id_int = 0
                            if order_id_int > best_order_id:
                                best_order_id = order_id_int
                                best_value = value

                if best_value:
                    self._position_bot_map[normalized_symbol] = {
                        "bot_id": best_value["bot_id"],
                        "strategy": best_value.get("strategy", "auto"),
                    }
                    recovered_positions += 1
                    logger.info(
                        "从 order_bot_map 恢复持仓归属: %s -> %s (order=%s)",
                        normalized_symbol,
                        best_value["bot_id"],
                        best_order_id,
                    )

                if normalized_symbol in self._position_bot_map:
                    continue

                try:
                    ccxt_symbol = self._normalize_symbol_for_ccxt(normalized_symbol)
                    orders = self.exchange.fetch_orders(ccxt_symbol, limit=10)
                    for order in reversed(orders):
                        client_order_id = order.get("clientOrderId", "") or order.get("info", {}).get(
                            "clientOrderId", ""
                        )
                        bot_id = self._parse_bot_id_from_client_order_id(client_order_id)
                        if bot_id:
                            self._position_bot_map[normalized_symbol] = {"bot_id": bot_id, "strategy": "auto"}
                            recovered_positions += 1
                            logger.info(f"从订单历史恢复持仓归属: {normalized_symbol} -> {bot_id}")
                            break
                except Exception as exc:
                    logger.warning(f"查询 {normalized_symbol} 订单历史失败: {exc}")

            if recovered_orders > 0:
                self._save_order_bot_map()
                logger.info(f"从币安恢复 {recovered_orders} 条 order->bot 映射")
            if recovered_positions > 0:
                self._save_position_bot_map()

            return {
                "recovered_orders": recovered_orders,
                "recovered_positions": recovered_positions,
                "total_open": len(open_orders),
            }
        except Exception as exc:
            logger.warning(f"恢复 bot 映射失败: {exc}")
            return {"recovered_orders": 0, "recovered_positions": 0, "error": str(exc)}
