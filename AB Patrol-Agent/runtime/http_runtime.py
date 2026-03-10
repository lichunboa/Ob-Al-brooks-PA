"""运行时 HTTP 与 Telegram 适配。"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from http_client import HttpClient
from telegram_pusher import TelegramPusher


class HttpRuntimeMixin:
    """把执行服务和 Telegram 访问收敛到独立适配层。"""

    def _execution_http_client(self) -> HttpClient:
        return HttpClient(self.config.execution_base)

    def _telegram_pusher(self) -> TelegramPusher:
        return TelegramPusher(
            forward_url=self.config.telegram_forward_url,
            chat_id=self.config.telegram_chat_id,
            thread_id=self.config.telegram_thread_id,
            vault_root=self.config.vault_root,
        )

    def http_get_json(self, path: str, query: dict[str, Any] | None = None) -> Any:
        return self._execution_http_client().get_json(path, query=query)

    def http_post_json(
        self,
        url: str,
        payload: dict[str, Any] | None = None,
        query: dict[str, Any] | None = None,
    ) -> Any:
        return self._execution_http_client().post_json(url, payload=payload, query=query)

    def http_delete_json(self, path: str, query: dict[str, Any] | None = None) -> Any:
        return self._execution_http_client().delete_json(path, query=query)

    def http_post_telegram(self, payload: dict[str, Any]) -> Any:
        return self._telegram_pusher().post_telegram(payload)

    def backend_bot_token(self) -> str:
        return self._telegram_pusher().get_bot_token()

    def telegram_api_send_photo(self, photo_path: Path, caption: str) -> dict[str, Any]:
        return self._telegram_pusher().send_photo_api(photo_path, caption)

    def openclaw_message_send(self, message: str) -> dict[str, Any]:
        return self._telegram_pusher().send_message_openclaw(message)

    def openclaw_photo_send(self, photo_path: Path, caption: str) -> dict[str, Any]:
        return self._telegram_pusher().send_photo_openclaw(photo_path, caption)
