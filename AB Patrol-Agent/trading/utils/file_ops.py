"""文件操作工具函数"""
import json
import uuid
from pathlib import Path
from typing import Any


def ensure_dir(path: Path) -> None:
    """确保目录存在"""
    path.mkdir(parents=True, exist_ok=True)


def load_json(path: Path, default: Any) -> Any:
    """加载 JSON 文件，失败时返回默认值"""
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def write_text(path: Path, text: str) -> None:
    """原子写入文本文件"""
    ensure_dir(path.parent)
    tmp = path.with_suffix(path.suffix + f".{uuid.uuid4().hex}.tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


def write_json(path: Path, payload: Any) -> None:
    """写入 JSON 文件"""
    write_text(path, json.dumps(payload, ensure_ascii=False, indent=2))


def append_jsonl(path: Path, payload: dict[str, Any]) -> None:
    """追加 JSONL 行"""
    ensure_dir(path.parent)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")
