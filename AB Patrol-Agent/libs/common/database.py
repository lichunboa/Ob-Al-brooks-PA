"""
数据库连接管理
统一的连接池配置和管理
"""
import os
from contextlib import asynccontextmanager
from typing import Optional, AsyncGenerator, Any
import asyncio
import logging

from psycopg_pool import AsyncConnectionPool, ConnectionPool
import psycopg

logger = logging.getLogger(__name__)


class DatabaseManager:
    """数据库连接管理器"""
    
    _instance = None
    _pools = {}
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    async def init_pool(
        self,
        name: str = "default",
        dsn: Optional[str] = None,
        min_size: int = 5,
        max_size: int = 20,
        max_idle: float = 300,
        max_lifetime: float = 3600,
        **kwargs
    ):
        """初始化连接池"""
        if name in self._pools:
            logger.warning(f"连接池 '{name}' 已存在，跳过初始化")
            return
        
        dsn = dsn or os.getenv('DATABASE_URL')
        if not dsn:
            raise ValueError("数据库DSN未提供，且DATABASE_URL环境变量未设置")
        
        try:
            # 解析配置
            config = {
                'min_size': int(os.getenv('DB_POOL_MIN_SIZE', min_size)),
                'max_size': int(os.getenv('DB_POOL_MAX_SIZE', max_size)),
                'max_idle': float(os.getenv('DB_POOL_MAX_IDLE', max_idle)),
                'max_lifetime': float(os.getenv('DB_POOL_MAX_LIFETIME', max_lifetime)),
                'timeout': float(os.getenv('DB_POOL_TIMEOUT', 30)),
                **kwargs
            }
            
            pool = AsyncConnectionPool(
                dsn,
                **config
            )
            
            # 测试连接
            async with pool.connection() as conn:
                async with conn.cursor() as cur:
                    await cur.execute("SELECT 1")
                    await cur.fetchone()
            
            self._pools[name] = pool
            logger.info(
                f"数据库连接池 '{name}' 初始化成功: "
                f"min={config['min_size']}, max={config['max_size']}"
            )
            
        except Exception as e:
            logger.error(f"数据库连接池 '{name}' 初始化失败: {e}")
            raise
    
    def get_pool(self, name: str = "default") -> AsyncConnectionPool:
        """获取连接池"""
        if name not in self._pools:
            raise KeyError(f"连接池 '{name}' 不存在，请先调用init_pool初始化")
        return self._pools[name]
    
    @asynccontextmanager
    async def connection(self, name: str = "default"):
        """获取连接的上下文管理器"""
        pool = self.get_pool(name)
        async with pool.connection() as conn:
            yield conn
    
    @asynccontextmanager
    async def transaction(self, name: str = "default"):
        """事务上下文管理器"""
        async with self.connection(name) as conn:
            async with conn.transaction():
                yield conn
    
    async def close(self, name: Optional[str] = None):
        """关闭连接池"""
        if name:
            if name in self._pools:
                await self._pools[name].close()
                del self._pools[name]
                logger.info(f"连接池 '{name}' 已关闭")
        else:
            # 关闭所有
            for name, pool in list(self._pools.items()):
                await pool.close()
                logger.info(f"连接池 '{name}' 已关闭")
            self._pools.clear()
    
    async def health_check(self, name: str = "default") -> dict:
        """健康检查"""
        try:
            pool = self.get_pool(name)
            async with pool.connection() as conn:
                async with conn.cursor() as cur:
                    start = asyncio.get_event_loop().time()
                    await cur.execute("SELECT 1")
                    await cur.fetchone()
                    response_time = (asyncio.get_event_loop().time() - start) * 1000
                    
                    return {
                        "status": "healthy",
                        "response_time_ms": round(response_time, 2),
                        "pool_size": pool.get_stats().get('pool_size', 0),
                        "available": pool.get_stats().get('available', 0)
                    }
        except Exception as e:
            return {
                "status": "unhealthy",
                "error": str(e)
            }


# 全局实例
db_manager = DatabaseManager()


# 便捷函数
async def init_database(**kwargs):
    """初始化数据库"""
    await db_manager.init_pool(**kwargs)


async def get_connection(name: str = "default"):
    """获取连接"""
    return db_manager.connection(name)


async def get_transaction(name: str = "default"):
    """获取事务"""
    return db_manager.transaction(name)


async def close_database(name: Optional[str] = None):
    """关闭数据库"""
    await db_manager.close(name)


# SQL执行辅助函数
async def fetch_one(
    sql: str,
    params: Optional[tuple] = None,
    pool_name: str = "default"
) -> Optional[tuple]:
    """查询单行"""
    async with db_manager.connection(pool_name) as conn:
        async with conn.cursor() as cur:
            await cur.execute(sql, params)
            return await cur.fetchone()


async def fetch_all(
    sql: str,
    params: Optional[tuple] = None,
    pool_name: str = "default"
) -> list:
    """查询多行"""
    async with db_manager.connection(pool_name) as conn:
        async with conn.cursor() as cur:
            await cur.execute(sql, params)
            return await cur.fetchall()


async def execute(
    sql: str,
    params: Optional[tuple] = None,
    pool_name: str = "default"
) -> int:
    """执行SQL，返回影响行数"""
    async with db_manager.connection(pool_name) as conn:
        async with conn.cursor() as cur:
            await cur.execute(sql, params)
            return cur.rowcount


# FastAPI生命周期集成
async def database_lifespan(app):
    """FastAPI数据库生命周期管理"""
    # 启动时初始化
    await init_database()
    yield
    # 关闭时清理
    await close_database()
