"""
Telegram 推送模块

提供 Telegram 消息和图片推送功能
"""

import json
import uuid
import subprocess
import urllib.request
import urllib.error
from pathlib import Path
from typing import Any


def load_json(path: Path, default: Any = None) -> Any:
    """加载 JSON 文件"""
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


class TelegramPusher:
    """Telegram 推送器"""

    def __init__(
        self,
        forward_url: str,
        chat_id: str,
        thread_id: int,
        vault_root: Path,
    ):
        """
        初始化 Telegram 推送器

        Args:
            forward_url: Telegram 转发 URL
            chat_id: Telegram 聊天 ID
            thread_id: Telegram 线程 ID
            vault_root: Vault 根目录
        """
        self.forward_url = forward_url
        self.chat_id = chat_id
        self.thread_id = thread_id
        self.vault_root = vault_root

    def post_telegram(self, payload: dict[str, Any]) -> Any:
        """
        通过转发 URL 推送消息到 Telegram

        Args:
            payload: 消息负载

        Returns:
            响应字典或错误字典
        """
        if not self.forward_url:
            return {"_error": "telegram forward disabled"}
        body = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            self.forward_url,
            data=body,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            return {"_error": f"http {exc.code}: {detail}"}
        except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as exc:
            return {"_error": str(exc)}

    def get_bot_token(self) -> str:
        """
        获取 Telegram Bot Token

        从以下位置查找：
        1. ~/.openclaw/openclaw.json
        2. AB Patrol-Agent/config/.env

        Returns:
            Bot Token 或空字符串
        """
        openclaw_config = Path.home() / ".openclaw" / "openclaw.json"
        if openclaw_config.exists():
            payload = load_json(openclaw_config, {})
            telegram_cfg = payload.get("channels", {}).get("telegram", {}) if isinstance(payload, dict) else {}
            token = str(telegram_cfg.get("botToken") or "").strip()
            if token:
                return token
        env_candidates = [
            self.vault_root / "AB Patrol-Agent" / "config" / ".env",
        ]
        for env_path in env_candidates:
            if not env_path.exists():
                continue
            try:
                for raw in env_path.read_text(encoding="utf-8").splitlines():
                    line = raw.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, value = line.split("=", 1)
                    if key.strip() == "BOT_TOKEN":
                        token = value.strip().strip("\"' ")
                        if token:
                            return token
            except OSError:
                continue
        return ""

    def send_photo_api(self, photo_path: Path, caption: str) -> dict[str, Any]:
        """
        通过 Telegram API 发送图片

        Args:
            photo_path: 图片路径
            caption: 图片说明

        Returns:
            响应字典或错误字典
        """
        token = self.get_bot_token()
        if not token:
            return {"_error": "telegram bot token unavailable"}
        boundary = f"----ABPatrol{uuid.uuid4().hex}"
        parts: list[bytes] = []

        def add_field(name: str, value: str) -> None:
            parts.append(f"--{boundary}\r\n".encode("utf-8"))
            parts.append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"))
            parts.append(value.encode("utf-8"))
            parts.append(b"\r\n")

        add_field("chat_id", self.chat_id)
        add_field("parse_mode", "HTML")
        add_field("disable_notification", "true")
        if self.thread_id:
            add_field("message_thread_id", str(self.thread_id))
        if caption:
            add_field("caption", caption[:1024])

        image_bytes = photo_path.read_bytes()
        parts.append(f"--{boundary}\r\n".encode("utf-8"))
        parts.append(
            (
                f'Content-Disposition: form-data; name="photo"; filename="{photo_path.name}"\r\n'
                "Content-Type: image/png\r\n\r\n"
            ).encode("utf-8")
        )
        parts.append(image_bytes)
        parts.append(b"\r\n")
        parts.append(f"--{boundary}--\r\n".encode("utf-8"))
        body = b"".join(parts)
        request = urllib.request.Request(
            f"https://api.telegram.org/bot{token}/sendPhoto",
            data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        )
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            return {"_error": f"http {exc.code}: {detail}"}
        except (urllib.error.URLError, json.JSONDecodeError, TimeoutError, OSError) as exc:
            return {"_error": str(exc)}

    def send_message_openclaw(self, message: str) -> dict[str, Any]:
        """
        通过 OpenClaw CLI 发送消息

        Args:
            message: 消息内容

        Returns:
            响应字典或错误字典
        """
        cmd = [
            "openclaw",
            "message",
            "send",
            "--channel",
            "telegram",
            "--target",
            self.chat_id,
            "--thread-id",
            str(self.thread_id),
            "--message",
            message,
            "--silent",
            "--json",
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode != 0:
            stderr = (result.stderr or "").strip()
            return {"_error": stderr or f"openclaw message send rc={result.returncode}"}
        stdout = (result.stdout or "").strip()
        try:
            return json.loads(stdout or "{}")
        except json.JSONDecodeError as exc:
            start = stdout.find("{")
            end = stdout.rfind("}")
            if start != -1 and end != -1 and end > start:
                try:
                    return json.loads(stdout[start : end + 1])
                except json.JSONDecodeError:
                    return {"_error": f"invalid openclaw send json: {exc}"}
            return {"_error": f"invalid openclaw send json: {exc}"}

    def send_photo_openclaw(self, photo_path: Path, caption: str) -> dict[str, Any]:
        """
        通过 OpenClaw CLI 发送图片

        Args:
            photo_path: 图片路径
            caption: 图片说明

        Returns:
            响应字典或错误字典
        """
        cmd = [
            "openclaw",
            "message",
            "send",
            "--channel",
            "telegram",
            "--target",
            self.chat_id,
            "--thread-id",
            str(self.thread_id),
            "--media",
            str(photo_path),
            "--message",
            caption[:1024],
            "--silent",
            "--json",
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
        if result.returncode != 0:
            stderr = (result.stderr or "").strip()
            return {"_error": stderr or f"openclaw photo send rc={result.returncode}"}
        stdout = (result.stdout or "").strip()
        try:
            return json.loads(stdout or "{}")
        except json.JSONDecodeError as exc:
            start = stdout.find("{")
            end = stdout.rfind("}")
            if start != -1 and end != -1 and end > start:
                try:
                    return json.loads(stdout[start : end + 1])
                except json.JSONDecodeError:
                    return {"_error": f"invalid openclaw photo json: {exc}"}
            return {"_error": f"invalid openclaw photo json: {exc}"}
