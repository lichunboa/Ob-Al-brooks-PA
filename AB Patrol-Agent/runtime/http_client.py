"""
HTTP 客户端模块

提供 HTTP GET/POST/DELETE 请求功能
"""

import json
import urllib.request
import urllib.parse
import urllib.error
from typing import Any


class HttpClient:
    """HTTP 客户端"""

    def __init__(self, base_url: str):
        """
        初始化 HTTP 客户端

        Args:
            base_url: 基础 URL
        """
        self.base_url = base_url

    def get_json(self, path: str, query: dict[str, Any] | None = None) -> Any:
        """
        发送 GET 请求并返回 JSON

        Args:
            path: 请求路径
            query: 查询参数

        Returns:
            JSON 响应或错误字典
        """
        url = self.base_url + path
        if query:
            encoded = urllib.parse.urlencode({k: v for k, v in query.items() if v not in (None, "")})
            url = f"{url}?{encoded}"
        try:
            with urllib.request.urlopen(url, timeout=12) as response:
                return json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, TimeoutError) as exc:
            return {"_error": str(exc), "_url": url}

    def post_json(
        self,
        url: str,
        payload: dict[str, Any] | None = None,
        query: dict[str, Any] | None = None,
    ) -> Any:
        """
        发送 POST 请求并返回 JSON

        Args:
            url: 请求 URL（可以是完整 URL 或路径）
            payload: 请求体
            query: 查询参数

        Returns:
            JSON 响应或错误字典
        """
        final_url = url
        if final_url.startswith("/"):
            final_url = self.base_url + final_url
        if query:
            encoded = urllib.parse.urlencode({k: v for k, v in query.items() if v not in (None, "")})
            if encoded:
                final_url = f"{final_url}?{encoded}"
        body = json.dumps(payload or {}).encode("utf-8")
        request = urllib.request.Request(final_url, data=body, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            return {"_error": f"http {exc.code}: {detail}", "_url": final_url}
        except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as exc:
            return {"_error": str(exc), "_url": final_url}

    def delete_json(self, path: str, query: dict[str, Any] | None = None) -> Any:
        """
        发送 DELETE 请求并返回 JSON

        Args:
            path: 请求路径
            query: 查询参数

        Returns:
            JSON 响应或错误字典
        """
        final_url = path
        if final_url.startswith("/"):
            final_url = self.base_url + final_url
        if query:
            encoded = urllib.parse.urlencode({k: v for k, v in query.items() if v not in (None, "")})
            if encoded:
                final_url = f"{final_url}?{encoded}"
        request = urllib.request.Request(final_url, method="DELETE")
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            return {"_error": f"http {exc.code}: {detail}", "_url": final_url}
        except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as exc:
            return {"_error": str(exc), "_url": final_url}
