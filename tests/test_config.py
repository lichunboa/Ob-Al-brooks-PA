"""Tests for configuration module."""

import os
import pytest
from unittest.mock import patch

from tradecat._internal.config import Config, _Config, _config


class TestConfig:
    """Test configuration management."""
    
    def setup_method(self):
        """Reset config before each test."""
        _config._initialized = False
        _config.database_url = None
        _config.api_key = None
        _config.api_secret = None
        _config.proxy = None
        _config.default_exchange = "binance"
        _config.timeout = 30
        _config.rate_limit = True
    
    def test_set_database(self):
        """Test setting database URL."""
        url = "postgresql://localhost:5434/market_data"
        Config.set_database(url)
        
        assert _config.database_url == url
    
    def test_set_credentials(self):
        """Test setting API credentials."""
        Config.set_credentials(api_key="test_key", api_secret="test_secret")
        
        assert _config.api_key == "test_key"
        assert _config.api_secret == "test_secret"
    
    def test_set_credentials_partial(self):
        """Test setting only api_key."""
        Config.set_credentials(api_key="only_key")
        
        assert _config.api_key == "only_key"
        assert _config.api_secret is None
    
    def test_set_proxy(self):
        """Test setting proxy."""
        proxy = "http://127.0.0.1:7890"
        Config.set_proxy(proxy)
        
        assert _config.proxy == proxy
    
    def test_set_exchange(self):
        """Test setting default exchange."""
        Config.set_exchange("OKX")
        
        assert _config.default_exchange == "okx"
    
    def test_set_timeout(self):
        """Test setting timeout."""
        Config.set_timeout(60)
        
        assert _config.timeout == 60
    
    def test_get_all(self):
        """Test getting all config values."""
        # Set initialized to True to prevent env loading from overwriting values
        _config._initialized = True
        _config.database_url = "postgresql://test"
        _config.api_key = "key"
        _config.api_secret = "secret"
        _config.proxy = "http://proxy"
        _config.default_exchange = "binance"
        _config.timeout = 30
        _config.rate_limit = True
        
        all_config = Config.get_all()
        
        assert all_config["database_url"] == "postgresql://test"
        assert all_config["api_key"] == "***"  # Masked
        assert all_config["api_secret"] == "***"  # Masked
        assert all_config["proxy"] == "http://proxy"
        assert all_config["default_exchange"] == "binance"
        assert all_config["timeout"] == 30
        assert all_config["rate_limit"] is True
    
    def test_get_all_no_credentials(self):
        """Test get_all when no credentials set."""
        all_config = Config.get_all()
        
        assert all_config["api_key"] is None
        assert all_config["api_secret"] is None
    
    def test_get_config_internal(self):
        """Test internal _get_config method."""
        config = Config._get_config()
        
        assert config is _config
    
    def test_load_from_env(self):
        """Test loading config from environment variables."""
        with patch.dict(os.environ, {
            "TRADECAT_DATABASE_URL": "postgresql://env_db",
            "TRADECAT_API_KEY": "env_key",
            "TRADECAT_API_SECRET": "env_secret",
            "TRADECAT_PROXY": "http://env_proxy",
        }):
            _config._initialized = False
            _config._load_from_env()
            
            assert _config.database_url == "postgresql://env_db"
            assert _config.api_key == "env_key"
            assert _config.api_secret == "env_secret"
            assert _config.proxy == "http://env_proxy"
    
    def test_load_from_env_fallback(self):
        """Test fallback to non-prefixed env vars."""
        with patch.dict(os.environ, {
            "DATABASE_URL": "postgresql://fallback_db",
            "BINANCE_API_KEY": "fallback_key",
            "BINANCE_API_SECRET": "fallback_secret",
            "HTTP_PROXY": "http://fallback_proxy",
        }, clear=True):
            _config._initialized = False
            _config._load_from_env()
            
            assert _config.database_url == "postgresql://fallback_db"
            assert _config.api_key == "fallback_key"
            assert _config.api_secret == "fallback_secret"
            assert _config.proxy == "http://fallback_proxy"
    
    def test_load_from_env_only_once(self):
        """Test that env vars are loaded only once."""
        _config._initialized = False
        _config._load_from_env()
        
        original_db = _config.database_url
        
        with patch.dict(os.environ, {"TRADECAT_DATABASE_URL": "new_value"}):
            _config._load_from_env()
            # Should not change because already initialized
            assert _config.database_url == original_db


class TestConfigDataclass:
    """Test _Config dataclass."""
    
    def test_default_values(self):
        """Test default values."""
        config = _Config()
        
        assert config.database_url is None
        assert config.api_key is None
        assert config.api_secret is None
        assert config.proxy is None
        assert config.default_exchange == "binance"
        assert config.timeout == 30
        assert config.rate_limit is True
        assert config._initialized is False
