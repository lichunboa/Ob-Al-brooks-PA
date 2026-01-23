# -*- coding: utf-8 -*-
from __future__ import annotations


def test_build_data_quality_flags_missing():
    from src.data.fetcher import _build_data_quality, ALL_INTERVALS

    candles = {iv: [] for iv in ALL_INTERVALS}
    metrics = []
    indicators = {"error": "db missing"}
    snapshot = {}

    quality = _build_data_quality(candles, metrics, indicators, snapshot)

    assert quality["ok"] is False
    assert "metrics_empty" in quality["warnings"]
    assert any("candles_missing" in w for w in quality["warnings"])
    assert quality["indicators"]["error_tables"]
