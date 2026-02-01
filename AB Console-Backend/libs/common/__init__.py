"""
AB Console 通用工具库
提供统一的配置、日志、数据库、健康检查等功能
"""

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

# 数据库
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

# 健康检查
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
