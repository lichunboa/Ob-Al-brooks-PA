"""Pytest configuration for data-service tests."""

import pytest


@pytest.fixture
def sample_symbol():
    """Sample trading symbol for tests."""
    return "BTCUSDT"
