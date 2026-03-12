"""
Signal Service 健康检查模块
"""

import json
import logging
import threading
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any, Dict, List, Tuple

logger = logging.getLogger(__name__)

# 全局状态
_engine_stats: Dict[str, Any] = {}
_start_time = time.time()
_engines: List[Tuple[str, Any]] = []


class HealthHandler(BaseHTTPRequestHandler):
    """HTTP请求处理器"""
    
    def log_message(self, format, *args):
        logger.debug(f"Health check: {args[0]}")
    
    def do_GET(self):
        if self.path == '/health':
            self._handle_health()
        elif self.path == '/health/live':
            self._handle_liveness()
        elif self.path == '/health/ready':
            self._handle_readiness()
        else:
            self._send_error(404, "Not Found")
    
    def _handle_health(self):
        try:
            report = self._build_health_report()
            status_code = 200 if report['status'] == 'healthy' else 503
            self._send_json(report, status_code)
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            self._send_error(500, str(e))
    
    def _handle_liveness(self):
        self._send_json({
            "status": "alive",
            "service": "signal-service",
            "timestamp": datetime.utcnow().isoformat() + "Z"
        })
    
    def _handle_readiness(self):
        try:
            ready = self._check_readiness()
            if ready:
                self._send_json({"status": "ready", "service": "signal-service"})
            else:
                self._send_json({"status": "not_ready"}, 503)
        except Exception as e:
            self._send_json({"status": "error", "message": str(e)}, 503)
    
    def _build_health_report(self) -> Dict[str, Any]:
        global _engines, _start_time
        
        checks = []
        
        # 检查引擎状态
        engine_check = self._check_engines()
        checks.append(engine_check)
        
        # 检查数据库
        db_check = self._check_database()
        checks.append(db_check)
        
        # 确定总体状态
        if any(c.get('status') == 'unhealthy' for c in checks):
            status = 'unhealthy'
        elif any(c.get('status') == 'degraded' for c in checks):
            status = 'degraded'
        else:
            status = 'healthy'
        
        uptime = time.time() - _start_time
        
        # 构建引擎统计
        engines_info = []
        for name, engine in _engines:
            engines_info.append({
                "name": name,
                "running": getattr(engine, '_running', True),
                "stats": getattr(engine, 'get_stats', lambda: {})()
            })
        
        return {
            "service": "signal-service",
            "version": "2.4.0",
            "status": status,
            "uptime_seconds": round(uptime, 2),
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "checks": checks,
            "engines": engines_info
        }
    
    def _check_engines(self) -> Dict[str, Any]:
        global _engines
        
        try:
            if not _engines:
                return {
                    "name": "engines",
                    "status": "degraded",
                    "message": "暂无运行中的引擎"
                }
            
            # 检查每个引擎
            engine_statuses = []
            for name, engine in _engines:
                running = getattr(engine, '_running', True)
                engine_statuses.append({"name": name, "running": running})
            
            all_running = all(s['running'] for s in engine_statuses)
            
            return {
                "name": "engines",
                "status": "healthy" if all_running else "degraded",
                "message": f"{len(_engines)} 个引擎运行中",
                "details": engine_statuses
            }
        except Exception as e:
            return {
                "name": "engines",
                "status": "unhealthy",
                "message": str(e)
            }
    
    def _check_database(self) -> Dict[str, Any]:
        try:
            import os

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
                "status": "degraded",  # Brooks 主链可在数据库短暂异常时保持存活
                "message": f"PostgreSQL 连接失败: {str(e)}"
            }
    
    def _check_readiness(self) -> bool:
        global _engines
        return len(_engines) > 0
    
    def _send_json(self, data: Dict[str, Any], status_code: int = 200):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode())
    
    def _send_error(self, status_code: int, message: str):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({"error": message}).encode())


class HealthServer:
    """健康检查服务器"""
    
    def __init__(self, host: str = "0.0.0.0", port: int = 8083):
        self.host = host
        self.port = port
        self.server = None
        self.thread = None
    
    def start(self, engines: List[Tuple[str, Any]] = None):
        """启动健康检查服务器"""
        global _engines
        if engines:
            _engines = engines
        
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
    
    def update_engines(self, engines: List[Tuple[str, Any]]):
        """更新引擎引用"""
        global _engines
        _engines = engines


# 全局实例
health_server = HealthServer()


def start_health_server(engines: List[Tuple[str, Any]] = None, port: int = None):
    """启动健康检查服务器的便捷函数"""
    if port:
        health_server.port = port
    health_server.start(engines)


def stop_health_server():
    """停止健康检查服务器的便捷函数"""
    health_server.stop()


def update_engine_stats(engine_name: str, stats: Dict[str, Any]):
    """更新引擎统计信息"""
    global _engine_stats
    _engine_stats[engine_name] = {
        **stats,
        "last_update": time.time()
    }
