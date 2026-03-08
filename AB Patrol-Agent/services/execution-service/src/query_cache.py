"""
Query Service 缓存层

用途：
- 减少重复 API 调用
- 提高响应速度
- 符合 Al Brooks "Every bar matters" 原则（K 线缓存 60 秒）

缓存策略：
- K 线：60 秒 TTL（一根 5m bar 的时间）
- 持仓：5 秒 TTL（实时性要求高）
- 余额：30 秒 TTL（变化不频繁）
"""

import asyncio
import time
from typing import Any, Callable, Optional
from functools import wraps
import logging

logger = logging.getLogger(__name__)


class QueryCache:
    """查询缓存管理器"""

    def __init__(self):
        self._cache: dict[str, tuple[Any, float]] = {}  # key -> (value, expire_time)
        self._lock = asyncio.Lock()

    async def get(self, key: str) -> Optional[Any]:
        """获取缓存"""
        async with self._lock:
            if key in self._cache:
                value, expire_time = self._cache[key]
                if time.time() < expire_time:
                    logger.debug(f"[Cache HIT] {key}")
                    return value
                else:
                    # 过期，删除
                    del self._cache[key]
                    logger.debug(f"[Cache EXPIRED] {key}")
            return None

    async def set(self, key: str, value: Any, ttl: int):
        """设置缓存"""
        async with self._lock:
            expire_time = time.time() + ttl
            self._cache[key] = (value, expire_time)
            logger.debug(f"[Cache SET] {key} (TTL={ttl}s)")

    async def invalidate(self, pattern: str):
        """清除匹配的缓存"""
        async with self._lock:
            keys_to_delete = [k for k in self._cache.keys() if pattern in k]
            for key in keys_to_delete:
                del self._cache[key]
                logger.debug(f"[Cache INVALIDATE] {key}")

    async def clear(self):
        """清空所有缓存"""
        async with self._lock:
            self._cache.clear()
            logger.info("[Cache] 清空所有缓存")

    def stats(self) -> dict:
        """缓存统计"""
        total = len(self._cache)
        expired = sum(1 for _, (_, exp) in self._cache.items() if time.time() >= exp)
        return {
            "total": total,
            "active": total - expired,
            "expired": expired,
        }


# 全局缓存实例
_query_cache = QueryCache()


def get_query_cache() -> QueryCache:
    """获取全局缓存实例"""
    return _query_cache


def cached(ttl: int, key_prefix: str = ""):
    """
    缓存装饰器

    Args:
        ttl: 缓存时间（秒）
        key_prefix: 缓存键前缀

    用法:
        @cached(ttl=60, key_prefix="klines")
        async def get_klines(symbol: str, interval: str):
            ...
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # 生成缓存键
            cache_key = f"{key_prefix}:{func.__name__}:{args}:{kwargs}"

            # 尝试从缓存获取
            cached_value = await _query_cache.get(cache_key)
            if cached_value is not None:
                return cached_value

            # 缓存未命中，调用原函数
            result = await func(*args, **kwargs)

            # 存入缓存
            await _query_cache.set(cache_key, result, ttl)

            return result

        return wrapper
    return decorator


def invalidate_cache(pattern: str):
    """
    清除缓存装饰器

    用途：在修改数据后清除相关缓存

    用法:
        @invalidate_cache("positions")
        async def place_order(...):
            ...
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            result = await func(*args, **kwargs)
            # 执行成功后清除缓存
            await _query_cache.invalidate(pattern)
            return result
        return wrapper
    return decorator
