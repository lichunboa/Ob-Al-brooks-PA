"""
AB Console 通用工具库
提供统一的配置、日志、数据库、健康检查等功能
"""

import logging

logger = logging.getLogger(__name__)

# 配置中心
from .service_discovery import (
    ServiceRegistry,
    ServiceConfig,
    AppConfig,
    get_service_url,
    get_db_url,
    is_docker
)

# 日志
from .logging_config import (
    setup_logging,
    get_logger,
    log_execution_time
)

# 数据库（可选依赖，缺失时允许非数据库服务降级启动）
try:
    from .database import (
        DatabaseManager,
        db_manager,
        init_database,
        get_connection,
        get_transaction,
        close_database,
        fetch_one,
        fetch_all,
        execute,
        database_lifespan
    )
except Exception as exc:  # pragma: no cover - 缺依赖时降级
    DatabaseManager = None
    db_manager = None

    async def init_database(*args, **kwargs):
        raise RuntimeError(f"database dependency unavailable: {exc}")

    async def get_connection(*args, **kwargs):
        raise RuntimeError(f"database dependency unavailable: {exc}")

    async def get_transaction(*args, **kwargs):
        raise RuntimeError(f"database dependency unavailable: {exc}")

    async def close_database(*args, **kwargs):
        raise RuntimeError(f"database dependency unavailable: {exc}")

    async def fetch_one(*args, **kwargs):
        raise RuntimeError(f"database dependency unavailable: {exc}")

    async def fetch_all(*args, **kwargs):
        raise RuntimeError(f"database dependency unavailable: {exc}")

    async def execute(*args, **kwargs):
        raise RuntimeError(f"database dependency unavailable: {exc}")

    async def database_lifespan(*args, **kwargs):
        raise RuntimeError(f"database dependency unavailable: {exc}")

    logger.warning("⚠️ libs.common.database 已降级禁用: %s", exc)

# 健康检查（可选依赖，缺失时允许非 Web 服务降级启动）
try:
    from .health import (
        HealthChecker,
        HealthCheck,
        HealthReport,
        HealthStatus,
        create_health_router,
        check_database,
        check_disk_space,
        check_memory,
        check_external_api
    )
except Exception as exc:  # pragma: no cover - 缺依赖时降级
    HealthChecker = None
    HealthCheck = None
    HealthReport = None
    HealthStatus = None

    def create_health_router(*args, **kwargs):
        raise RuntimeError(f"health dependency unavailable: {exc}")

    def check_database(*args, **kwargs):
        raise RuntimeError(f"health dependency unavailable: {exc}")

    def check_disk_space(*args, **kwargs):
        raise RuntimeError(f"health dependency unavailable: {exc}")

    def check_memory(*args, **kwargs):
        raise RuntimeError(f"health dependency unavailable: {exc}")

    def check_external_api(*args, **kwargs):
        raise RuntimeError(f"health dependency unavailable: {exc}")

    # health 依赖主要面向 Web/HTTP 服务；对非 Web 进程默认静默，避免启动日志被误导性告警刷屏。
    logger.debug("libs.common.health optional dependency unavailable: %s", exc)

# 弹性设计
from .resilience import (
    CircuitBreaker,
    CircuitBreakerConfig,
    CircuitBreakerOpen,
    circuit_breaker,
    get_circuit_breaker,
    retry,
    retry_with_backoff,
    resilient,
    RateLimiter,
    RateLimitExceeded,
    rate_limit,
    get_rate_limiter
)

# 验证
from .validation import (
    ValidationError,
    ValidationErrors,
    Validator,
    FieldValidator,
    StringField,
    IntegerField,
    FloatField,
    BooleanField,
    ListField,
    SymbolValidator,
    TimeframeValidator,
    signal_validator,
    query_validator
)

__version__ = "2.0.0"

__all__ = [
    # 配置
    'ServiceRegistry',
    'ServiceConfig',
    'AppConfig',
    'get_service_url',
    'get_db_url',
    'is_docker',

    # 日志
    'setup_logging',
    'get_logger',
    'log_execution_time',

    # 数据库
    'DatabaseManager',
    'db_manager',
    'init_database',
    'get_connection',
    'get_transaction',
    'close_database',
    'fetch_one',
    'fetch_all',
    'execute',
    'database_lifespan',

    # 健康检查
    'HealthChecker',
    'HealthCheck',
    'HealthReport',
    'HealthStatus',
    'create_health_router',
    'check_database',
    'check_disk_space',
    'check_memory',
    'check_external_api',

    # 弹性设计
    'CircuitBreaker',
    'CircuitBreakerConfig',
    'CircuitBreakerOpen',
    'circuit_breaker',
    'get_circuit_breaker',
    'retry',
    'retry_with_backoff',
    'resilient',
    'RateLimiter',
    'RateLimitExceeded',
    'rate_limit',
    'get_rate_limiter',

    # 验证
    'ValidationError',
    'ValidationErrors',
    'Validator',
    'FieldValidator',
    'StringField',
    'IntegerField',
    'FloatField',
    'BooleanField',
    'ListField',
    'SymbolValidator',
    'TimeframeValidator',
    'signal_validator',
    'query_validator',
]
