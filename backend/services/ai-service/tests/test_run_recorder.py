# -*- coding: utf-8 -*-
from __future__ import annotations

from pathlib import Path


def test_run_recorder_sanitizes_prompt_name(tmp_path, monkeypatch):
    """prompt_name 含路径分隔符时应被安全化，避免落盘失败。"""
    from src.utils.run_recorder import RunRecorder

    monkeypatch.setenv("AI_RECORD_ENABLED", "1")
    monkeypatch.setenv("AI_RECORD_PROMPT", "1")
    monkeypatch.setenv("AI_RECORD_PAYLOAD", "0")
    monkeypatch.setenv("AI_RECORD_MESSAGES", "0")
    monkeypatch.setenv("AI_RECORD_ANALYSIS", "0")

    recorder = RunRecorder(base_dir=str(tmp_path))
    recorder.save_run(
        symbol="BTCUSDT",
        interval="4h",
        prompt_name="zh_CN/市场全局解析",
        payload={"symbol": "BTCUSDT"},
        prompt_text="test",
    )

    # 找到最新生成目录
    run_dirs = [p for p in Path(tmp_path).iterdir() if p.is_dir()]
    assert run_dirs, "未生成记录目录"
    prompt_files = list(run_dirs[0].glob("*.txt"))
    assert prompt_files, "未生成 prompt 文件"
    assert any("zh_CN_市场全局解析" in p.name for p in prompt_files)
