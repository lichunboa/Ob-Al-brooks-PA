"""
Data Service 健康检查服务器
运行在独立线程中，提供HTTP健康检查端点
"""
import json
import logging
import threading
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime
from typing import Dict, Any
import os
import sys
from pathlib import Path

# 确保可以导入common模块
SRC_DIR = Path(__file__).parent
LIBS_DIR = SRC_DIR.parent.parent / "libs"
if str(LIBS_DIR) not in sys.path:
    sys.path.insert(0, str(LIBS_DIR))

try:
    from common.health import HealthChecker, HealthCheck, HealthStatus
    from common.database import DatabaseManager
except ImportError:
    # 如果common模块不可用，使用简化版
    HealthChecker = None
    HealthCheck = None
    HealthStatus = None

logger = logging.getLogger(__name__)


class HealthHandler(BaseHTTPRequestHandler):
    """HTTP请求处理器"""
    
    # 类变量，由外部设置
    scheduler = None
    start_time = None
    
    def log_message(self, format, *args):
        """重写日志方法，使用我们的logger"""
        logger.debug(f"Health check: {args[0]}")
    
    def do_GET(self):
        """处理GET请求"""
        if self.path == '/health':
            self._handle_health()
        elif self.path == '/health/live':
            self._handle_liveness()
        elif self.path == '/health/ready':
            self._handle_readiness()
        else:
            self._send_error(404, "Not Found")
    
    def _handle_health(self):
        """健康检查"""
        try:
            report = self._build_health_report()
            status_code = 200 if report['status'] == 'healthy' else 503
            self._send_json(report, status_code)
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            self._send_error(500, str(e))
    
    def _handle_liveness(self):
        """存活检查（Kubernetes liveness probe）"""
        self._send_json({
            "status": "alive",
            "service": "data-service",
            "timestamp": datetime.utcnow().isoformat() + "Z"
        })
    
    def _handle_readiness(self):
        """就绪检查（Kubernetes readiness probe）"""
        try:
            ready = self._check_readiness()
            if ready:
                self._send_json({
                    "status": "ready",
                    "service": "data-service"
                })
            else:
                self._send_json({
                    "status": "not_ready",
                    "service": "data-service"
                }, 503)
        except Exception as e:
            self._send_json({
                "status": "error",
                "message": str(e)
            }, 503)
    
    def _build_health_report(self) -> Dict[str, Any]:
        """构建健康报告"""
        checks = []
        
        # 检查调度器状态
        sched_status = self._check_scheduler()
        checks.append(sched_status)
        
        # 检查 WebSocket 数据新鲜度（关键检查！）
        ws_status = self._check_websocket_data_freshness()
        checks.append(ws_status)
        
        # 检查数据库连接
        db_status = self._check_database()
        checks.append(db_status)
        
        # 检查磁盘空间
        disk_status = self._check_disk_space()
        checks.append(disk_status)
        
        # 确定总体状态
        if any(c.get('status') == 'unhealthy' for c in checks):
            status = 'unhealthy'
        elif any(c.get('status') == 'degraded' for c in checks):
            status = 'degraded'
        else:
            status = 'healthy'
        
        uptime = time.time() - self.start_time if self.start_time else 0
        
        return {
            "service": "data-service",
            "version": "2.1.0",  # 版本升级：添加 WebSocket 自动重连
            "status": status,
            "uptime_seconds": round(uptime, 2),
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "checks": checks
        }
    
    def _check_scheduler(self) -> Dict[str, Any]:
        """检查调度器状态"""
        try:
            if not self.scheduler:
                return {
                    "name": "scheduler",
                    "status": "unhealthy",
                    "message": "调度器未初始化"
                }
            
            # 检查进程状态
            procs_info = []
            for name, info in self.scheduler._procs.items():
                proc = info.get('proc')
                if proc:
                    alive = proc.poll() is None
                    procs_info.append({
                        "name": name,
                        "pid": proc.pid,
                        "alive": alive,
                        "restarts": info.get('restarts', 0)
                    })
            
            all_alive = all(p['alive'] for p in procs_info)
            
            return {
                "name": "scheduler",
                "status": "healthy" if all_alive else "degraded",
                "message": f"运行 {len(procs_info)} 个进程",
                "processes": procs_info
            }
        except Exception as e:
            return {
                "name": "scheduler",
                "status": "unhealthy",
                "message": str(e)
            }
    
    def _check_websocket_data_freshness(self) -> Dict[str, Any]:
        """检查 WebSocket 数据新鲜度
        
        读取 WebSocketManager 写入的状态文件，检查：
        1. 连接状态是否正常
        2. 最后一条数据是否在合理时间内
        """
        try:
            # 导入 WebSocketManager 读取状态文件
            from pathlib import Path
            import sys
            SRC_DIR = Path(__file__).parent
            if str(SRC_DIR) not in sys.path:
                sys.path.insert(0, str(SRC_DIR))
            
            try:
                from adapters.ws_manager import WebSocketManager
                state = WebSocketManager.read_state_file()
            except ImportError:
                # 尝试直接读取状态文件
                state_file = "/tmp/data-service-ws-state.json"
                if os.path.exists(state_file):
                    with open(state_file, "r") as f:
                        state = json.load(f)
                else:
                    state = None
            
            if not state:
                return {
                    "name": "websocket_data",
                    "status": "unknown",
                    "message": "无法读取 WebSocket 状态（可能未启动）"
                }
            
            # 检查连接状态
            ws_state = state.get("state", "unknown")
            last_msg_ago = state.get("last_message_ago_seconds")
            reconnect_attempts = state.get("reconnect_attempts", 0)
            total_reconnects = state.get("total_reconnects", 0)
            messages_received = state.get("messages_received", 0)
            
            # 判断健康状态
            # - 连接正常且最近有数据：healthy
            # - 连接正常但数据有点旧（2-5分钟）：degraded
            # - 连接断开或数据太旧（>5分钟）：unhealthy
            
            if ws_state in ("disconnected", "stale"):
                status = "unhealthy"
                message = f"WebSocket {ws_state}，重连尝试 #{reconnect_attempts}"
            elif ws_state == "reconnecting":
                status = "degraded"
                message = f"WebSocket 正在重连 (尝试 #{reconnect_attempts})"
            elif last_msg_ago is not None:
                if last_msg_ago > 300:  # 5分钟
                    status = "unhealthy"
                    message = f"数据停滞 {last_msg_ago:.0f} 秒"
                elif last_msg_ago > 120:  # 2分钟
                    status = "degraded"
                    message = f"数据延迟 {last_msg_ago:.0f} 秒"
                else:
                    status = "healthy"
                    message = f"数据正常，{last_msg_ago:.0f} 秒前更新"
            else:
                status = "degraded"
                message = "等待首条数据..."
            
            return {
                "name": "websocket_data",
                "status": status,
                "message": message,
                "details": {
                    "state": ws_state,
                    "last_message_ago_seconds": last_msg_ago,
                    "messages_received": messages_received,
                    "total_reconnects": total_reconnects,
                    "reconnect_attempts": reconnect_attempts,
                }
            }
        except Exception as e:
            return {
                "name": "websocket_data",
                "status": "unknown",
                "message": f"检查失败: {str(e)}"
            }
    
    def _check_database(self) -> Dict[str, Any]:
        """检查数据库连接"""
        try:
            import psycopg
            db_url = os.getenv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5434/market_data')
            
            start = time.time()
            conn = psycopg.connect(db_url, connect_timeout=5)
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            cursor.fetchone()
            conn.close()
            response_time = (time.time() - start) * 1000
            
            return {
                "name": "database",
                "status": "healthy",
                "message": "数据库连接正常",
                "response_time_ms": round(response_time, 2)
            }
        except Exception as e:
            return {
                "name": "database",
                "status": "unhealthy",
                "message": f"数据库连接失败: {str(e)}"
            }
    
    def _check_disk_space(self) -> Dict[str, Any]:
        """检查磁盘空间"""
        try:
            import shutil
            stat = shutil.disk_usage("/")
            used_percent = (stat.used / stat.total) * 100
            
            if used_percent > 90:
                status = "unhealthy"
            elif used_percent > 80:
                status = "degraded"
            else:
                status = "healthy"
            
            return {
                "name": "disk_space",
                "status": status,
                "message": f"磁盘使用 {used_percent:.1f}%",
                "free_gb": round(stat.free / (1024**3), 2)
            }
        except Exception as e:
            return {
                "name": "disk_space",
                "status": "unhealthy",
                "message": str(e)
            }
    
    def _check_readiness(self) -> bool:
        """检查是否就绪"""
        try:
            if not self.scheduler:
                return False
            # 至少有一个进程在运行
            return len(self.scheduler._procs) > 0
        except:
            return False
    
    def _send_json(self, data: Dict[str, Any], status_code: int = 200):
        """发送JSON响应"""
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode())
    
    def _send_error(self, status_code: int, message: str):
        """发送错误响应"""
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({"error": message}).encode())


class HealthServer:
    """健康检查服务器"""
    
    def __init__(self, host: str = "0.0.0.0", port: int = 8081):
        self.host = host
        self.port = port
        self.server = None
        self.thread = None
        self.scheduler = None
        self.start_time = time.time()
    
    def start(self, scheduler=None):
        """启动健康检查服务器"""
        self.scheduler = scheduler
        HealthHandler.scheduler = scheduler
        HealthHandler.start_time = self.start_time
        
        try:
            self.server = HTTPServer((self.host, self.port), HealthHandler)
            self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
            self.thread.start()
            logger.info(f"Health server started on http://{self.host}:{self.port}")
        except Exception as e:
            logger.error(f"Failed to start health server: {e}")
    
    def stop(self):
        """停止健康检查服务器"""
        if self.server:
            self.server.shutdown()
            logger.info("Health server stopped")


# 全局实例
health_server = HealthServer()


def start_health_server(scheduler=None, port: int = None):
    """启动健康检查服务器的便捷函数"""
    if port:
        health_server.port = port
    health_server.start(scheduler)


def stop_health_server():
    """停止健康检查服务器的便捷函数"""
    health_server.stop()
