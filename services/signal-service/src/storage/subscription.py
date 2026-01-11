"""
订阅管理（纯逻辑，不依赖 Telegram）
"""
import os
import json
import sqlite3
import logging
import threading
from typing import Dict, List, Set, Optional

from ..config import get_subscription_db_path
from ..rules import RULES_BY_TABLE

logger = logging.getLogger(__name__)

# 所有表
ALL_TABLES = list(RULES_BY_TABLE.keys())


class SubscriptionManager:
    """订阅管理器（解耦版）"""
    
    def __init__(self, db_path: str = None):
        self.db_path = db_path or str(get_subscription_db_path())
        self._cache: Dict[int, Dict] = {}
        self._lock = threading.Lock()
        self._init_db()
    
    def _init_db(self):
        """初始化数据库"""
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        conn = sqlite3.connect(self.db_path)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS signal_subs (
                user_id INTEGER PRIMARY KEY,
                enabled INTEGER DEFAULT 1,
                tables TEXT
            )
        """)
        conn.commit()
        conn.close()
    
    def _load(self, user_id: int) -> Optional[Dict]:
        """从数据库加载订阅"""
        try:
            conn = sqlite3.connect(self.db_path)
            row = conn.execute(
                "SELECT enabled, tables FROM signal_subs WHERE user_id = ?",
                (user_id,)
            ).fetchone()
            conn.close()
            if row:
                tables = set(json.loads(row[1])) if row[1] else set(ALL_TABLES)
                return {"enabled": bool(row[0]), "tables": tables}
        except Exception as e:
            logger.warning(f"加载订阅失败 uid={user_id}: {e}")
        return None
    
    def _save(self, user_id: int, sub: Dict):
        """保存订阅到数据库"""
        try:
            conn = sqlite3.connect(self.db_path)
            conn.execute(
                "INSERT OR REPLACE INTO signal_subs (user_id, enabled, tables) VALUES (?, ?, ?)",
                (user_id, int(sub["enabled"]), json.dumps(list(sub["tables"])))
            )
            conn.commit()
            conn.close()
        except Exception as e:
            logger.warning(f"保存订阅失败 uid={user_id}: {e}")
    
    def get(self, user_id: int) -> Dict:
        """获取用户订阅配置"""
        with self._lock:
            if user_id not in self._cache:
                loaded = self._load(user_id)
                if loaded:
                    self._cache[user_id] = loaded
                else:
                    # 默认开启推送，开启全部信号
                    self._cache[user_id] = {"enabled": True, "tables": set(ALL_TABLES)}
                    self._save(user_id, self._cache[user_id])
            return self._cache[user_id]
    
    def set_enabled(self, user_id: int, enabled: bool):
        """设置推送开关"""
        sub = self.get(user_id)
        sub["enabled"] = enabled
        self._save(user_id, sub)
    
    def toggle_table(self, user_id: int, table: str) -> bool:
        """切换表开关，返回新状态"""
        if table not in ALL_TABLES:
            return False
        sub = self.get(user_id)
        if table in sub["tables"]:
            sub["tables"].discard(table)
            result = False
        else:
            sub["tables"].add(table)
            result = True
        self._save(user_id, sub)
        return result
    
    def enable_all(self, user_id: int):
        """开启全部"""
        sub = self.get(user_id)
        sub["tables"] = set(ALL_TABLES)
        self._save(user_id, sub)
    
    def disable_all(self, user_id: int):
        """关闭全部"""
        sub = self.get(user_id)
        sub["tables"] = set()
        self._save(user_id, sub)
    
    def is_table_enabled(self, user_id: int, table: str) -> bool:
        """判断表是否启用"""
        sub = self.get(user_id)
        return sub["enabled"] and table in sub["tables"]
    
    def get_enabled_subscribers(self) -> List[int]:
        """获取所有启用推送的用户ID"""
        try:
            conn = sqlite3.connect(self.db_path)
            rows = conn.execute(
                "SELECT user_id FROM signal_subs WHERE enabled = 1"
            ).fetchall()
            conn.close()
            return [r[0] for r in rows]
        except Exception as e:
            logger.warning(f"获取订阅用户失败: {e}")
            return []
    
    def get_subscribers_for_table(self, table: str) -> List[int]:
        """获取订阅了指定表的用户列表"""
        result = []
        for uid in self.get_enabled_subscribers():
            if self.is_table_enabled(uid, table):
                result.append(uid)
        return result


# 单例
_manager: Optional[SubscriptionManager] = None
_manager_lock = threading.Lock()


def get_subscription_manager() -> SubscriptionManager:
    """获取订阅管理器单例"""
    global _manager
    if _manager is None:
        with _manager_lock:
            if _manager is None:
                _manager = SubscriptionManager()
    return _manager
