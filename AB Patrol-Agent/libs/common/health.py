"""
健康检查模块
提供统一的健康检查端点和状态监控
"""
import asyncio
import os
import time
from datetime import datetime
from typing import Callable, Dict, List, Optional, Any
from dataclasses import dataclass, field
from enum import Enum
import json


class HealthStatus(Enum):
    """健康状态"""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"


@dataclass
class HealthCheck:
    """健康检查项"""
    name: str
    status: HealthStatus
    response_time_ms: float
    message: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=datetime.utcnow)
    
    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "status": self.status.value,
            "response_time_ms": round(self.response_time_ms, 2),
            "message": self.message,
            "metadata": self.metadata,
            "timestamp": self.timestamp.isoformat() + "Z"
        }


@dataclass
class HealthReport:
    """健康报告"""
    service_name: str
    version: str
    status: HealthStatus
    checks: List[HealthCheck]
    uptime_seconds: float
    timestamp: datetime = field(default_factory=datetime.utcnow)
    
    def to_dict(self) -> dict:
        checks_dict = [c.to_dict() for c in self.checks]
        
        # 统计
        healthy_count = sum(1 for c in self.checks if c.status == HealthStatus.HEALTHY)
        degraded_count = sum(1 for c in self.checks if c.status == HealthStatus.DEGRADED)
        unhealthy_count = sum(1 for c in self.checks if c.status == HealthStatus.UNHEALTHY)
        
        return {
            "service": self.service_name,
            "version": self.version,
            "status": self.status.value,
            "summary": {
                "total": len(self.checks),
                "healthy": healthy_count,
                "degraded": degraded_count,
                "unhealthy": unhealthy_count
            },
            "uptime_seconds": round(self.uptime_seconds, 2),
            "timestamp": self.timestamp.isoformat() + "Z",
            "checks": checks_dict
        }
    
    def to_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False, indent=2)


class HealthChecker:
    """健康检查器"""
    
    def __init__(self, service_name: str, version: str = "1.0.0"):
        self.service_name = service_name
        self.version = version
        self._checks: Dict[str, Callable[[], asyncio.Future[HealthCheck]]] = {}
        self._start_time = time.time()
        self._check_history: List[HealthReport] = []
        self._max_history = 100
    
    def register(self, name: str, check_func: Callable[[], asyncio.Future[HealthCheck]]):
        """注册健康检查项"""
        self._checks[name] = check_func
    
    async def run_check(self, name: str) -> HealthCheck:
        """运行单个检查"""
        if name not in self._checks:
            return HealthCheck(
                name=name,
                status=HealthStatus.UNHEALTHY,
                response_time_ms=0,
                message=f"检查项 '{name}' 未注册"
            )
        
        start = time.time()
        try:
            result = await asyncio.wait_for(
                self._checks[name](),
                timeout=10.0
            )
            result.response_time_ms = (time.time() - start) * 1000
            return result
        except asyncio.TimeoutError:
            return HealthCheck(
                name=name,
                status=HealthStatus.UNHEALTHY,
                response_time_ms=(time.time() - start) * 1000,
                message="检查超时 (>10s)"
            )
        except Exception as e:
            return HealthCheck(
                name=name,
                status=HealthStatus.UNHEALTHY,
                response_time_ms=(time.time() - start) * 1000,
                message=f"检查异常: {str(e)}"
            )
    
    async def run_all_checks(self) -> HealthReport:
        """运行所有检查"""
        checks = []
        
        # 并行运行所有检查
        results = await asyncio.gather(*[
            self.run_check(name)
            for name in self._checks.keys()
        ])
        
        checks = list(results)
        
        # 确定总体状态
        if any(c.status == HealthStatus.UNHEALTHY for c in checks):
            status = HealthStatus.UNHEALTHY
        elif any(c.status == HealthStatus.DEGRADED for c in checks):
            status = HealthStatus.DEGRADED
        else:
            status = HealthStatus.HEALTHY
        
        report = HealthReport(
            service_name=self.service_name,
            version=self.version,
            status=status,
            checks=checks,
            uptime_seconds=time.time() - self._start_time
        )
        
        # 保存历史
        self._check_history.append(report)
        if len(self._check_history) > self._max_history:
            self._check_history.pop(0)
        
        return report
    
    def get_history(self, limit: int = 10) -> List[HealthReport]:
        """获取历史检查记录"""
        return self._check_history[-limit:]


# 内置检查函数
async def check_database(db_url: str) -> HealthCheck:
    """检查数据库连接"""
    import psycopg
    
    start = time.time()
    try:
        conn = psycopg.connect(db_url, connect_timeout=5)
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.fetchone()
        conn.close()
        
        return HealthCheck(
            name="database",
            status=HealthStatus.HEALTHY,
            response_time_ms=(time.time() - start) * 1000,
            message="数据库连接正常"
        )
    except Exception as e:
        return HealthCheck(
            name="database",
            status=HealthStatus.UNHEALTHY,
            response_time_ms=(time.time() - start) * 1000,
            message=f"数据库连接失败: {str(e)}"
        )


async def check_disk_space(path: str = "/", threshold_percent: float = 90.0) -> HealthCheck:
    """检查磁盘空间"""
    import shutil
    
    start = time.time()
    try:
        stat = shutil.disk_usage(path)
        used_percent = (stat.used / stat.total) * 100
        free_gb = stat.free / (1024**3)
        
        if used_percent > threshold_percent:
            status = HealthStatus.UNHEALTHY
            message = f"磁盘空间不足: {used_percent:.1f}% 已使用"
        elif used_percent > threshold_percent * 0.8:
            status = HealthStatus.DEGRADED
            message = f"磁盘空间警告: {used_percent:.1f}% 已使用"
        else:
            status = HealthStatus.HEALTHY
            message = f"磁盘空间正常: {used_percent:.1f}% 已使用"
        
        return HealthCheck(
            name="disk_space",
            status=status,
            response_time_ms=(time.time() - start) * 1000,
            message=message,
            metadata={
                "total_gb": round(stat.total / (1024**3), 2),
                "used_gb": round(stat.used / (1024**3), 2),
                "free_gb": round(free_gb, 2),
                "used_percent": round(used_percent, 2)
            }
        )
    except Exception as e:
        return HealthCheck(
            name="disk_space",
            status=HealthStatus.UNHEALTHY,
            response_time_ms=(time.time() - start) * 1000,
            message=f"检查磁盘空间失败: {str(e)}"
        )


async def check_memory(threshold_percent: float = 90.0) -> HealthCheck:
    """检查内存使用"""
    import psutil
    
    start = time.time()
    try:
        mem = psutil.virtual_memory()
        
        if mem.percent > threshold_percent:
            status = HealthStatus.UNHEALTHY
            message = f"内存使用过高: {mem.percent:.1f}%"
        elif mem.percent > threshold_percent * 0.8:
            status = HealthStatus.DEGRADED
            message = f"内存使用警告: {mem.percent:.1f}%"
        else:
            status = HealthStatus.HEALTHY
            message = f"内存使用正常: {mem.percent:.1f}%"
        
        return HealthCheck(
            name="memory",
            status=status,
            response_time_ms=(time.time() - start) * 1000,
            message=message,
            metadata={
                "total_mb": round(mem.total / (1024**2), 2),
                "available_mb": round(mem.available / (1024**2), 2),
                "used_percent": mem.percent
            }
        )
    except Exception as e:
        return HealthCheck(
            name="memory",
            status=HealthStatus.UNHEALTHY,
            response_time_ms=(time.time() - start) * 1000,
            message=f"检查内存失败: {str(e)}"
        )


async def check_external_api(url: str, timeout: float = 5.0) -> HealthCheck:
    """检查外部API可用性"""
    import aiohttp
    
    start = time.time()
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=timeout) as resp:
                if resp.status < 500:
                    return HealthCheck(
                        name=f"external_api_{url.split('/')[2]}",
                        status=HealthStatus.HEALTHY,
                        response_time_ms=(time.time() - start) * 1000,
                        message=f"API正常 (HTTP {resp.status})",
                        metadata={"status_code": resp.status}
                    )
                else:
                    return HealthCheck(
                        name=f"external_api_{url.split('/')[2]}",
                        status=HealthStatus.DEGRADED,
                        response_time_ms=(time.time() - start) * 1000,
                        message=f"API异常 (HTTP {resp.status})",
                        metadata={"status_code": resp.status}
                    )
    except Exception as e:
        return HealthCheck(
            name=f"external_api_{url.split('/')[2]}",
            status=HealthStatus.UNHEALTHY,
            response_time_ms=(time.time() - start) * 1000,
            message=f"API检查失败: {str(e)}"
        )


# FastAPI集成
from fastapi import APIRouter, Response

def create_health_router(checker: HealthChecker) -> APIRouter:
    """创建FastAPI健康检查路由"""
    router = APIRouter()
    
    @router.get("/health")
    async def health_check():
        report = await checker.run_all_checks()
        
        # 根据状态设置HTTP状态码
        if report.status == HealthStatus.HEALTHY:
            status_code = 200
        elif report.status == HealthStatus.DEGRADED:
            status_code = 200  # 仍可用，但有问题
        else:
            status_code = 503  # Service Unavailable
        
        return Response(
            content=report.to_json(),
            media_type="application/json",
            status_code=status_code
        )
    
    @router.get("/health/live")
    async def liveness_probe():
        """Kubernetes liveness probe"""
        return {"status": "alive"}
    
    @router.get("/health/ready")
    async def readiness_probe():
        """Kubernetes readiness probe"""
        report = await checker.run_all_checks()
        
        if report.status == HealthStatus.UNHEALTHY:
            return Response(
                content=json.dumps({"status": "not_ready"}),
                media_type="application/json",
                status_code=503
            )
        
        return {"status": "ready"}
    
    return router
