"""
可观测性模块

提供：
- 结构化日志 (JSON格式)
- 指标收集 (Prometheus格式)
- 简易Tracing
- 告警通知
"""
from .logger import setup_logging, get_logger, log_context
from .metrics import metrics, MetricsCollector
from .tracing import Span, trace
from .alerting import alert, AlertLevel

__all__ = [
    "setup_logging", "get_logger", "log_context",
    "metrics", "MetricsCollector",
    "Span", "trace",
    "alert", "AlertLevel",
]
