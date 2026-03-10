"""
PA Runtime 配置类

管理 PA 交易系统的所有配置参数
"""

import os
from dataclasses import dataclass
from pathlib import Path

from env_loader import load_agent_env


@dataclass
class Config:
    """PA Runtime 配置"""

    vault_root: Path
    agent_root: Path
    data_root: Path
    tools_root: Path
    charts_root: Path
    knowledge_root: Path
    openclaw_agent: str = "ab-patrol-loop"
    operator_agent: str = "ab-patrol-runtime"
    requested_decision_provider: str = "codex_cli"
    decision_provider: str = "codex_cli"
    decision_fallback_provider: str = "openclaw"
    decision_api_base: str = ""
    decision_api_key: str = ""
    decision_model: str = ""
    decision_timeout_seconds: int = 180
    tool_python_override: str = ""
    execution_bot_id: str = "claude-pa"
    execution_base: str = "http://127.0.0.1:8092"
    query_service_base: str = "http://127.0.0.1:8086"
    telegram_forward_url: str = ""
    telegram_chat_id: str = "-1003512657369"
    telegram_thread_id: int = 3
    dry_run: bool = True
    post_to_telegram: bool = True
    trigger_file: Path | None = None

    @classmethod
    def build(cls, dry_run: bool, post_to_telegram: bool) -> "Config":
        """
        构建配置实例

        Args:
            dry_run: 是否为演练模式
            post_to_telegram: 是否推送到 Telegram

        Returns:
            Config 实例
        """
        agent_root = Path(__file__).resolve().parents[1]
        load_agent_env(agent_root)
        vault_root = agent_root.parent
        requested_provider = os.getenv("AB_PATROL_DECISION_PROVIDER", "codex_cli").strip().lower() or "codex_cli"
        fallback_provider = os.getenv("AB_PATROL_DECISION_FALLBACK", "openclaw").strip().lower() or "openclaw"
        strict_provider = os.getenv("AB_PATROL_DECISION_STRICT", "0").strip() in {"1", "true", "TRUE", "yes", "on"}
        decision_api_base = os.getenv("AB_PATROL_LLM_API_BASE", "").strip()
        decision_model = os.getenv("AB_PATROL_LLM_MODEL", "").strip()
        decision_provider = requested_provider
        direct_missing = requested_provider in {"openai_compat", "openai-compatible", "openai"} and not (
            decision_api_base and decision_model
        )
        if direct_missing:
            if strict_provider:
                raise RuntimeError("AB Patrol-Agent direct provider requested, but API base/model are not configured")
            decision_provider = fallback_provider
        data_root = agent_root / "data" / "pa_trader"
        return cls(
            vault_root=vault_root,
            agent_root=agent_root,
            data_root=data_root,
            tools_root=agent_root / "tools",
            charts_root=agent_root / "data" / "charts",
            knowledge_root=agent_root / "knowledge" / "patrol-l1",
            openclaw_agent=os.getenv("AB_PATROL_OPENCLAW_AGENT", "ab-patrol-loop").strip() or "ab-patrol-loop",
            operator_agent=os.getenv("AB_PATROL_OPERATOR_AGENT", "ab-patrol-runtime").strip() or "ab-patrol-runtime",
            requested_decision_provider=requested_provider,
            decision_provider=decision_provider,
            decision_fallback_provider=fallback_provider,
            decision_api_base=decision_api_base,
            decision_api_key=os.getenv("AB_PATROL_LLM_API_KEY", "").strip(),
            decision_model=decision_model,
            decision_timeout_seconds=max(30, int(os.getenv("AB_PATROL_LLM_TIMEOUT", "180"))),
            tool_python_override=os.getenv("AB_PATROL_TOOL_PYTHON", "").strip(),
            execution_base=os.getenv("AB_PATROL_EXECUTION_BASE", "http://127.0.0.1:8092").strip() or "http://127.0.0.1:8092",
            execution_bot_id=os.getenv("AB_PATROL_EXECUTION_BOT_ID", "claude-pa").strip() or "claude-pa",
            query_service_base=os.getenv("AB_PATROL_QUERY_BASE", "http://127.0.0.1:8086").strip() or "http://127.0.0.1:8086",
            dry_run=dry_run,
            post_to_telegram=post_to_telegram,
            telegram_forward_url=(
                os.getenv("AB_PATROL_TELEGRAM_FORWARD_URL", "").strip()
                or "http://127.0.0.1:8090/api/patrol-forward"
            ),
            telegram_chat_id=os.getenv("AB_PATROL_TELEGRAM_CHAT_ID", "-1003512657369").strip() or "-1003512657369",
            telegram_thread_id=int(os.getenv("AB_PATROL_TELEGRAM_THREAD_ID", "3")),
            trigger_file=Path.home() / ".openclaw" / "patrol-l1-trigger.json",
        )
