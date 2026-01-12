"""Pytest configuration and fixtures."""

import pytest
import pandas as pd
import numpy as np
from datetime import datetime, timedelta


@pytest.fixture
def sample_ohlcv() -> pd.DataFrame:
    """Generate sample OHLCV data for testing."""
    n = 100
    np.random.seed(42)
    
    base_price = 100.0
    returns = np.random.randn(n) * 0.02
    prices = base_price * np.cumprod(1 + returns)
    
    df = pd.DataFrame({
        "timestamp": pd.date_range(
            end=datetime.utcnow(),
            periods=n,
            freq="1h"
        ),
        "open": prices * (1 + np.random.randn(n) * 0.005),
        "high": prices * (1 + np.abs(np.random.randn(n)) * 0.01),
        "low": prices * (1 - np.abs(np.random.randn(n)) * 0.01),
        "close": prices,
        "volume": np.random.uniform(1000, 10000, n),
    })
    
    # Ensure high >= open, close, low and low <= open, close, high
    df["high"] = df[["open", "high", "low", "close"]].max(axis=1)
    df["low"] = df[["open", "high", "low", "close"]].min(axis=1)
    
    return df


@pytest.fixture
def sample_ohlcv_short() -> pd.DataFrame:
    """Generate short OHLCV data (20 candles) for testing."""
    n = 20
    np.random.seed(123)
    
    base_price = 50000.0
    returns = np.random.randn(n) * 0.01
    prices = base_price * np.cumprod(1 + returns)
    
    df = pd.DataFrame({
        "timestamp": pd.date_range(
            end=datetime.utcnow(),
            periods=n,
            freq="4h"
        ),
        "open": prices * (1 + np.random.randn(n) * 0.003),
        "high": prices * (1 + np.abs(np.random.randn(n)) * 0.008),
        "low": prices * (1 - np.abs(np.random.randn(n)) * 0.008),
        "close": prices,
        "volume": np.random.uniform(5000, 20000, n),
    })
    
    df["high"] = df[["open", "high", "low", "close"]].max(axis=1)
    df["low"] = df[["open", "high", "low", "close"]].min(axis=1)
    
    return df


@pytest.fixture
def btc_like_ohlcv() -> pd.DataFrame:
    """Generate BTC-like OHLCV data with realistic price movements."""
    n = 200
    np.random.seed(2024)
    
    base_price = 42000.0
    
    # Simulate realistic price movement with trends
    trend = np.sin(np.linspace(0, 4 * np.pi, n)) * 0.1
    noise = np.random.randn(n) * 0.015
    returns = trend * 0.01 + noise
    
    prices = base_price * np.cumprod(1 + returns)
    
    df = pd.DataFrame({
        "timestamp": pd.date_range(
            end=datetime.utcnow(),
            periods=n,
            freq="1h"
        ),
        "open": prices * (1 + np.random.randn(n) * 0.002),
        "high": prices * (1 + np.abs(np.random.randn(n)) * 0.005),
        "low": prices * (1 - np.abs(np.random.randn(n)) * 0.005),
        "close": prices,
        "volume": np.random.uniform(10000, 50000, n) * (1 + np.abs(returns) * 10),
    })
    
    df["high"] = df[["open", "high", "low", "close"]].max(axis=1)
    df["low"] = df[["open", "high", "low", "close"]].min(axis=1)
    
    return df


@pytest.fixture
def mock_ccxt(mocker):
    """Mock ccxt for testing without network calls."""
    mock = mocker.patch("tradecat.data.klines.ccxt")
    return mock
