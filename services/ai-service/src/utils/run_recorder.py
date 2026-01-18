# -*- coding: utf-8 -*-
"""
RunRecorder
- 为每次 AI 分析落盘一套完整的数据快照，便于排查与复现。
- 目录结构：data/ai/{symbol}_{timestamp}/
  - raw_payload.json : AICoinQueryManager 返回的完整字典
  - prompt.txt       : 本次使用的提示词内容（可选）
  - analysis.txt     : LLM 输出文本（可选）
  - meta.json        : 请求参数、时间戳等元信息
"""
from __future__ import annotations

import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, List

from .data_docs import DATA_DOCS


class RunRecorder:
    def __init__(self, base_dir: Optional[str] = None) -> None:
        default_dir = Path(__file__).resolve().parents[2] / "data" / "ai"
        self.base_dir = Path(base_dir) if base_dir else default_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self.record_enabled = _env_flag("AI_RECORD_ENABLED", True)
        self.record_payload = _env_flag("AI_RECORD_PAYLOAD", True)
        self.record_prompt = _env_flag("AI_RECORD_PROMPT", True)
        self.record_messages = _env_flag("AI_RECORD_MESSAGES", True)
        self.record_analysis = _env_flag("AI_RECORD_ANALYSIS", True)
        self.max_dirs = _env_int("AI_RECORD_MAX_DIRS", 0)

    def save_run(
        self,
        symbol: str,
        interval: str,
        prompt_name: str,
        payload: Dict[str, Any],
        prompt_text: Optional[str] = None,
        analysis_text: Optional[str] = None,
        request_messages: Optional[List[Dict[str, Any]]] = None,
        status: Optional[str] = None,
        error: Optional[str] = None,
    ) -> str:
        if not self.record_enabled:
            return ""
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        folder = self.base_dir / f"{symbol}_{timestamp}"
        folder.mkdir(parents=True, exist_ok=True)

        variable_map = self._build_variable_map(payload)

        # 元信息
        meta = {
            "symbol": symbol,
            "interval": interval,
            "prompt_name": prompt_name,
            "timestamp_utc": timestamp,
            "variable_map": variable_map,
            "docs": self._attach_docs(payload),
            "status": status,
            "error": error,
        }
        (folder / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

        # 原始数据
        if self.record_payload:
            (folder / "raw_payload.json").write_text(
                json.dumps(payload, ensure_ascii=False, indent=2, default=str), encoding="utf-8"
            )

        # 提示词文本
        if prompt_text and self.record_prompt:
            safe_prompt = (prompt_name or "prompt").replace("/", "_").replace("\\", "_")
            prompt_filename = f"{safe_prompt}.txt"
            (folder / prompt_filename).write_text(prompt_text, encoding="utf-8")

        # 本次发送给 LLM 的完整消息（system/user 等）
        if request_messages and self.record_messages:
            (folder / "request_messages.json").write_text(
                json.dumps(request_messages, ensure_ascii=False, indent=2, default=str), encoding="utf-8"
            )

        # AI 输出
        if analysis_text and self.record_analysis:
            (folder / "analysis.txt").write_text(analysis_text, encoding="utf-8")

        if self.max_dirs > 0:
            self._prune_old_runs()

        return str(folder)

    # ==================== 内部工具 ====================
    def _build_variable_map(self, payload: Dict[str, Any]) -> list:
        """根据 payload 自动生成变量对照表，便于排查。

        输出示例:
        [
          {"name": "candles_latest_50", "type": "dict[str->list]", "summary": "7 intervals, each ~50 rows"},
          {"name": "metrics_5m_latest_50", "type": "list", "summary": "50 rows of 5m metrics"},
          ...
        ]
        """
        table: list = []

        for key, value in payload.items():
            entry = {"name": key, "type": type(value).__name__, "summary": ""}

            try:
                if isinstance(value, dict):
                    if key == "candles":
                        intervals = list(value.keys())
                        lens = {k: len(v) if isinstance(v, list) else 0 for k, v in value.items()}
                        entry["type"] = "dict[str->list]"
                        entry["summary"] = f"{len(intervals)} intervals; rows per interval: {lens}"
                    elif key == "indicators":
                        entry["type"] = "dict[str->list|error]"
                        counts = {k: (len(v) if isinstance(v, list) else v) for k, v in value.items()}
                        entry["summary"] = f"{len(value)} tables; rows: {counts}"
                    elif key == "snapshot":
                        entry["summary"] = f"sections: {list(value.keys())}"
                    else:
                        entry["summary"] = f"dict keys: {list(value.keys())[:5]}{'...' if len(value)>5 else ''}"

                elif isinstance(value, list):
                    entry["summary"] = f"list len={len(value)}"
                else:
                    entry["summary"] = str(value)[:200]
            except Exception as exc:
                entry["summary"] = f"summary_error: {exc}"

            table.append(entry)

        return table

    def _attach_docs(self, payload: Dict[str, Any]) -> Dict[str, Dict[str, str]]:
        """为已有数据块附加 what/why/how 说明，未定义则给默认提示。"""
        docs: Dict[str, Dict[str, str]] = {}
        for key in payload.keys():
            doc = DATA_DOCS.get(key)
            if doc:
                docs[key] = doc
            else:
                docs[key] = {
                    "what": "未定义",
                    "why": "未定义",
                    "how": "未定义",
                }
        return docs

    def _prune_old_runs(self) -> None:
        """按时间清理旧记录，保留最近 N 份。"""
        try:
            dirs = [p for p in self.base_dir.iterdir() if p.is_dir()]
            if len(dirs) <= self.max_dirs:
                return
            dirs.sort(key=lambda p: p.stat().st_mtime, reverse=True)
            for old in dirs[self.max_dirs:]:
                shutil.rmtree(old, ignore_errors=True)
        except Exception:
            return


# 便捷实例（可在全局复用）
def get_default_recorder() -> RunRecorder:
    return RunRecorder()


def _env_flag(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default
