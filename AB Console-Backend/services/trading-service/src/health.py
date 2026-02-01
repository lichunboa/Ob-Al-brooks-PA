"""
Trading Service 健康检查模块
支持多种运行模式的健康检查
"""
import json
import threading
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime
from typing import Dict, Any, Optional
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

# 全局状态
_start_time = time.time()
_status: Dict[str, Any] = {
    "running": False,
    "mode": None,  # once, full_async, event
    "last_run": None,
    "current_task": None,
    "progress": 0.0,  # 0-100
    "errors": [],
    "metrics": {}
}
_status_lock = threading.Lock()


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
            "service": "trading-service",
            "timestamp": datetime.utcnow().isoformat() + "Z"
        })
    
    def _handle_readiness(self):
        global _status
        with _status_lock:
            is_running = _status.get("running", False)
        
        if is_running or _is_data_fresh():
            self._send_json({
                "status": "ready",
                "service": "trading-service"
            })
        else:
            self._send_json({
                "status": "not_ready",
                "reason": "服务未运行且数据可能过期"
            }, 503)
    
    def _build_health_report(self) -> Dict[str, Any]:
        global _status, _start_time
        
        checks = []
        
        # 检查数据库
        db_check = self._check_database()
        checks.append(db_check)
        
        # 检查数据文件
        data_check = self._check_data_files()
        checks.append(data_check)
        
        # 检查运行状态
        status_check = self._check_status()
        checks.append(status_check)
        
        # 检查磁盘
        disk_check = self._check_disk_space()
        checks.append(disk_check)
        
        # 确定总体状态
        if any(c.get('status') == 'unhealthy' for c in checks):
            status = 'unhealthy'
        elif any(c.get('status') == 'degraded' for c in checks):
            status = 'degraded'
        else:
            status = 'healthy'
        
        uptime = time.time() - _start_time
        
        with _status_lock:
            current_status = dict(_status)
        
        return {
            "service": "trading-service",
            "version": "2.0.0",
            "status": status,
            "uptime_seconds": round(uptime, 2),
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "checks": checks,
            "details": {
                "running": current_status.get("running", False),
                "mode": current_status.get("mode"),
                "current_task": current_status.get("current_task"),
                "progress": current_status.get("progress", 0),
                "last_run": current_status.get("last_run")
            }
        }
    
    def _check_database(self) -> Dict[str, Any]:
        """检查PostgreSQL数据库"""
        try:
            import psycopg
            import os
            
            db_url = os.getenv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5434/market_data')
            
            start = time.time()
            conn = psycopg.connect(db_url, connect_timeout=5)
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM market_data.candles_1m LIMIT 1")
            count = cursor.fetchone()[0]
            conn.close()
            response_time = (time.time() - start) * 1000
            
            return {
                "name": "database",
                "status": "healthy",
                "message": f"数据库连接正常，{count} 条记录",
                "response_time_ms": round(response_time, 2)
            }
        except Exception as e:
            return {
                "name": "database",
                "status": "degraded",  # 读模式，数据库不可用也能运行
                "message": f"数据库连接失败: {str(e)}"
            }
    
    def _check_data_files(self) -> Dict[str, Any]:
        """检查输出数据文件"""
        try:
            import os
            
            # 检查SQLite输出
            db_path = os.getenv('SQLITE_PATH', 
                '/app/libs/database/services/telegram-service/market_data.db')
            
            path = Path(db_path)
            if not path.exists():
                # 尝试替代路径
                alt_paths = [
                    'libs/database/services/telegram-service/market_data.db',
                    '/app/data/market_data.db'
                ]
                for alt in alt_paths:
                    if Path(alt).exists():
                        path = Path(alt)
                        break
            
            if path.exists():
                size_mb = path.stat().st_size / (1024 * 1024)
                
                # 检查文件是否在最近1小时内更新
                mtime = path.stat().st_mtime
                age_hours = (time.time() - mtime) / 3600
                
                if age_hours < 1:
                    status = "healthy"
                    message = f"数据文件正常 ({size_mb:.1f}MB, 更新于 {age_hours:.1f}小时前)"
                elif age_hours < 6:
                    status = "degraded"
                    message = f"数据文件较旧 ({size_mb:.1f}MB, 更新于 {age_hours:.1f}小时前)"
                else:
                    status = "unhealthy"
                    message = f"数据文件过期 ({size_mb:.1f}MB, 更新于 {age_hours:.1f}小时前)"
                
                return {
                    "name": "data_files",
                    "status": status,
                    "message": message,
                    "size_mb": round(size_mb, 2),
                    "age_hours": round(age_hours, 2)
                }
            else:
                return {
                    "name": "data_files",
                    "status": "unhealthy",
                    "message": "数据文件不存在"
                }
        except Exception as e:
            return {
                "name": "data_files",
                "status": "unhealthy",
                "message": f"检查失败: {str(e)}"
            }
    
    def _check_status(self) -> Dict[str, Any]:
        """检查运行状态"""
        global _status
        
        with _status_lock:
            running = _status.get("running", False)
            mode = _status.get("mode", "unknown")
            progress = _status.get("progress", 0)
            errors = _status.get("errors", [])
        
        if running:
            return {
                "name": "status",
                "status": "healthy",
                "message": f"运行中 ({mode}, 进度 {progress:.1f}%)",
                "progress": progress
            }
        else:
            # 检查最近是否有错误
            if errors:
                last_error = errors[-1]
                return {
                    "name": "status",
                    "status": "degraded",
                    "message": f"上次运行出错: {last_error}",
                    "errors_count": len(errors)
                }
            else:
                return {
                    "name": "status",
                    "status": "healthy",
                    "message": "空闲（批处理模式）"
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


def _is_data_fresh() -> bool:
    """检查数据是否新鲜（6小时内）"""
    try:
        import os
        from pathlib import Path
        
        db_path = os.getenv('SQLITE_PATH', 
            '/app/libs/database/services/telegram-service/market_data.db')
        
        path = Path(db_path)
        if not path.exists():
            return False
        
        mtime = path.stat().st_mtime
        age_hours = (time.time() - mtime) / 3600
        return age_hours < 6
    except:
        return False


class HealthServer:
    """健康检查服务器"""
    
    def __init__(self, host: str = "0.0.0.0", port: int = 8082):
        self.host = host
        self.port = port
        self.server = None
        self.thread = None
    
    def start(self):
        """启动健康检查服务器"""
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


def start_health_server(port: int = None):
    """启动健康检查服务器"""
    if port:
        health_server.port = port
    health_server.start()


def stop_health_server():
    """停止健康检查服务器"""
    health_server.stop()


def update_status(**kwargs):
    """更新状态"""
    global _status
    with _status_lock:
        _status.update(kwargs)


def set_running(running: bool, mode: str = None):
    """设置运行状态"""
    global _status
    with _status_lock:
        _status["running"] = running
        if mode:
            _status["mode"] = mode
        if running:
            _status["last_run"] = datetime.utcnow().isoformat() + "Z"


def set_progress(progress: float):
    """设置进度"""
    global _status
    with _status_lock:
        _status["progress"] = progress


def add_error(error: str):
    """添加错误记录"""
    global _status
    with _status_lock:
        if "errors" not in _status:
            _status["errors"] = []
        _status["errors"].append({
            "time": datetime.utcnow().isoformat() + "Z",
            "error": error
        })
        # 只保留最近10个错误
        _status["errors"] = _status["errors"][-10:]
