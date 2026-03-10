"""图表与 AB 上下文管理。"""

from __future__ import annotations

import json
import logging
import os
import subprocess
import sys
import time
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from utils import shrink_prompt_value

LOG = logging.getLogger("ab_patrol_runtime")


class ChartManagerMixin:
    """封装图表生成、路径映射与 AB 上下文构建。"""

    def chart_python(self) -> str:
        candidates: list[Path] = []
        if self.config.tool_python_override:
            candidates.append(Path(self.config.tool_python_override))
        candidates.append(self.config.agent_root / ".venv" / "bin" / "python")
        for candidate in candidates:
            if candidate.exists():
                return str(candidate)
        return sys.executable or "python3"

    def tool_python(self) -> str:
        return self.chart_python()

    def chart_roots(self) -> list[Path]:
        return [self.config.charts_root]

    def latest_chart_paths(self, symbol: str) -> list[str]:
        paths: list[Path] = []
        for root in self.chart_roots():
            today_dir = root / datetime.now().strftime("%Y-%m-%d")
            daily_dir = root / "daily"
            if today_dir.exists():
                paths.extend(sorted(today_dir.glob(f"{symbol}_*.png"), key=lambda p: p.stat().st_mtime, reverse=True)[:4])
            daily_path = daily_dir / f"{symbol}_1d.png"
            if daily_path.exists():
                paths.append(daily_path)
        paths = sorted(paths, key=lambda p: p.stat().st_mtime if p.exists() else 0, reverse=True)
        return [str(path) for path in paths[:5]]

    def chart_relative_path(self, path: str) -> str:
        resolved = self.chart_absolute_path(path) or Path(path).resolve()
        for root in self.chart_roots():
            try:
                return str(resolved.relative_to(root.resolve()))
            except Exception:
                continue
        return Path(path).name

    def chart_absolute_path(self, path: str | None) -> Path | None:
        if not path:
            return None
        candidate = Path(path)
        candidates: list[Path]
        if candidate.is_absolute():
            candidates = [candidate]
            path_text = str(candidate)
            marker = f"{os.sep}data{os.sep}charts{os.sep}"
            if marker in path_text:
                relative_text = path_text.split(marker, 1)[1]
                for root in self.chart_roots():
                    candidates.append(root / relative_text)
        else:
            candidates = [root / str(path) for root in self.chart_roots()]
        for item in candidates:
            try:
                resolved = item.expanduser().resolve()
            except Exception:
                continue
            if resolved.exists() and resolved.is_file():
                return resolved
        return None

    def build_chart_context(self, symbol: str, live: dict[str, Any]) -> dict[str, Any]:
        now = time.time()
        chart_paths = self.latest_chart_paths(symbol)
        if now - self.chart_refresh_state.get(symbol, 0.0) >= 90:
            try:
                cmd = [
                    self.chart_python(),
                    str(self.config.tools_root / "chart_gen.py"),
                    "-s",
                    symbol,
                    "-i",
                    "5m,15m,1h,1d",
                    "--port",
                    str(self.execution_port()),
                ]
                result = subprocess.run(
                    cmd,
                    cwd=str(self.config.agent_root),
                    capture_output=True,
                    text=True,
                    timeout=150,
                )
                if result.returncode != 0:
                    LOG.warning("generate charts failed for %s: %s", symbol, (result.stderr or result.stdout or "").strip())
                self.chart_refresh_state[symbol] = now
            except Exception as exc:
                LOG.warning("generate charts failed for %s: %s", symbol, exc)
        chart_paths = self.latest_chart_paths(symbol)
        relative_paths = [self.chart_relative_path(path) for path in chart_paths[:4]]
        latest_generated_at = None
        if chart_paths:
            try:
                latest_generated_at = datetime.fromtimestamp(
                    max(Path(path).stat().st_mtime for path in chart_paths[:4]),
                    tz=timezone.utc,
                ).astimezone().isoformat()
            except Exception:
                latest_generated_at = None

        return {
            "chart_files": [Path(path).name for path in chart_paths[:4]],
            "chart_paths": relative_paths,
            "chart_api_paths": [f"/api/charts?path={urllib.parse.quote(path)}" for path in relative_paths],
            "primary_chart_file": Path(chart_paths[0]).name if chart_paths else None,
            "primary_chart_path": relative_paths[0] if relative_paths else None,
            "primary_chart_api_path": (
                f"/api/charts?path={urllib.parse.quote(relative_paths[0])}" if relative_paths else None
            ),
            "latest_generated_at": latest_generated_at,
            "chart_note": "图表由 chart_gen.py 生成，内部会应用 ab_ema / ab_sr / ab_mm / ab_patterns 做可视化标注。",
        }

    def build_ab_context(self, symbol: str) -> dict[str, Any]:
        cmd = [
            self.tool_python(),
            str(self.config.tools_root / "patrol_ab_context.py"),
            "--symbol",
            symbol,
            "--port",
            str(self.execution_port()),
        ]
        try:
            result = subprocess.run(
                cmd,
                cwd=str(self.config.agent_root),
                capture_output=True,
                text=True,
                timeout=150,
            )
        except Exception as exc:
            return {"_error": str(exc)}
        if result.returncode != 0:
            return {"_error": (result.stderr or result.stdout or "").strip()}
        try:
            return json.loads((result.stdout or "").strip() or "{}")
        except json.JSONDecodeError as exc:
            return {"_error": f"invalid ab context json: {exc}"}

    def prompt_ab_context(self, ab_context: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(ab_context, dict):
            return {}
        frames = ab_context.get("timeframes") if isinstance(ab_context.get("timeframes"), dict) else {}
        summarized_frames: dict[str, Any] = {}
        for timeframe in ("5m", "15m", "1h", "1d"):
            frame = frames.get(timeframe)
            if not isinstance(frame, dict):
                continue
            ab_ema = frame.get("ab_ema") if isinstance(frame.get("ab_ema"), dict) else {}
            ab_sr = frame.get("ab_sr") if isinstance(frame.get("ab_sr"), dict) else {}
            ab_mm = frame.get("ab_mm") if isinstance(frame.get("ab_mm"), dict) else {}
            ab_patterns = frame.get("ab_patterns") if isinstance(frame.get("ab_patterns"), dict) else {}
            summarized_frames[timeframe] = {
                "ai": frame.get("ai"),
                "state": frame.get("state"),
                "signal": frame.get("signal"),
                "momentum_fading": frame.get("momentum_fading"),
                "events": [str(item) for item in (frame.get("events") or [])[:4]],
                "ab_ema": {
                    "mag_type": ab_ema.get("mag_type"),
                    "first_pb_type": ab_ema.get("first_pb_type"),
                    "first_pb_bars_ago": ab_ema.get("first_pb_bars_ago"),
                    "ema_sr_valid": ab_ema.get("ema_sr_valid"),
                },
                "ab_sr": {
                    "tr_position": ab_sr.get("tr_position"),
                    "trend_phase": ab_sr.get("trend_phase"),
                    "nearest_support": ab_sr.get("nearest_support"),
                    "nearest_resistance": ab_sr.get("nearest_resistance"),
                },
                "ab_mm": {
                    "nearest_bull_target": ab_mm.get("nearest_bull_target"),
                    "nearest_bear_target": ab_mm.get("nearest_bear_target"),
                },
                "ab_patterns": {
                    "latest_h": ab_patterns.get("latest_h"),
                    "latest_h_bars_ago": ab_patterns.get("latest_h_bars_ago"),
                    "latest_l": ab_patterns.get("latest_l"),
                    "latest_l_bars_ago": ab_patterns.get("latest_l_bars_ago"),
                    "wedge_count": ab_patterns.get("wedge_count"),
                    "pressure": ab_patterns.get("pressure"),
                    "pb_depth": ab_patterns.get("pb_depth"),
                },
            }
        return {
            "alignment_score": ab_context.get("alignment_score"),
            "dominant_direction": ab_context.get("dominant_direction"),
            "best_signal": ab_context.get("best_signal"),
            "quick_scan": ab_context.get("quick_scan") if isinstance(ab_context.get("quick_scan"), dict) else {},
            "timeframes": shrink_prompt_value(summarized_frames),
        }
