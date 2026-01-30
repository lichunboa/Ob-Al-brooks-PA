"""Binance Futures 用户数据流 (测试网/主网) - 提供持仓/订单私有 WS"""
import asyncio
import hmac
import hashlib
import json
import time
from typing import Dict, Optional
from urllib.parse import urlencode

import aiohttp


class PositionState:
    """维护逐仓/全仓持仓，支持双向持仓"""

    def __init__(self):
        # symbol -> {"LONG": qty, "SHORT": qty, "BOTH": net}
        self._positions: Dict[str, Dict[str, float]] = {}

    def update(self, symbol: str, side: str, qty: float):
        side_map = self._positions.setdefault(symbol, {"LONG": 0.0, "SHORT": 0.0, "BOTH": 0.0})
        if side == "LONG":
            side_map["LONG"] = qty
        elif side == "SHORT":
            side_map["SHORT"] = qty
        else:  # BOTH
            side_map["BOTH"] = qty

    def net(self, symbol: str) -> float:
        side_map = self._positions.get(symbol)
        if not side_map:
            return 0.0
        if side_map.get("BOTH", 0.0) != 0:
            return side_map["BOTH"]
        return side_map.get("LONG", 0.0) - side_map.get("SHORT", 0.0)

    def long_short(self, symbol: str) -> tuple[float, float]:
        side_map = self._positions.get(symbol, {})
        return side_map.get("LONG", 0.0), side_map.get("SHORT", 0.0)

    def snapshot(self) -> Dict[str, Dict[str, float]]:
        return self._positions.copy()


class BinanceUserStream:
    """管理 listenKey、续期、私有 WS，解析 ACCOUNT_UPDATE/ORDER_TRADE_UPDATE"""

    def __init__(
        self,
        api_key: str,
        api_secret: str,
        rest_base: str,
        ws_base: str,
        proxy: Optional[str] = None,
        loop: Optional[asyncio.AbstractEventLoop] = None,
        use_rest_snapshot: bool = False,
        account_stale_seconds: int = 60,
    ):
        self.api_key = api_key
        self.api_secret = api_secret
        self.rest_base = rest_base.rstrip("/")
        self.ws_base = ws_base.rstrip("/")
        self.proxy = proxy
        self.loop = loop
        self.use_rest_snapshot = use_rest_snapshot
        self.account_stale_seconds = account_stale_seconds

        self._session: Optional[aiohttp.ClientSession] = None
        self._listen_key: Optional[str] = None
        self._ws_task: Optional[asyncio.Task] = None
        self._keepalive_task: Optional[asyncio.Task] = None
        self.positions = PositionState()
        self._stopped = asyncio.Event()
        self._position_listeners = []
        self._trade_listeners = []
        self._order_listeners = []
        self._last_account_update_ts: Optional[float] = None
        self._last_event_ts: Optional[float] = None
        self._stale_logged = False

    # ---------- Public API ----------
    async def start(self):
        if self._ws_task:
            return
        if self.loop is None:
            self.loop = asyncio.get_running_loop()
        self._session = aiohttp.ClientSession()
        if self.use_rest_snapshot:
            print("[UserStream][WARN] use_rest_snapshot=true 将在启动时调用一次 REST 账户快照，违反零 REST 严格模式")
            await self._fetch_account_snapshot()
        await self._create_listen_key()
        self._keepalive_task = self.loop.create_task(self._keepalive_loop())
        self._ws_task = self.loop.create_task(self._ws_loop())

    async def stop(self):
        self._stopped.set()
        if self._ws_task:
            self._ws_task.cancel()
        if self._keepalive_task:
            self._keepalive_task.cancel()
        if self._session:
            await self._session.close()

    def get_position(self, symbol: str) -> float:
        return self.positions.net(symbol.replace(":", ""))

    def get_position_ls(self, symbol: str) -> tuple[float, float]:
        return self.positions.long_short(symbol.replace(":", ""))

    def register_position_listener(self, listener):
        """listener(symbol, long_qty, short_qty, net_qty)"""
        self._position_listeners.append(listener)

    def register_trade_listener(self, listener):
        """listener(symbol, side, position_side, qty, price)"""
        self._trade_listeners.append(listener)

    def register_order_listener(self, listener):
        """listener(symbol, order_id, status)"""
        self._order_listeners.append(listener)

    def positions_snapshot(self) -> Dict[str, Dict[str, float]]:
        return self.positions.snapshot()

    def account_stale(self) -> bool:
        if not self._last_account_update_ts:
            return True
        return (time.time() - self._last_account_update_ts) >= self.account_stale_seconds

    # ---------- Internal ----------
    async def _create_listen_key(self):
        url = f"{self.rest_base}/fapi/v1/listenKey"
        headers = {"X-MBX-APIKEY": self.api_key}
        async with self._session.post(url, headers=headers, proxy=self.proxy) as resp:
            data = await resp.json()
            self._listen_key = data.get("listenKey")
        self._last_event_ts = time.time()

    async def _keepalive_loop(self):
        while not self._stopped.is_set():
            try:
                await asyncio.sleep(30 * 60)  # 30 min
                if not self._listen_key:
                    await self._create_listen_key()
                    continue
                url = f"{self.rest_base}/fapi/v1/listenKey"
                headers = {"X-MBX-APIKEY": self.api_key}
                async with self._session.put(url, headers=headers, proxy=self.proxy):
                    pass
            except Exception:
                continue

    async def _ws_loop(self):
        while not self._stopped.is_set():
            try:
                if not self._listen_key:
                    await self._create_listen_key()
                ws_url = f"{self.ws_base}/ws/{self._listen_key}"
                async with self._session.ws_connect(ws_url, proxy=self.proxy, heartbeat=30) as ws:
                    async for msg in ws:
                        if msg.type == aiohttp.WSMsgType.TEXT:
                            await self._handle_message(msg.data)
                            self._last_event_ts = time.time()
                        elif msg.type == aiohttp.WSMsgType.CLOSED:
                            break
                        elif msg.type == aiohttp.WSMsgType.ERROR:
                            break
            except Exception:
                await asyncio.sleep(5)  # backoff
                continue

    async def _handle_message(self, data: str):
        try:
            payload = json.loads(data)
        except Exception:
            return
        event = payload.get("e")
        if event == "ACCOUNT_UPDATE":
            self._handle_account_update(payload)
        elif event == "ORDER_TRADE_UPDATE":
            self._handle_order_trade_update(payload)

    def _handle_account_update(self, payload: dict):
        account = payload.get("a", {})
        positions = account.get("P", [])
        for pos in positions:
            symbol = pos.get("s")
            qty = float(pos.get("pa", "0"))
            side = pos.get("ps", "BOTH")
            if symbol:
                self.positions.update(symbol, side, qty)
                long_qty, short_qty = self.positions.long_short(symbol)
                net_qty = self.positions.net(symbol)
                for listener in self._position_listeners:
                    try:
                        listener(symbol, long_qty, short_qty, net_qty)
                    except Exception:
                        continue
        self._last_account_update_ts = time.time()
        self._stale_logged = False

    def _handle_order_trade_update(self, payload: dict):
        o = payload.get("o", {})
        symbol = o.get("s")
        order_id = o.get("i")
        status = o.get("X")
        if symbol and order_id and status:
            for listener in self._order_listeners:
                try:
                    listener(symbol, order_id, status)
                except Exception:
                    continue
        side = o.get("S")  # BUY/SELL
        position_side = o.get("ps")  # LONG/SHORT/BOTH
        last_filled = float(o.get("l", 0))  # last filled qty
        price = float(o.get("L", 0))  # last filled price
        exec_type = o.get("x")  # e.g., TRADE
        if exec_type != "TRADE" or last_filled == 0 or not symbol or not side:
            return
        for listener in self._trade_listeners:
            try:
                listener(symbol, side.lower(), position_side, last_filled, price)
            except Exception:
                continue

    async def _fetch_account_snapshot(self):
        """可选：启动时拉取一次账户快照（REST，默认关闭）"""
        try:
            ts = int(time.time() * 1000)
            query = urlencode({"timestamp": ts})
            signature = hmac.new(self.api_secret.encode(), query.encode(), hashlib.sha256).hexdigest()
            url = f"{self.rest_base}/fapi/v2/account?{query}&signature={signature}"
            headers = {"X-MBX-APIKEY": self.api_key}
            async with self._session.get(url, headers=headers, proxy=self.proxy) as resp:
                data = await resp.json()
                positions = data.get("positions", [])
                for pos in positions:
                    symbol = pos.get("symbol")
                    amt = float(pos.get("positionAmt", "0"))
                    side = pos.get("positionSide", "BOTH")
                    if symbol:
                        self.positions.update(symbol, side, amt)
                self._last_account_update_ts = data.get("updateTime", ts) / 1000
        except Exception:
            # 保持启动不中断，日志由外层处理
            pass
