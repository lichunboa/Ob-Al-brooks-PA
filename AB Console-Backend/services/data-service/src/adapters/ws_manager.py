"""WebSocket 连接管理器 - 心跳检测 + 自动重连

解决问题：WebSocket 静默断开后没有自动重连，导致数据停滞。

功能：
1. 心跳检测：定期检查是否收到数据
2. 自动重连：连接断开后自动重连，带指数退避
3. 超时告警：长时间没有数据时记录警告
4. 状态暴露：供健康检查使用
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Callable, Dict, List, Optional, Any

logger = logging.getLogger(__name__)


class ConnectionState(Enum):
    """连接状态"""
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    RECONNECTING = "reconnecting"
    STALE = "stale"  # 连接存在但无数据


@dataclass
class ConnectionStats:
    """连接统计"""
    state: ConnectionState = ConnectionState.DISCONNECTED
    last_message_time: float = 0  # Unix timestamp
    last_reconnect_time: float = 0
    reconnect_attempts: int = 0
    total_reconnects: int = 0
    messages_received: int = 0
    start_time: float = field(default_factory=time.time)
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典（用于健康检查）"""
        now = time.time()
        last_msg_ago = now - self.last_message_time if self.last_message_time > 0 else -1
        return {
            "state": self.state.value,
            "last_message_ago_seconds": round(last_msg_ago, 1) if last_msg_ago >= 0 else None,
            "last_message_time": datetime.fromtimestamp(self.last_message_time, tz=timezone.utc).isoformat() if self.last_message_time > 0 else None,
            "reconnect_attempts": self.reconnect_attempts,
            "total_reconnects": self.total_reconnects,
            "messages_received": self.messages_received,
            "uptime_seconds": round(now - self.start_time, 1),
        }


class WebSocketManager:
    """WebSocket 连接管理器
    
    使用方法：
        manager = WebSocketManager(
            adapter_factory=lambda: BinanceWSAdapter(proxy),
            symbols=symbols,
            callback=on_candle,
        )
        manager.run()  # 阻塞运行，内部处理重连
    """
    
    # 配置常量
    HEARTBEAT_INTERVAL = 30  # 心跳检查间隔（秒）
    STALE_THRESHOLD = 120  # 数据停滞阈值（秒）- 2分钟无数据视为停滞
    WARNING_THRESHOLD = 300  # 警告阈值（秒）- 5分钟无数据记录警告
    MAX_RECONNECT_ATTEMPTS = 20  # 最大重连次数
    MAX_RECONNECT_DELAY = 300  # 最大重连延迟（秒）
    STATE_FILE_PATH = "/tmp/data-service-ws-state.json"  # 状态文件路径
    
    def __init__(
        self,
        adapter_factory: Callable,
        symbols: List[str],
        callback: Callable,
        heartbeat_interval: int = None,
        stale_threshold: int = None,
    ):
        self._adapter_factory = adapter_factory
        self._symbols = symbols
        self._user_callback = callback
        self._adapter = None
        
        # 配置
        self._heartbeat_interval = heartbeat_interval or self.HEARTBEAT_INTERVAL
        self._stale_threshold = stale_threshold or self.STALE_THRESHOLD
        
        # 状态
        self._stats = ConnectionStats()
        self._running = False
        self._stop_event = threading.Event()
        self._heartbeat_thread: Optional[threading.Thread] = None
        self._ws_thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        
    @property
    def stats(self) -> ConnectionStats:
        """获取连接统计"""
        return self._stats
    
    def _wrapped_callback(self, event) -> None:
        """包装回调，记录消息时间"""
        with self._lock:
            self._stats.last_message_time = time.time()
            self._stats.messages_received += 1
            if self._stats.state in (ConnectionState.CONNECTING, ConnectionState.RECONNECTING, ConnectionState.STALE):
                self._stats.state = ConnectionState.CONNECTED
                self._stats.reconnect_attempts = 0
                logger.info("WebSocket 连接已恢复，数据流正常")
        
        # 调用用户回调
        try:
            self._user_callback(event)
        except Exception as e:
            logger.error("用户回调异常: %s", e)
    
    def _heartbeat_loop(self) -> None:
        """心跳检测循环"""
        logger.info("心跳检测启动，间隔 %d 秒，停滞阈值 %d 秒", 
                   self._heartbeat_interval, self._stale_threshold)
        
        while not self._stop_event.wait(self._heartbeat_interval):
            self._check_connection_health()
            self._write_state_file()
    
    def _check_connection_health(self) -> None:
        """检查连接健康状态"""
        with self._lock:
            if self._stats.last_message_time == 0:
                # 还没收到过消息，可能还在初始化
                return
            
            now = time.time()
            silence_duration = now - self._stats.last_message_time
            
            # 5分钟无数据，记录警告
            if silence_duration > self.WARNING_THRESHOLD:
                logger.warning(
                    "WebSocket 已 %.1f 分钟未收到数据！上次消息: %s",
                    silence_duration / 60,
                    datetime.fromtimestamp(self._stats.last_message_time).strftime("%H:%M:%S")
                )
            
            # 超过停滞阈值，标记为 STALE 并触发重连
            if silence_duration > self._stale_threshold:
                if self._stats.state == ConnectionState.CONNECTED:
                    logger.warning(
                        "WebSocket 数据停滞 %.1f 秒，标记为 STALE，准备重连...",
                        silence_duration
                    )
                    self._stats.state = ConnectionState.STALE
                    # 触发重连
                    self._trigger_reconnect()
    
    def _trigger_reconnect(self) -> None:
        """触发重连"""
        if self._stats.reconnect_attempts >= self.MAX_RECONNECT_ATTEMPTS:
            logger.error(
                "已达到最大重连次数 %d，停止重连。需要人工干预！",
                self.MAX_RECONNECT_ATTEMPTS
            )
            return
        
        # 停止当前连接
        if self._adapter:
            try:
                logger.info("停止当前 WebSocket 连接...")
                self._adapter.stop()
            except Exception as e:
                logger.warning("停止连接时出错: %s", e)
        
        # 计算退避延迟
        delay = min(2 ** self._stats.reconnect_attempts, self.MAX_RECONNECT_DELAY)
        self._stats.reconnect_attempts += 1
        self._stats.total_reconnects += 1
        self._stats.state = ConnectionState.RECONNECTING
        self._stats.last_reconnect_time = time.time()
        
        logger.info(
            "重连尝试 #%d，等待 %d 秒后重连...",
            self._stats.reconnect_attempts, delay
        )
        
        # 等待后重连（在新线程中）
        def delayed_reconnect():
            if self._stop_event.wait(delay):
                return  # 被停止了
            self._start_ws_thread()
        
        threading.Thread(target=delayed_reconnect, daemon=True).start()
    
    def _start_ws_thread(self) -> None:
        """启动 WebSocket 线程"""
        if self._ws_thread and self._ws_thread.is_alive():
            logger.warning("WebSocket 线程仍在运行，跳过启动")
            return
        
        self._stats.state = ConnectionState.CONNECTING
        self._ws_thread = threading.Thread(target=self._ws_loop, daemon=True)
        self._ws_thread.start()
    
    def _ws_loop(self) -> None:
        """WebSocket 运行循环"""
        while self._running and not self._stop_event.is_set():
            try:
                logger.info("创建新的 WebSocket 适配器...")
                self._adapter = self._adapter_factory()
                self._adapter.subscribe(self._symbols, self._wrapped_callback)
                
                logger.info("启动 WebSocket 连接...")
                self._stats.state = ConnectionState.CONNECTING
                self._adapter.run()  # 阻塞直到断开
                
            except Exception as e:
                logger.error("WebSocket 运行异常: %s", e)
            
            # 连接断开
            if self._running and not self._stop_event.is_set():
                with self._lock:
                    self._stats.state = ConnectionState.DISCONNECTED
                
                # 计算退避延迟
                delay = min(2 ** self._stats.reconnect_attempts, self.MAX_RECONNECT_DELAY)
                self._stats.reconnect_attempts += 1
                self._stats.total_reconnects += 1
                
                logger.warning(
                    "WebSocket 断开，%d 秒后重连 (尝试 #%d)...",
                    delay, self._stats.reconnect_attempts
                )
                
                if self._stop_event.wait(delay):
                    break  # 被停止了
        
        logger.info("WebSocket 循环退出")
    
    def _write_state_file(self) -> None:
        """写入状态文件（供健康检查读取）"""
        try:
            state = self._stats.to_dict()
            state["pid"] = os.getpid()
            state["updated_at"] = datetime.now(timezone.utc).isoformat()
            
            # 原子写入
            tmp_path = self.STATE_FILE_PATH + ".tmp"
            with open(tmp_path, "w") as f:
                json.dump(state, f)
            os.rename(tmp_path, self.STATE_FILE_PATH)
        except Exception as e:
            logger.debug("写入状态文件失败: %s", e)
    
    @classmethod
    def read_state_file(cls) -> Optional[Dict[str, Any]]:
        """读取状态文件（供健康检查调用）"""
        try:
            with open(cls.STATE_FILE_PATH, "r") as f:
                return json.load(f)
        except FileNotFoundError:
            return None
        except Exception as e:
            logger.debug("读取状态文件失败: %s", e)
            return None
    
    def run(self) -> None:
        """运行管理器（阻塞）"""
        self._running = True
        self._stop_event.clear()
        self._stats = ConnectionStats()
        
        # 设置信号处理
        def signal_handler(signum, frame):
            logger.info("收到信号 %d，停止...", signum)
            self.stop()
        
        signal.signal(signal.SIGTERM, signal_handler)
        signal.signal(signal.SIGINT, signal_handler)
        
        # 启动心跳检测线程
        self._heartbeat_thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
        self._heartbeat_thread.start()
        
        # 启动 WebSocket（在当前线程阻塞）
        self._ws_loop()
        
        # 清理
        self._cleanup()
    
    def run_async(self) -> None:
        """异步运行（非阻塞，在后台线程运行）"""
        self._running = True
        self._stop_event.clear()
        self._stats = ConnectionStats()
        
        # 启动心跳检测线程
        self._heartbeat_thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
        self._heartbeat_thread.start()
        
        # 启动 WebSocket 线程
        self._start_ws_thread()
    
    def stop(self) -> None:
        """停止管理器"""
        logger.info("停止 WebSocket 管理器...")
        self._running = False
        self._stop_event.set()
        
        if self._adapter:
            try:
                self._adapter.stop()
            except Exception as e:
                logger.warning("停止适配器时出错: %s", e)
    
    def _cleanup(self) -> None:
        """清理资源"""
        try:
            if os.path.exists(self.STATE_FILE_PATH):
                os.remove(self.STATE_FILE_PATH)
        except Exception:
            pass
        
        logger.info("WebSocket 管理器已停止")
