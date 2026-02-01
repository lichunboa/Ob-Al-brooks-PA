"""
服务发现与配置中心
自动适配Docker和本地开发环境
"""
import os
from typing import Optional
from dataclasses import dataclass


@dataclass
class ServiceConfig:
    """服务配置"""
    name: str
    port: int
    docker_host: str
    local_port: Optional[int] = None
    
    @property
    def local_host(self) -> str:
        return "localhost"
    
    def get_url(self, protocol: str = "http") -> str:
        """获取服务URL（自动检测环境）"""
        in_docker = os.path.exists('/.dockerenv')
        
        if in_docker:
            host = self.docker_host
            port = self.port
        else:
            # 本地开发环境
            host = self.local_host
            # 从环境变量读取，或使用配置值
            env_var = f"{self.name.upper().replace('-', '_')}_PORT"
            port = int(os.getenv(env_var, self.local_port or self.port))
        
        # WebSocket协议转换
        if protocol == "ws" and in_docker:
            protocol = "http"  # Docker内部使用http
        elif protocol == "ws":
            protocol = "ws"
            
        return f"{protocol}://{host}:{port}"


class ServiceRegistry:
    """服务注册表 - 统一管理所有服务地址"""
    
    # 服务配置表
    _services = {
        'data-service': ServiceConfig(
            name='data-service',
            port=8081,
            docker_host='data-service',
            local_port=8081
        ),
        'trading-service': ServiceConfig(
            name='trading-service',
            port=8082,
            docker_host='trading-service',
            local_port=8082
        ),
        'signal-service': ServiceConfig(
            name='signal-service',
            port=8083,
            docker_host='signal-service',
            local_port=8083
        ),
        'telegram-service': ServiceConfig(
            name='telegram-service',
            port=8090,
            docker_host='telegram-service',
            local_port=8090
        ),
        'sync-service': ServiceConfig(
            name='sync-service',
            port=8089,
            docker_host='sync-service',
            local_port=8089
        ),
        'api-service': ServiceConfig(
            name='api-service',
            port=8088,
            docker_host='api-service',
            local_port=8088
        ),
        'timescaledb': ServiceConfig(
            name='timescaledb',
            port=5432,
            docker_host='timescaledb',
            local_port=5434
        ),
    }
    
    @classmethod
    def get_service(cls, name: str) -> ServiceConfig:
        """获取服务配置"""
        if name not in cls._services:
            raise ValueError(f"未知服务: {name}")
        return cls._services[name]
    
    @classmethod
    def get_url(cls, service_name: str, protocol: str = "http") -> str:
        """快速获取服务URL"""
        return cls.get_service(service_name).get_url(protocol)
    
    @classmethod
    def get_db_url(cls, 
                   user: str = "postgres", 
                   password: str = "postgres",
                   dbname: str = "market_data") -> str:
        """获取数据库URL"""
        service = cls._services['timescaledb']
        in_docker = os.path.exists('/.dockerenv')
        
        host = service.docker_host if in_docker else service.local_host
        port = service.port if in_docker else int(
            os.getenv('TIMESCALE_PORT', service.local_port)
        )
        
        return f"postgresql://{user}:{password}@{host}:{port}/{dbname}"
    
    @classmethod
    def is_docker(cls) -> bool:
        """检查是否在Docker环境中"""
        return os.path.exists('/.dockerenv')


class AppConfig:
    """应用配置 - 统一管理业务配置"""
    
    # Telegram配置
    @staticmethod
    def get_bot_token() -> str:
        """获取Bot Token（强制从环境变量读取）"""
        token = os.getenv('BOT_TOKEN') or os.getenv('TELEGRAM_BOT_TOKEN')
        if not token:
            raise ValueError(
                "BOT_TOKEN环境变量未设置! "
                "请在config/.env中配置"")
        return token
    
    # 币种配置
    @staticmethod
    def get_symbols_groups() -> str:
        """获取币种分组配置"""
        return os.getenv('SYMBOLS_GROUPS', 'main4')
    
    @staticmethod
    def get_default_symbols() -> list:
        """获取默认币种列表"""
        groups = AppConfig.get_symbols_groups().split(',')
        symbols = []
        for group in groups:
            group = group.strip()
            env_key = f'SYMBOLS_GROUP_{group}'
            group_symbols = os.getenv(env_key)
            if group_symbols:
                symbols.extend([s.strip() for s in group_symbols.split(',')])
        
        # 如果没有配置，返回默认值
        return symbols or ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT']
    
    # 外部服务配置
    @staticmethod
    def get_clawdbot_webhook() -> str:
        """获取Clawdbot Webhook地址"""
        default = 'http://host.docker.internal:18789/webhook/albrooks'
        return os.getenv('CLAWDBOT_WEBHOOK', default)
    
    # 路径配置
    @staticmethod
    def get_project_root() -> str:
        """获取项目根目录"""
        return os.getenv('PROJECT_ROOT', '/app' if ServiceRegistry.is_docker() else 
                        os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
    
    @staticmethod
    def get_data_dir() -> str:
        """获取数据目录"""
        return os.path.join(AppConfig.get_project_root(), 'data')
    
    @staticmethod
    def get_logs_dir() -> str:
        """获取日志目录"""
        return os.path.join(AppConfig.get_project_root(), 'logs')


# 便捷函数
def get_service_url(service_name: str, protocol: str = "http") -> str:
    """获取服务URL的快捷函数"""
    return ServiceRegistry.get_url(service_name, protocol)


def get_db_url() -> str:
    """获取数据库URL的快捷函数"""
    return ServiceRegistry.get_db_url()


def is_docker() -> bool:
    """检查是否在Docker环境中的快捷函数"""
    return ServiceRegistry.is_docker()
