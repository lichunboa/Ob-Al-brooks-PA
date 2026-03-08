#!/usr/bin/env python3
"""Decision provider adapters for AB Patrol-Agent."""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import subprocess
import time
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def write_text(path: Path, text: str) -> None:
    ensure_dir(path.parent)
    tmp = path.with_suffix(path.suffix + f".{uuid.uuid4().hex}.tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


def write_json(path: Path, payload: Any) -> None:
    write_text(path, json.dumps(payload, ensure_ascii=False, indent=2))


@dataclass
class DecisionProviderConfig:
    provider: str
    openclaw_agent: str
    api_base: str = ""
    api_key: str = ""
    model: str = ""
    timeout_seconds: int = 180
    agent_root: str = ""
    knowledge_root: str = ""
    session_state_path: str = ""


@dataclass
class DecisionProviderResult:
    provider: str
    payload: dict[str, Any]
    response_text: str
    session_id: str = ""
    model: str = ""


class OpenClawDecisionProvider:
    def __init__(self, config: DecisionProviderConfig):
        self.config = config

    def invoke(
        self,
        system_text: str,
        user_text: str,
        logs_dir: Path,
        *,
        request_name: str = "last_request.md",
        response_name: str = "last_response.json",
    ) -> DecisionProviderResult:
        request_markdown = "\n\n".join(
            [
                "AB Patrol-Agent decision turn.",
                "",
                "Use only the supplied patrol instructions and runtime context below.",
                "",
                "Return raw JSON only.",
                "",
                "# Patrol System Prompt",
                system_text,
                "",
                "# Patrol User Prompt",
                user_text,
            ]
        )
        write_text(logs_dir / request_name, request_markdown)

        session_id = f"patrol-loop-{uuid.uuid4().hex[:12]}"
        stderr = ""
        result = None
        gateway_timeout_ms = min(max(self.config.timeout_seconds * 1000, 30000), 180000)
        process_timeout_s = min(max(self.config.timeout_seconds + 30, 90), 240)
        for gateway_timeout_ms, process_timeout_s in ((gateway_timeout_ms, process_timeout_s),):
            params = {
                "agentId": self.config.openclaw_agent,
                "message": f"{system_text}\n\n{user_text}",
                "idempotencyKey": uuid.uuid4().hex,
                "sessionId": session_id,
            }
            cmd = [
                "openclaw",
                "gateway",
                "call",
                "agent",
                "--params",
                json.dumps(params, ensure_ascii=False),
                "--expect-final",
                "--timeout",
                str(gateway_timeout_ms),
                "--json",
            ]
            try:
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=process_timeout_s)
            except subprocess.TimeoutExpired:
                stderr = f"process timeout after {process_timeout_s}s (gateway timeout={gateway_timeout_ms}ms)"
                result = None
                continue
            if result.returncode == 0:
                break
            stderr = (result.stderr or "").strip()
            if "timeout" not in stderr.lower():
                break
        if result is None or result.returncode != 0:
            raise RuntimeError(stderr or f"openclaw rc={result.returncode if result else 'unknown'}")
        try:
            payload = json.loads((result.stdout or "").strip() or "{}")
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"openclaw returned non-json payload: {exc}") from exc
        write_json(logs_dir / response_name, payload)
        result_block = payload.get("result") if isinstance(payload, dict) else None
        response_texts = [
            item.get("text", "")
            for item in (result_block or {}).get("payloads", [])
            if isinstance(item, dict) and item.get("text")
        ]
        response_text = "\n".join(response_texts).strip()
        session_id = (
            (payload.get("meta") or {}).get("agentMeta", {}).get("sessionId")
            or session_id
        )
        return DecisionProviderResult(
            provider="openclaw",
            payload=payload,
            response_text=response_text,
            session_id=session_id,
            model="openai-codex/gpt-5.4",
        )


class CodexCLIDecisionProvider:
    def __init__(self, config: DecisionProviderConfig):
        self.config = config

    def _agent_root(self, logs_dir: Path) -> Path:
        if self.config.agent_root:
            return Path(self.config.agent_root)
        return logs_dir.parents[3]

    def _knowledge_root(self, logs_dir: Path) -> Path:
        if self.config.knowledge_root:
            return Path(self.config.knowledge_root)
        return self._agent_root(logs_dir) / "knowledge" / "patrol-l1"

    def _session_state_path(self, logs_dir: Path) -> Path:
        if self.config.session_state_path:
            return Path(self.config.session_state_path)
        return self._agent_root(logs_dir) / "data" / "pa_trader" / "state" / "decision_session.json"

    def _load_session_state(self, logs_dir: Path) -> dict[str, Any]:
        path = self._session_state_path(logs_dir)
        if not path.exists():
            return {}
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}

    def _save_session_state(self, logs_dir: Path, payload: dict[str, Any]) -> None:
        write_json(self._session_state_path(logs_dir), payload)

    def _knowledge_hash(self, logs_dir: Path) -> str:
        root = self._knowledge_root(logs_dir)
        parts: list[bytes] = []
        files = [root / "SKILL.md", *sorted((root / "references").glob("*.md"))]
        for path in files:
            if not path.exists():
                continue
            parts.append(path.name.encode("utf-8"))
            parts.append(path.read_bytes())
        return hashlib.sha256(b"\n".join(parts)).hexdigest()

    def _run_codex(
        self,
        cmd: list[str],
        prompt: str,
        *,
        timeout_seconds: int,
    ) -> tuple[str, str]:
        result = subprocess.run(
            cmd,
            input=prompt,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
        )
        if result.returncode != 0:
            stderr = (result.stderr or result.stdout or "").strip()
            raise RuntimeError(stderr or f"codex cli rc={result.returncode}")
        return result.stdout or "", result.stderr or ""

    @staticmethod
    def _extract_thread_id(stdout: str) -> str:
        for line in stdout.splitlines():
            line = line.strip()
            if not line.startswith("{"):
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if event.get("type") == "thread.started":
                return str(event.get("thread_id") or "")
        return ""

    @staticmethod
    def _active_ref_names(system_text: str) -> list[str]:
        names: list[str] = []
        selected_refs = False
        for line in system_text.splitlines():
            stripped = line.strip()
            if stripped == "# Selected References":
                selected_refs = True
                continue
            if selected_refs and stripped.startswith("## "):
                name = stripped[3:].strip()
                if name:
                    names.append(name)
        return names

    @staticmethod
    def _strip_loaded_knowledge(system_text: str) -> str:
        marker = "\n# patrol-l1 Skill\n"
        if marker in system_text:
            return system_text.split(marker, 1)[0].strip()
        return system_text.strip()

    def _knowledge_chunks(self, logs_dir: Path) -> list[tuple[str, list[Path]]]:
        root = self._knowledge_root(logs_dir)
        refs = root / "references"
        return [
            ("skill-core", [root / "SKILL.md"]),
            (
                "market-structure",
                [
                    refs / "S0-daily-bias.md",
                    refs / "S1-reading.md",
                    refs / "S2-direction.md",
                    refs / "S3-market-state.md",
                    refs / "S3b-key-levels.md",
                ],
            ),
            (
                "entry-execution",
                [
                    refs / "S4-strategy-match.md",
                    refs / "S5-evaluation.md",
                    refs / "S6-common.md",
                    refs / "S6-bo.md",
                    refs / "S6-channel.md",
                    refs / "S6-reversal.md",
                    refs / "S6-tr.md",
                ],
            ),
            ("management", [refs / "S7-management.md"]),
        ]

    def _bootstrap_chunk_prompt(self, chunk_name: str, files: list[Path]) -> str:
        existing_files = [path for path in files if path.exists()]
        chunk_parts = [
            f"AB Patrol-Agent Codex CLI 长会话初始化分块: {chunk_name}",
            "",
            "请把以下原始 patrol-l1 知识文件加载进当前长会话，并在后续所有巡逻轮次中继续把它们当作最高权威。",
            "不要总结、不要改写规则、不要删减含义。",
            "后续轮次会只发送市场运行上下文和当前激活的文件名，你需要基于已经加载的完整知识继续推理。",
            "本轮不要分析市场，不要给出交易建议，只需确认已加载。",
            "最终只返回一行 JSON，例如 {\"ok\":true,\"chunk\":\"...\",\"loaded\":[...]}。",
            "",
        ]
        for path in existing_files:
            chunk_parts.extend([f"# FILE: {path.name}", path.read_text(encoding='utf-8'), ""])
        return "\n".join(chunk_parts).strip()

    def _bootstrap_session(self, logs_dir: Path, model: str) -> dict[str, Any]:
        codex_bin = shutil.which("codex")
        if not codex_bin:
            raise RuntimeError("codex CLI not found in PATH")
        output_path = logs_dir / "_codex_bootstrap_last.txt"
        thread_id = ""
        for index, (chunk_name, files) in enumerate(self._knowledge_chunks(logs_dir), start=1):
            prompt = self._bootstrap_chunk_prompt(chunk_name, files)
            request_path = logs_dir / f"_codex_bootstrap_{index:02d}_{chunk_name}_request.md"
            response_path = logs_dir / f"_codex_bootstrap_{index:02d}_{chunk_name}_stdout.jsonl"
            write_text(request_path, prompt)
            cmd = [
                codex_bin,
                "exec",
                "--skip-git-repo-check",
                "--dangerously-bypass-approvals-and-sandbox",
                "--json",
                "-o",
                str(output_path),
                "-m",
                model,
            ]
            if thread_id:
                cmd.extend(["resume", thread_id, "-"])
            else:
                cmd.extend(["-C", str(self._agent_root(logs_dir)), "-"])
            stdout, _ = self._run_codex(cmd, prompt, timeout_seconds=max(self.config.timeout_seconds + 180, 420))
            write_text(response_path, stdout)
            next_thread_id = self._extract_thread_id(stdout)
            if next_thread_id:
                thread_id = next_thread_id
            if not thread_id:
                raise RuntimeError(f"codex bootstrap failed to create thread for chunk {chunk_name}")
        state = {
            "provider": "codex_cli",
            "thread_id": thread_id,
            "model": model,
            "knowledge_hash": self._knowledge_hash(logs_dir),
            "bootstrapped_at": time.time(),
            "last_used_at": time.time(),
            "turn_count": 0,
            "bootstrap_mode": "full_original_chunks",
        }
        self._save_session_state(logs_dir, state)
        return state

    def _ensure_session(self, logs_dir: Path, model: str) -> dict[str, Any]:
        state = self._load_session_state(logs_dir)
        expected_hash = self._knowledge_hash(logs_dir)
        if (
            state.get("thread_id")
            and state.get("knowledge_hash") == expected_hash
            and str(state.get("model") or "") == model
        ):
            return state
        return self._bootstrap_session(logs_dir, model)

    def invoke(
        self,
        system_text: str,
        user_text: str,
        logs_dir: Path,
        *,
        request_name: str = "last_request.md",
        response_name: str = "last_response.json",
    ) -> DecisionProviderResult:
        codex_bin = shutil.which("codex")
        if not codex_bin:
            raise RuntimeError("codex CLI not found in PATH")
        model = self.config.model or "gpt-5.4"
        session_state = self._ensure_session(logs_dir, model)
        session_id = str(session_state.get("thread_id") or "")
        if not session_id:
            raise RuntimeError("codex cli session bootstrap did not produce a thread id")

        compact_system = self._strip_loaded_knowledge(system_text)
        active_refs = self._active_ref_names(system_text)
        request_markdown = "\n\n".join(
            [
                "AB Patrol-Agent decision turn via Codex CLI long session.",
                "",
                f"Session thread: {session_id}",
                "patrol-l1 的原始 SKILL.md 与全部 S 文件已经在本线程中完整加载。",
                "本轮不要重新解释这些知识文件，只基于当前运行上下文应用它们。",
                "",
                "# Compact System Prompt",
                compact_system,
                "",
                "# Active References This Turn",
                "\n".join(f"- {name}" for name in active_refs) or "- (none)",
                "",
                "# Patrol User Prompt",
                user_text,
            ]
        )
        write_text(logs_dir / request_name, request_markdown)

        output_path = logs_dir / "_codex_last_message.txt"
        model = self.config.model or "gpt-5.4"
        prompt = "\n\n".join(
            [
                compact_system,
                "",
                "你已经在当前长会话中完整加载了 patrol-l1 的原始 SKILL.md 与全部 S 文件。",
                "本轮只根据已经加载的完整知识，以及下面这轮明确激活的文件名和运行上下文做判断。",
                "如果当前激活文件名与先前知识冲突，以已经加载的完整原文为准；如果没有激活，默认仍服从原始 patrol-l1 铁律。",
                "",
                "本轮激活的文件名：",
                "\n".join(f"- {name}" for name in active_refs) or "- (none)",
                "",
                user_text,
                "",
                "Return the final answer as raw JSON only.",
                "Do not wrap it in markdown fences.",
                "Do not add any explanation before or after the JSON object.",
            ]
        )
        cmd = [
            codex_bin,
            "exec",
            "resume",
            session_id,
            "--skip-git-repo-check",
            "--dangerously-bypass-approvals-and-sandbox",
            "--json",
            "-o",
            str(output_path),
            "-m",
            model,
            "-",
        ]
        try:
            result = subprocess.run(
                cmd,
                input=prompt,
                capture_output=True,
                text=True,
                timeout=max(self.config.timeout_seconds + 60, 120),
            )
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError(f"codex cli timeout after {self.config.timeout_seconds + 60}s") from exc
        if result.returncode != 0:
            stderr = (result.stderr or result.stdout or "").strip()
            if "thread" in stderr.lower() and any(token in stderr.lower() for token in ("not found", "missing", "unknown")):
                self._save_session_state(logs_dir, {})
            raise RuntimeError(stderr or f"codex cli rc={result.returncode}")
        if not output_path.exists():
            raise RuntimeError("codex cli did not produce structured output")
        response_text = output_path.read_text(encoding="utf-8").strip()
        resumed_thread_id = self._extract_thread_id(result.stdout or "") or session_id
        payload = {
            "provider": "codex_cli",
            "model": model,
            "session_id": resumed_thread_id,
            "last_message": response_text,
            "bootstrap_mode": session_state.get("bootstrap_mode"),
            "active_refs": active_refs,
        }
        write_json(logs_dir / response_name, payload)
        session_state.update(
            {
                "thread_id": resumed_thread_id,
                "model": model,
                "knowledge_hash": self._knowledge_hash(logs_dir),
                "last_used_at": time.time(),
                "turn_count": int(session_state.get("turn_count") or 0) + 1,
            }
        )
        self._save_session_state(logs_dir, session_state)
        return DecisionProviderResult(
            provider="codex_cli",
            payload=payload,
            response_text=response_text,
            session_id=resumed_thread_id,
            model=model,
        )


class OpenAICompatDecisionProvider:
    def __init__(self, config: DecisionProviderConfig):
        self.config = config

    def _chat_url(self) -> str:
        base = self.config.api_base.strip().rstrip("/")
        if not base:
            raise RuntimeError("missing AB_PATROL_LLM_API_BASE for direct provider")
        if base.endswith("/chat/completions"):
            return base
        if base.endswith("/v1"):
            return f"{base}/chat/completions"
        return f"{base}/v1/chat/completions"

    @staticmethod
    def _extract_text(payload: dict[str, Any]) -> str:
        choices = payload.get("choices")
        if not isinstance(choices, list) or not choices:
            raise RuntimeError(f"provider returned no choices: {json.dumps(payload, ensure_ascii=False)[:800]}")
        message = choices[0].get("message") if isinstance(choices[0], dict) else None
        content = (message or {}).get("content")
        if isinstance(content, str):
            return content.strip()
        if isinstance(content, list):
            text_parts: list[str] = []
            for item in content:
                if isinstance(item, dict) and item.get("type") == "text":
                    text_parts.append(str(item.get("text") or ""))
            return "\n".join(part.strip() for part in text_parts if part.strip())
        raise RuntimeError(f"provider returned unsupported content shape: {json.dumps(message, ensure_ascii=False)[:800]}")

    def invoke(
        self,
        system_text: str,
        user_text: str,
        logs_dir: Path,
        *,
        request_name: str = "last_request.md",
        response_name: str = "last_response.json",
    ) -> DecisionProviderResult:
        if not self.config.model:
            raise RuntimeError("missing AB_PATROL_LLM_MODEL for direct provider")

        request_markdown = "\n\n".join(
            [
                f"AB Patrol-Agent decision turn via direct provider `{self.config.provider}`.",
                "",
                "Use only the supplied patrol instructions and runtime context below.",
                "",
                "Return raw JSON only.",
                "",
                "# Patrol System Prompt",
                system_text,
                "",
                "# Patrol User Prompt",
                user_text,
            ]
        )
        write_text(logs_dir / request_name, request_markdown)

        body = {
            "model": self.config.model,
            "messages": [
                {"role": "system", "content": system_text},
                {"role": "user", "content": user_text},
            ],
            "temperature": 0.1,
        }
        raw_body = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"
        request = urllib.request.Request(self._chat_url(), data=raw_body, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=self.config.timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"provider http {exc.code}: {detail}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"provider url error: {exc}") from exc
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"provider returned non-json payload: {exc}") from exc
        write_json(logs_dir / response_name, payload)
        response_text = self._extract_text(payload)
        return DecisionProviderResult(
            provider=self.config.provider,
            payload=payload,
            response_text=response_text,
            session_id=str(payload.get("id") or ""),
            model=str(payload.get("model") or self.config.model),
        )


def build_decision_provider(config: DecisionProviderConfig):
    provider = (config.provider or "openclaw").strip().lower()
    if provider in {"openclaw", "openclaw_oauth"}:
        return OpenClawDecisionProvider(config)
    if provider in {"codex", "codex_cli", "codex-exec"}:
        return CodexCLIDecisionProvider(config)
    if provider in {"openai_compat", "openai-compatible", "openai"}:
        return OpenAICompatDecisionProvider(config)
    raise ValueError(f"unsupported decision provider: {config.provider}")
