"""
Telegram Service 健康检查模块
"""
import asyncio
import json
import time
import logging
from datetime import datetime
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

# 全局状态
_start_time = time.time()
_bot_instance = None
_application = None


class HealthChecker:
    """健康检查器"""
    
    def __init__(self, bot=None, application=None):
        global _bot_instance, _application
        _bot_instance = bot
        _application = application
    
    async def check_all(self) -> Dict[str, Any]:
        """执行所有健康检查"""
        checks = []
        
        # Bot状态检查
        bot_check = await self._check_bot()
        checks.append(bot_check)
        
        # 数据库检查
        db_check = await self._check_database()
        checks.append(db_check)
        
        # 数据文件检查
        data_check = self._check_data_files()
        checks.append(data_check)
        
        # 内存检查
        memory_check = self._check_memory()
        checks.append(memory_check)
        
        # 确定总体状态
        if any(c.get('status') == 'unhealthy' for c in checks):
            status = 'unhealthy'
        elif any(c.get('status') == 'degraded' for c in checks):
            status = 'degraded'
        else:
            status = 'healthy'
        
        uptime = time.time() - _start_time
        
        return {
            "service": "telegram-service",
            "version": "2.0.0",
            "status": status,
            "uptime_seconds": round(uptime, 2),
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "checks": checks
        }
    
    async def _check_bot(self) -> Dict[str, Any]:
        """检查Bot状态"""
        try:
            global _bot_instance
            
            if _bot_instance is None:
                # 尝试从application获取bot
                global _application
                if _application and hasattr(_application, 'bot'):
                    _bot_instance = _application.bot
            
            if _bot_instance is None:
                return {
                    "name": "bot",
                    "status": "degraded",
                    "message": "Bot实例未初始化（可能在启动中）"
                }
            
            # 获取Bot信息
            me = await _bot_instance.get_me()
            
            return {
                "name": "bot",
                "status": "healthy",
                "message": f"Bot @{me.username} 运行正常",
                "username": me.username,
                "id": me.id
            }
        except Exception as e:
            return {
                "name": "bot",
                "status": "unhealthy",
                "message": f"Bot检查失败: {str(e)}"
            }
    
    async def _check_database(self) -> Dict[str, Any]:
        """检查数据库连接"""
        try:
            import os
            import sqlite3
            
            # 检查指标数据库
            db_path = os.getenv('MARKET_DATA_DB', 
                '/app/libs/database/services/telegram-service/market_data.db')
            
            if not db_path or not db_path.exists():
                # 尝试其他路径
                alt_paths = [
                    'libs/database/services/telegram-service/market_data.db',
                    '/app/data/market_data.db',
                    'data/market_data.db'
                ]
                for path in alt_paths:
                    p = __import__('pathlib').Path(path)
                    if p.exists():
                        db_path = p
                        break
            
            if not db_path or not db_path.exists():
                return {
                    "name": "database",
                    "status": "degraded",
                    "message": "指标数据库文件不存在（可能正在生成）"
                }
            
            # 测试连接
            conn = sqlite3.connect(str(db_path), timeout=5)
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' LIMIT 1")
            tables = cursor.fetchall()
            conn.close()
            
            return {
                "name": "database",
                "status": "healthy",
                "message": f"数据库正常，包含 {len(tables)} 个表",
                "tables_count": len(tables)
            }
        except Exception as e:
            return {
                "name": "database",
                "status": "degraded",
                "message": f"数据库检查失败: {str(e)}"
            }
    
    def _check_data_files(self) -> Dict[str, Any]:
        """检查数据文件"""
        try:
            from pathlib import Path
            import os
            
            checks = []
            
            # 检查关键文件
            critical_files = [
                ('locales', Path('locales')),
                ('assets', Path('assets')),
            ]
            
            missing = []
            for name, path in critical_files:
                if not path.exists():
                    missing.append(name)
            
            if missing:
                return {
                    "name": "data_files",
                    "status": "degraded",
                    "message": f"缺少目录: {', '.join(missing)}"
                }
            
            return {
                "name": "data_files",
                "status": "healthy",
                "message": "所有关键文件正常"
            }
        except Exception as e:
            return {
                "name": "data_files",
                "status": "degraded",
                "message": f"文件检查失败: {str(e)}"
            }
    
    def _check_memory(self) -> Dict[str, Any]:
        """检查内存使用"""
        try:
            import psutil
            
            process = psutil.Process()
            memory_info = process.memory_info()
            memory_mb = memory_info.rss / 1024 / 1024
            
            # 获取系统内存
            system_mem = psutil.virtual_memory()
            
            if system_mem.percent > 90:
                status = "unhealthy"
            elif system_mem.percent > 80:
                status = "degraded"
            else:
                status = "healthy"
            
            return {
                "name": "memory",
                "status": status,
                "message": f"进程内存: {memory_mb:.1f}MB, 系统: {system_mem.percent:.1f}%",
                "process_mb": round(memory_mb, 2),
                "system_percent": system_mem.percent
            }
        except ImportError:
            return {
                "name": "memory",
                "status": "healthy",
                "message": "内存检查不可用（psutil未安装）"
            }
        except Exception as e:
            return {
                "name": "memory",
                "status": "degraded",
                "message": f"内存检查失败: {str(e)}"
            }
    
    def check_liveness(self) -> Dict[str, Any]:
        """存活检查"""
        return {
            "status": "alive",
            "service": "telegram-service",
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }
    
    async def check_readiness(self) -> Dict[str, Any]:
        """就绪检查"""
        try:
            global _bot_instance, _application
            
            # 检查application是否运行
            if _application is None:
                return {
                    "status": "not_ready",
                    "reason": "Application未初始化"
                }
            
            if not _application.running:
                return {
                    "status": "not_ready", 
                    "reason": "Application未运行"
                }
            
            return {
                "status": "ready",
                "service": "telegram-service"
            }
        except Exception as e:
            return {
                "status": "not_ready",
                "reason": str(e)
            }


# 便捷函数
async def get_health_report() -> Dict[str, Any]:
    """获取健康报告"""
    checker = HealthChecker()
    return await checker.check_all()


def get_liveness() -> Dict[str, Any]:
    """获取存活状态"""
    return {
        "status": "alive",
        "service": "telegram-service",
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }


async def get_readiness() -> Dict[str, Any]:
    """获取就绪状态"""
    checker = HealthChecker()
    return await checker.check_readiness()
