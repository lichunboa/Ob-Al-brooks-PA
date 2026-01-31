"""Pytest configuration for predict-service tests."""

import pytest


@pytest.fixture
def sample_market():
    """Sample prediction market for tests."""
    return "polymarket"
