"""Pytest configuration for ai-service tests."""

import pytest


@pytest.fixture
def sample_symbol():
    """Sample trading symbol for tests."""
    return "BTCUSDT"
