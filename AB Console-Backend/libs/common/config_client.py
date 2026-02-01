"""
配置服务客户端
用于从其他服务或插件访问配置API
"""
import os
from typing import Dict, Any, List, Optional
import httpx
from functools import lru_cache


class ConfigClient:
    """配置服务客户端"""
    
    def __init__(self, base_url: Optional[str] = None, timeout: float = 30.0):
        """
        初始化配置客户端
        
        Args:
            base_url: sync-service API地址，默认从环境变量获取
            timeout: 请求超时时间
        """
        self.base_url = base_url or os.getenv(
            'SYNC_API_URL', 
            'http://localhost:8089/api/v1'
        )
        self.timeout = timeout
        self._client = httpx.AsyncClient(timeout=timeout)
    
    async def close(self):
        """关闭客户端"""
        await self._client.aclose()
    
    # ========== 通用配置接口 ==========
    
    async def get_setting(self, category: str, key: str) -> Optional[Dict[str, Any]]:
        """获取单个配置"""
        try:
            response = await self._client.get(
                f"{self.base_url}/config/settings/{category}/{key}"
            )
            if response.status_code == 200:
                return response.json()
            return None
        except Exception:
            return None
    
    async def get_settings(self, category: Optional[str] = None) -> List[Dict[str, Any]]:
        """获取配置列表"""
        try:
            params = {"category": category} if category else {}
            response = await self._client.get(
                f"{self.base_url}/config/settings",
                params=params
            )
            if response.status_code == 200:
                return response.json()
            return []
        except Exception:
            return []
    
    async def set_setting(
        self, 
        category: str, 
        key: str, 
        value: Any,
        description: str = ""
    ) -> bool:
        """设置配置"""
        try:
            response = await self._client.post(
                f"{self.base_url}/config/settings",
                json={
                    "category": category,
                    "key": key,
                    "value": value,
                    "description": description
                }
            )
            return response.status_code in (200, 201)
        except Exception:
            return False
    
    async def update_setting(
        self, 
        category: str, 
        key: str, 
        value: Any
    ) -> bool:
        """更新配置"""
        try:
            response = await self._client.put(
                f"{self.base_url}/config/settings/{category}/{key}",
                json={"value": value}
            )
            return response.status_code == 200
        except Exception:
            return False
    
    async def batch_update(self, settings: Dict[str, Dict[str, Any]]) -> Dict[str, int]:
        """批量更新配置"""
        try:
            response = await self._client.post(
                f"{self.base_url}/config/settings/batch",
                json={"settings": settings}
            )
            if response.status_code == 200:
                return response.json()
            return {"updated": 0, "created": 0}
        except Exception:
            return {"updated": 0, "created": 0}
    
    # ========== 信号规则接口 ==========
    
    async def get_signal_rules(
        self, 
        category: Optional[str] = None,
        is_enabled: Optional[bool] = None
    ) -> List[Dict[str, Any]]:
        """获取信号规则列表"""
        try:
            params = {}
            if category:
                params["category"] = category
            if is_enabled is not None:
                params["is_enabled"] = str(is_enabled).lower()
            
            response = await self._client.get(
                f"{self.base_url}/config/signal-rules",
                params=params
            )
            if response.status_code == 200:
                return response.json()
            return []
        except Exception:
            return []
    
    async def get_signal_rule(self, rule_id: str) -> Optional[Dict[str, Any]]:
        """获取单个信号规则"""
        try:
            response = await self._client.get(
                f"{self.base_url}/config/signal-rules/{rule_id}"
            )
            if response.status_code == 200:
                return response.json()
            return None
        except Exception:
            return None
    
    async def create_signal_rule(self, rule: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """创建信号规则"""
        try:
            response = await self._client.post(
                f"{self.base_url}/config/signal-rules",
                json=rule
            )
            if response.status_code in (200, 201):
                return response.json()
            return None
        except Exception:
            return None
    
    async def update_signal_rule(
        self, 
        rule_id: str, 
        updates: Dict[str, Any]
    ) -> bool:
        """更新信号规则"""
        try:
            response = await self._client.put(
                f"{self.base_url}/config/signal-rules/{rule_id}",
                json=updates
            )
            return response.status_code == 200
        except Exception:
            return False
    
    async def toggle_signal_rule(self, rule_id: str) -> Optional[bool]:
        """切换信号规则启用状态"""
        try:
            response = await self._client.post(
                f"{self.base_url}/config/signal-rules/{rule_id}/toggle"
            )
            if response.status_code == 200:
                data = response.json()
                return data.get("is_enabled")
            return None
        except Exception:
            return None
    
    async def get_signal_rule_categories(self) -> List[Dict[str, Any]]:
        """获取信号规则分类统计"""
        try:
            response = await self._client.get(
                f"{self.base_url}/config/signal-rules/categories"
            )
            if response.status_code == 200:
                return response.json()
            return []
        except Exception:
            return []
    
    # ========== 监控配置接口 ==========
    
    async def get_monitoring_configs(
        self, 
        user_id: str,
        type: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """获取用户监控配置"""
        try:
            params = {"type": type} if type else {}
            response = await self._client.get(
                f"{self.base_url}/config/monitoring/{user_id}",
                params=params
            )
            if response.status_code == 200:
                return response.json()
            return []
        except Exception:
            return []
    
    async def create_monitoring_config(
        self, 
        config: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """创建监控配置"""
        try:
            response = await self._client.post(
                f"{self.base_url}/config/monitoring",
                json=config
            )
            if response.status_code in (200, 201):
                return response.json()
            return None
        except Exception:
            return None
    
    async def update_monitoring_config(
        self, 
        config_id: int, 
        updates: Dict[str, Any]
    ) -> bool:
        """更新监控配置"""
        try:
            response = await self._client.put(
                f"{self.base_url}/config/monitoring/{config_id}",
                json=updates
            )
            return response.status_code == 200
        except Exception:
            return False
    
    # ========== 同步接口 ==========
    
    async def sync_config(self, user_id: str, settings: Dict[str, Any]) -> bool:
        """同步配置"""
        try:
            response = await self._client.post(
                f"{self.base_url}/config/sync/{user_id}",
                json=settings
            )
            return response.status_code == 200
        except Exception:
            return False
    
    async def get_sync_status(self, user_id: str) -> Optional[Dict[str, Any]]:
        """获取同步状态"""
        try:
            response = await self._client.get(
                f"{self.base_url}/config/sync/{user_id}"
            )
            if response.status_code == 200:
                return response.json()
            return None
        except Exception:
            return None


# 便捷函数

@lru_cache()
def get_config_client() -> ConfigClient:
    """获取配置客户端单例"""
    return ConfigClient()


async def get_setting(category: str, key: str) -> Optional[Any]:
    """快速获取配置值"""
    client = get_config_client()
    setting = await client.get_setting(category, key)
    return setting.get("value") if setting else None


async def set_setting(category: str, key: str, value: Any) -> bool:
    """快速设置配置值"""
    client = get_config_client()
    return await client.set_setting(category, key, value)


# 同步版本（用于非异步环境）
class SyncConfigClient:
    """同步配置客户端"""
    
    def __init__(self, base_url: Optional[str] = None, timeout: float = 30.0):
        self.base_url = base_url or os.getenv(
            'SYNC_API_URL', 
            'http://localhost:8089/api/v1'
        )
        self.timeout = timeout
        self._client = httpx.Client(timeout=timeout)
    
    def get_setting(self, category: str, key: str) -> Optional[Dict[str, Any]]:
        """获取单个配置"""
        try:
            response = self._client.get(
                f"{self.base_url}/config/settings/{category}/{key}"
            )
            if response.status_code == 200:
                return response.json()
            return None
        except Exception:
            return None
    
    def get_signal_rules(
        self, 
        category: Optional[str] = None,
        is_enabled: bool = True
    ) -> List[Dict[str, Any]]:
        """获取信号规则列表"""
        try:
            params = {"is_enabled": str(is_enabled).lower()}
            if category:
                params["category"] = category
            
            response = self._client.get(
                f"{self.base_url}/config/signal-rules",
                params=params
            )
            if response.status_code == 200:
                return response.json()
            return []
        except Exception:
            return []
    
    def toggle_signal_rule(self, rule_id: str) -> Optional[bool]:
        """切换信号规则"""
        try:
            response = self._client.post(
                f"{self.base_url}/config/signal-rules/{rule_id}/toggle"
            )
            if response.status_code == 200:
                data = response.json()
                return data.get("is_enabled")
            return None
        except Exception:
            return None
