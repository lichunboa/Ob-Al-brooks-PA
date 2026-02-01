"""
统一日志配置
支持结构化JSON日志和开发友好的控制台输出
"""
import logging
import sys
import os
from pathlib import Path
from typing import Optional
import json
from datetime import datetime


class StructuredFormatter(logging.Formatter):
    """结构化日志格式化器"""
    
    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
            'service': getattr(record, 'service', 'unknown'),
        }
        
        # 添加额外字段
        if hasattr(record, 'extra'):
            log_data.update(record.extra)
        
        # 添加异常信息
        if record.exc_info:
            log_data['exception'] = self.formatException(record.exc_info)
        
        # 添加调用位置（开发模式）
        if os.getenv('LOG_INCLUDE_LOCATION', 'false').lower() == 'true':
            log_data['location'] = f"{record.pathname}:{record.lineno}"
        
        return json.dumps(log_data, ensure_ascii=False)


class ColoredFormatter(logging.Formatter):
    """带颜色的控制台格式化器"""
    
    COLORS = {
        'DEBUG': '\033[36m',     # 青色
        'INFO': '\033[32m',      # 绿色
        'WARNING': '\033[33m',   # 黄色
        'ERROR': '\033[31m',     # 红色
        'CRITICAL': '\033[35m',  # 紫色
        'RESET': '\033[0m'
    }
    
    def format(self, record: logging.LogRecord) -> str:
        # 添加颜色
        levelname = record.levelname
        if levelname in self.COLORS:
            record.levelname = f"{self.COLORS[levelname]}{levelname}{self.COLORS['RESET']}"
        
        # 格式化消息
        formatted = super().format(record)
        
        # 恢复原始levelname
        record.levelname = levelname
        
        return formatted


def setup_logging(
    service_name: str,
    level: Optional[str] = None,
    log_dir: Optional[str] = None,
    enable_file: bool = True,
    enable_console: bool = True,
    structured: bool = False
) -> logging.Logger:
    """
    配置统一日志
    
    Args:
        service_name: 服务名称
        level: 日志级别 (DEBUG/INFO/WARNING/ERROR)
        log_dir: 日志目录
        enable_file: 是否写入文件
        enable_console: 是否输出到控制台
        structured: 是否使用结构化JSON格式
    """
    # 获取日志级别
    log_level = getattr(logging, (level or os.getenv('LOG_LEVEL', 'INFO')).upper())
    
    # 创建logger
    logger = logging.getLogger()
    logger.setLevel(log_level)
    
    # 清除现有处理器
    logger.handlers = []
    
    # 创建服务过滤器
    class ServiceFilter(logging.Filter):
        def filter(self, record):
            record.service = service_name
            return True
    
    logger.addFilter(ServiceFilter())
    
    # 文件日志
    if enable_file:
        if log_dir is None:
            log_dir = os.path.join(os.getenv('PROJECT_ROOT', '.'), 'logs')
        
        Path(log_dir).mkdir(parents=True, exist_ok=True)
        
        # JSON结构化日志文件
        file_handler = logging.FileHandler(
            os.path.join(log_dir, f'{service_name}.jsonl'),
            encoding='utf-8'
        )
        file_handler.setLevel(log_level)
        file_handler.setFormatter(StructuredFormatter())
        logger.addHandler(file_handler)
        
        # 普通文本日志（便于人工查看）
        text_handler = logging.FileHandler(
            os.path.join(log_dir, f'{service_name}.log'),
            encoding='utf-8'
        )
        text_handler.setLevel(log_level)
        text_handler.setFormatter(
            logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
        )
        logger.addHandler(text_handler)
    
    # 控制台日志
    if enable_console:
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(log_level)
        
        # 根据环境选择格式
        if os.getenv('LOG_STRUCTURED_CONSOLE', 'false').lower() == 'true':
            console_handler.setFormatter(StructuredFormatter())
        else:
            console_handler.setFormatter(ColoredFormatter(
                '%(asctime)s - %(service)s - %(levelname)s - %(message)s',
                datefmt='%H:%M:%S'
            ))
        
        logger.addHandler(console_handler)
    
    # 添加额外字段的方法
    def _log_with_extra(self, level, msg, extra=None, *args, **kwargs):
        """支持额外字段的日志方法"""
        if extra:
            kwargs['extra'] = {'extra': extra}
        return self._original_log(level, msg, *args, **kwargs)
    
    # 保存原始方法
    logger._original_log = logger._log
    logger._log = _log_with_extra.__get__(logger, logging.Logger)
    
    # 便捷方法
    def log_with_context(level_name: str):
        def wrapper(msg, **kwargs):
            level_num = getattr(logging, level_name.upper())
            return logger._log(level_num, msg, (), {'extra': kwargs} if kwargs else None)
        return wrapper
    
    logger.info_ctx = log_with_context('INFO')
    logger.error_ctx = log_with_context('ERROR')
    logger.warning_ctx = log_with_context('WARNING')
    logger.debug_ctx = log_with_context('DEBUG')
    
    logger.info(f"Logging configured for service: {service_name}, level: {logging.getLevelName(log_level)}")
    
    return logger


def get_logger(name: str) -> logging.Logger:
    """获取已配置的logger"""
    return logging.getLogger(name)


# 便捷装饰器
def log_execution_time(logger: Optional[logging.Logger] = None):
    """记录函数执行时间的装饰器"""
    def decorator(func):
        import functools
        import time
        
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            nonlocal logger
            if logger is None:
                logger = logging.getLogger(func.__module__)
            
            start = time.time()
            try:
                result = func(*args, **kwargs)
                duration = time.time() - start
                logger.debug(
                    f"Function {func.__name__} executed in {duration:.3f}s",
                    extra={'duration': duration, 'function': func.__name__}
                )
                return result
            except Exception as e:
                duration = time.time() - start
                logger.error(
                    f"Function {func.__name__} failed after {duration:.3f}s: {e}",
                    extra={'duration': duration, 'function': func.__name__, 'error': str(e)},
                    exc_info=True
                )
                raise
        
        return wrapper
    return decorator
