"""
弹性设计模式
熔断器、重试、限流
"""
import asyncio
import time
import functools
import logging
from enum import Enum
from typing import Callable, Any, Optional, TypeVar
from dataclasses import dataclass, field
from collections import deque

logger = logging.getLogger(__name__)

T = TypeVar('T')


class CircuitState(Enum):
    """熔断器状态"""
    CLOSED = "closed"      # 正常
    OPEN = "open"          # 熔断
    HALF_OPEN = "half_open"  # 半开


@dataclass
class CircuitBreakerConfig:
    """熔断器配置"""
    failure_threshold: int = 5          # 失败次数阈值
    recovery_timeout: float = 60.0      # 恢复超时(秒)
    half_open_max_calls: int = 3        # 半开状态最大尝试次数
    expected_exception: tuple = (Exception,)  # 视为失败的异常类型


class CircuitBreaker:
    """熔断器"""
    
    def __init__(self, name: str, config: CircuitBreakerConfig = None):
        self.name = name
        self.config = config or CircuitBreakerConfig()
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.success_count = 0
        self.last_failure_time: Optional[float] = None
        self.half_open_calls = 0
        self._lock = asyncio.Lock()
    
    async def call(self, func: Callable[..., T], *args, **kwargs) -> T:
        """执行函数，带熔断保护"""
        async with self._lock:
            await self._update_state()
            
            if self.state == CircuitState.OPEN:
                raise CircuitBreakerOpen(f"熔断器 '{self.name}' 已打开")
        
        # 执行函数
        try:
            result = await func(*args, **kwargs)
            await self._on_success()
            return result
        except self.config.expected_exception as e:
            await self._on_failure()
            raise
    
    async def _update_state(self):
        """更新熔断器状态"""
        if self.state == CircuitState.OPEN:
            # 检查是否超时
            if self.last_failure_time and \
               (time.time() - self.last_failure_time) >= self.config.recovery_timeout:
                logger.info(f"熔断器 '{self.name}' 进入半开状态")
                self.state = CircuitState.HALF_OPEN
                self.half_open_calls = 0
                self.failure_count = 0
                self.success_count = 0
    
    async def _on_success(self):
        """成功回调"""
        async with self._lock:
            if self.state == CircuitState.HALF_OPEN:
                self.success_count += 1
                self.half_open_calls += 1
                
                # 半开状态成功次数足够，关闭熔断器
                if self.success_count >= self.config.half_open_max_calls:
                    logger.info(f"熔断器 '{self.name}' 关闭")
                    self.state = CircuitState.CLOSED
                    self.failure_count = 0
                    self.success_count = 0
            elif self.state == CircuitState.CLOSED:
                # 重置失败计数
                self.failure_count = 0
    
    async def _on_failure(self):
        """失败回调"""
        async with self._lock:
            self.failure_count += 1
            self.last_failure_time = time.time()
            
            if self.state == CircuitState.HALF_OPEN:
                # 半开状态失败，重新打开
                logger.warning(f"熔断器 '{self.name}' 重新打开")
                self.state = CircuitState.OPEN
            elif self.state == CircuitState.CLOSED and \
                 self.failure_count >= self.config.failure_threshold:
                # 达到阈值，打开熔断器
                logger.warning(
                    f"熔断器 '{self.name}' 打开 (连续失败{self.failure_count}次)"
                )
                self.state = CircuitState.OPEN
    
    @property
    def stats(self) -> dict:
        """获取统计信息"""
        return {
            "name": self.name,
            "state": self.state.value,
            "failure_count": self.failure_count,
            "success_count": self.success_count,
            "last_failure_time": self.last_failure_time
        }


class CircuitBreakerOpen(Exception):
    """熔断器打开异常"""
    pass


# 全局熔断器注册表
_circuit_breakers: dict[str, CircuitBreaker] = {}


def get_circuit_breaker(name: str, config: CircuitBreakerConfig = None) -> CircuitBreaker:
    """获取或创建熔断器"""
    if name not in _circuit_breakers:
        _circuit_breakers[name] = CircuitBreaker(name, config)
    return _circuit_breakers[name]


def circuit_breaker(
    name: str,
    failure_threshold: int = 5,
    recovery_timeout: float = 60.0,
    expected_exception: tuple = (Exception,)
):
    """熔断器装饰器"""
    config = CircuitBreakerConfig(
        failure_threshold=failure_threshold,
        recovery_timeout=recovery_timeout,
        expected_exception=expected_exception
    )
    
    def decorator(func):
        breaker = get_circuit_breaker(name, config)
        
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            return await breaker.call(func, *args, **kwargs)
        
        # 附加统计信息
        wrapper.circuit_breaker = breaker
        return wrapper
    return decorator


# 重试机制
@dataclass
class RetryConfig:
    """重试配置"""
    max_attempts: int = 3
    base_delay: float = 1.0
    max_delay: float = 60.0
    exponential_base: float = 2.0
    retryable_exceptions: tuple = (Exception,)
    on_retry: Optional[Callable[[Exception, int], Any]] = None


async def retry_with_backoff(
    func: Callable[..., T],
    config: RetryConfig = None,
    *args,
    **kwargs
) -> T:
    """带退避的重试"""
    config = config or RetryConfig()
    last_exception = None
    
    for attempt in range(1, config.max_attempts + 1):
        try:
            return await func(*args, **kwargs)
        except config.retryable_exceptions as e:
            last_exception = e
            
            if attempt == config.max_attempts:
                logger.error(f"重试{config.max_attempts}次后仍失败: {e}")
                raise
            
            # 计算延迟
            delay = min(
                config.base_delay * (config.exponential_base ** (attempt - 1)),
                config.max_delay
            )
            
            logger.warning(f"第{attempt}次尝试失败: {e}，{delay:.1f}秒后重试...")
            
            if config.on_retry:
                await config.on_retry(e, attempt)
            
            await asyncio.sleep(delay)
    
    raise last_exception


def retry(
    max_attempts: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    exponential_base: float = 2.0,
    retryable_exceptions: tuple = (Exception,)
):
    """重试装饰器"""
    config = RetryConfig(
        max_attempts=max_attempts,
        base_delay=base_delay,
        max_delay=max_delay,
        exponential_base=exponential_base,
        retryable_exceptions=retryable_exceptions
    )
    
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            return await retry_with_backoff(func, config, *args, **kwargs)
        return wrapper
    return decorator


# 组合装饰器：熔断 + 重试
def resilient(
    circuit_name: str,
    failure_threshold: int = 5,
    recovery_timeout: float = 60.0,
    max_attempts: int = 3,
    base_delay: float = 1.0
):
    """
    弹性装饰器：熔断 + 重试
    
    使用示例:
        @resilient(
            circuit_name="binance_api",
            failure_threshold=5,
            max_attempts=3
        )
        async def fetch_market_data(symbol):
            # 可能会失败的代码
            pass
    """
    def decorator(func):
        # 先应用重试
        retry_decorated = retry(
            max_attempts=max_attempts,
            base_delay=base_delay
        )(func)
        
        # 再应用熔断
        circuit_decorated = circuit_breaker(
            name=circuit_name,
            failure_threshold=failure_threshold,
            recovery_timeout=recovery_timeout
        )(retry_decorated)
        
        return circuit_decorated
    return decorator


# 限流器
@dataclass
class RateLimiterConfig:
    """限流器配置"""
    max_calls: int = 10      # 最大调用次数
    period: float = 1.0      # 时间窗口(秒)


class RateLimiter:
    """滑动窗口限流器"""
    
    def __init__(self, name: str, config: RateLimiterConfig = None):
        self.name = name
        self.config = config or RateLimiterConfig()
        self.calls: deque[float] = deque()
        self._lock = asyncio.Lock()
    
    async def acquire(self):
        """获取许可"""
        async with self._lock:
            now = time.time()
            
            # 清理过期记录
            cutoff = now - self.config.period
            while self.calls and self.calls[0] < cutoff:
                self.calls.popleft()
            
            # 检查是否超限
            if len(self.calls) >= self.config.max_calls:
                wait_time = self.calls[0] - cutoff
                raise RateLimitExceeded(
                    f"限流器 '{self.name}' 触发，请等待{wait_time:.2f}秒"
                )
            
            self.calls.append(now)
    
    @property
    def current_calls(self) -> int:
        """当前调用次数"""
        now = time.time()
        cutoff = now - self.config.period
        # 清理并计数
        while self.calls and self.calls[0] < cutoff:
            self.calls.popleft()
        return len(self.calls)
    
    @property
    def remaining(self) -> int:
        """剩余可用次数"""
        return self.config.max_calls - self.current_calls


class RateLimitExceeded(Exception):
    """限流异常"""
    pass


# 全局限流器注册表
_rate_limiters: dict[str, RateLimiter] = {}


def get_rate_limiter(name: str, config: RateLimiterConfig = None) -> RateLimiter:
    """获取或创建限流器"""
    if name not in _rate_limiters:
        _rate_limiters[name] = RateLimiter(name, config)
    return _rate_limiters[name]


def rate_limit(max_calls: int = 10, period: float = 1.0):
    """限流装饰器"""
    config = RateLimiterConfig(max_calls=max_calls, period=period)
    
    def decorator(func):
        # 使用函数名作为限流器名
        limiter = get_rate_limiter(func.__name__, config)
        
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            await limiter.acquire()
            return await func(*args, **kwargs)
        
        wrapper.rate_limiter = limiter
        return wrapper
    return decorator
