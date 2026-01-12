"""Tests for AI analysis module."""

import os
import pytest
from unittest.mock import patch, MagicMock
import pandas as pd
import numpy as np

from tradecat.ai import AI
from tradecat.ai.analyzer import Analysis


class TestAnalysis:
    """Test Analysis dataclass."""
    
    def test_analysis_creation(self):
        """Test creating Analysis object."""
        analysis = Analysis(
            symbol="BTCUSDT",
            summary="BTC is bullish",
            wyckoff="Accumulation phase",
            trend="bullish",
            support_resistance=[40000, 45000],
            suggestion="Consider long position",
            confidence=0.8,
            raw_response="Full response text",
        )
        
        assert analysis.symbol == "BTCUSDT"
        assert analysis.summary == "BTC is bullish"
        assert analysis.wyckoff == "Accumulation phase"
        assert analysis.confidence == 0.8
    
    def test_analysis_to_dict(self):
        """Test converting Analysis to dict."""
        analysis = Analysis(
            symbol="BTCUSDT",
            summary="Test summary",
            trend="bullish",
        )
        
        d = analysis.to_dict()
        
        assert d["symbol"] == "BTCUSDT"
        assert d["summary"] == "Test summary"
        assert d["trend"] == "bullish"
        assert "raw_response" not in d


class TestAI:
    """Test AI analysis functionality."""
    
    @pytest.fixture
    def mock_ohlcv_data(self):
        """Create mock OHLCV data."""
        n = 50
        np.random.seed(42)
        prices = 42000 * np.cumprod(1 + np.random.randn(n) * 0.01)
        
        return pd.DataFrame({
            "timestamp": pd.date_range("2024-01-01", periods=n, freq="4h"),
            "open": prices * 0.999,
            "high": prices * 1.005,
            "low": prices * 0.995,
            "close": prices,
            "volume": np.random.uniform(1000, 5000, n),
        })
    
    def test_available_models(self):
        """Test listing available models."""
        models = AI.available_models()
        
        assert isinstance(models, list)
        assert "gpt-4" in models
        assert "gpt-3.5-turbo" in models
        assert "claude-3-opus" in models
        assert "gemini-pro" in models
        assert "deepseek-chat" in models
    
    def test_build_context(self, mock_ohlcv_data):
        """Test building context for analysis."""
        with patch("tradecat.ai.analyzer.Data") as mock_data:
            mock_data.klines.return_value = mock_ohlcv_data
            
            with patch("tradecat.ai.analyzer.Signals") as mock_signals:
                mock_signals.detect.return_value = [{"name": "RSI", "type": "bullish"}]
                
                context = AI._build_context("BTCUSDT", "4h")
        
        assert context["symbol"] == "BTCUSDT"
        assert "current_price" in context
        assert "indicators" in context
        assert "signals" in context
    
    def test_build_context_insufficient_data(self):
        """Test context building with insufficient data."""
        short_df = pd.DataFrame({
            "timestamp": pd.date_range("2024-01-01", periods=5, freq="1h"),
            "open": [100, 101, 102, 103, 104],
            "high": [101, 102, 103, 104, 105],
            "low": [99, 100, 101, 102, 103],
            "close": [100.5, 101.5, 102.5, 103.5, 104.5],
            "volume": [1000, 1000, 1000, 1000, 1000],
        })
        
        with patch("tradecat.ai.analyzer.Data") as mock_data:
            mock_data.klines.return_value = short_df
            
            context = AI._build_context("BTCUSDT", "4h")
        
        assert "error" in context
    
    def test_bb_position_above_upper(self, mock_ohlcv_data):
        """Test BB position detection - above upper."""
        from tradecat.indicators import Indicators
        
        # Modify data so close is above upper band
        mock_ohlcv_data["close"] = mock_ohlcv_data["close"] * 1.1
        
        ind = Indicators(mock_ohlcv_data)
        position = AI._bb_position(mock_ohlcv_data, ind)
        
        assert position in ["above_upper", "upper_half", "lower_half", "below_lower"]
    
    def test_build_prompt(self):
        """Test prompt building."""
        context = {
            "current_price": 42000,
            "price_change_24h": 2.5,
            "high_24h": 43000,
            "low_24h": 41000,
            "indicators": {"rsi": 55, "macd_hist": 0.5, "ema_7": 42100, "ema_25": 41900, "ema_99": None, "bb_position": "upper_half"},
            "signals": [],
        }
        
        prompt = AI._build_prompt("BTCUSDT", context, "technical", "en")
        
        assert "BTCUSDT" in prompt
        assert "42000" in prompt or "42,000" in prompt
        assert "RSI" in prompt
    
    def test_build_prompt_wyckoff(self):
        """Test prompt building with Wyckoff method."""
        context = {
            "current_price": 42000,
            "price_change_24h": 2.5,
            "high_24h": 43000,
            "low_24h": 41000,
            "indicators": {"rsi": 55, "macd_hist": 0.5, "ema_7": 42100, "ema_25": 41900, "ema_99": 41500, "bb_position": "upper_half"},
            "signals": [],
        }
        
        prompt = AI._build_prompt("BTCUSDT", context, "wyckoff", "en")
        
        assert "Wyckoff" in prompt
    
    def test_build_prompt_chinese(self):
        """Test prompt building in Chinese."""
        context = {
            "current_price": 42000,
            "price_change_24h": 2.5,
            "high_24h": 43000,
            "low_24h": 41000,
            "indicators": {"rsi": 55, "macd_hist": 0.5, "ema_7": 42100, "ema_25": 41900, "ema_99": 41500, "bb_position": "upper_half"},
            "signals": [],
        }
        
        prompt = AI._build_prompt("BTCUSDT", context, "technical", "zh")
        
        assert "Chinese" in prompt or "中文" in prompt
    
    def test_parse_response_summary(self):
        """Test parsing response with summary section."""
        response = """
        ## Summary
        BTC is showing bullish momentum.
        
        ## Trend Analysis
        The trend is bullish with strong support.
        
        ## Suggestion
        Consider entering long positions.
        """
        
        analysis = AI._parse_response("BTCUSDT", response)
        
        assert analysis.symbol == "BTCUSDT"
        assert len(analysis.summary) > 0
    
    def test_parse_response_no_sections(self):
        """Test parsing response without clear sections."""
        response = "BTC looks bullish. Consider buying. RSI is at 45."
        
        analysis = AI._parse_response("BTCUSDT", response)
        
        assert analysis.symbol == "BTCUSDT"
        assert len(analysis.summary) > 0
    
    def test_parse_response_long(self):
        """Test parsing very long response."""
        response = "A" * 1000
        
        analysis = AI._parse_response("BTCUSDT", response)
        
        assert len(analysis.summary) <= 503  # 500 + "..."
    
    def test_call_openai_no_key(self):
        """Test OpenAI call without API key."""
        with patch.dict(os.environ, {}, clear=True):
            with pytest.raises(ValueError, match="OpenAI API key not found"):
                AI._call_openai("test prompt", "gpt-4")
    
    def test_call_openai_mock(self):
        """Test OpenAI call with mock."""
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}):
            with patch("openai.OpenAI") as mock_openai_class:
                mock_client = MagicMock()
                mock_openai_class.return_value = mock_client
                mock_client.chat.completions.create.return_value.choices = [
                    MagicMock(message=MagicMock(content="Test response"))
                ]
                
                result = AI._call_openai("test prompt", "gpt-4")
                
                assert result == "Test response"
    
    def test_call_anthropic_no_key(self):
        """Test Anthropic call without API key."""
        with patch.dict(os.environ, {}, clear=True):
            with pytest.raises(ValueError, match="Anthropic API key not found"):
                AI._call_anthropic("test prompt", "claude-3-opus")
    
    def test_call_anthropic_mock(self):
        """Test Anthropic call with mock."""
        with patch.dict(os.environ, {"ANTHROPIC_API_KEY": "test-key"}):
            with patch("anthropic.Anthropic") as mock_anthropic_class:
                mock_client = MagicMock()
                mock_anthropic_class.return_value = mock_client
                mock_client.messages.create.return_value.content = [
                    MagicMock(text="Test response")
                ]
                
                result = AI._call_anthropic("test prompt", "claude-3-opus")
                
                assert result == "Test response"
    
    def test_call_google_no_key(self):
        """Test Google call without API key."""
        with patch.dict(os.environ, {}, clear=True):
            with pytest.raises(ValueError, match="Google API key not found"):
                AI._call_google("test prompt", "gemini-pro")
    
    def test_call_google_mock(self):
        """Test Google call with mock."""
        with patch.dict(os.environ, {"GOOGLE_API_KEY": "test-key"}):
            with patch("google.generativeai.configure"):
                with patch("google.generativeai.GenerativeModel") as mock_model_class:
                    mock_model = MagicMock()
                    mock_model_class.return_value = mock_model
                    mock_model.generate_content.return_value.text = "Test response"
                    
                    result = AI._call_google("test prompt", "gemini-pro")
                    
                    assert result == "Test response"
    
    def test_call_deepseek_no_key(self):
        """Test DeepSeek call without API key."""
        with patch.dict(os.environ, {}, clear=True):
            with pytest.raises(ValueError, match="DeepSeek API key not found"):
                AI._call_deepseek("test prompt", "deepseek-chat")
    
    def test_call_deepseek_mock(self):
        """Test DeepSeek call with mock."""
        with patch.dict(os.environ, {"DEEPSEEK_API_KEY": "test-key"}):
            mock_response = MagicMock()
            mock_response.json.return_value = {
                "choices": [{"message": {"content": "Test response"}}]
            }
            mock_response.raise_for_status = MagicMock()
            
            with patch("requests.post", return_value=mock_response):
                result = AI._call_deepseek("test prompt", "deepseek-chat")
                
                assert result == "Test response"
    
    def test_call_llm_openai(self):
        """Test _call_llm routes to OpenAI."""
        with patch.object(AI, "_call_openai", return_value="response") as mock:
            result = AI._call_llm("prompt", "gpt-4")
            
            mock.assert_called_once_with("prompt", "gpt-4")
            assert result == "response"
    
    def test_call_llm_anthropic(self):
        """Test _call_llm routes to Anthropic."""
        with patch.object(AI, "_call_anthropic", return_value="response") as mock:
            result = AI._call_llm("prompt", "claude-3-opus")
            
            mock.assert_called_once_with("prompt", "claude-3-opus")
    
    def test_call_llm_google(self):
        """Test _call_llm routes to Google."""
        with patch.object(AI, "_call_google", return_value="response") as mock:
            result = AI._call_llm("prompt", "gemini-pro")
            
            mock.assert_called_once_with("prompt", "gemini-pro")
    
    def test_call_llm_deepseek(self):
        """Test _call_llm routes to DeepSeek."""
        with patch.object(AI, "_call_deepseek", return_value="response") as mock:
            result = AI._call_llm("prompt", "deepseek-chat")
            
            mock.assert_called_once_with("prompt", "deepseek-chat")
    
    def test_call_llm_unknown_model(self):
        """Test _call_llm with unknown model defaults to OpenAI."""
        with patch.object(AI, "_call_openai", return_value="response") as mock:
            result = AI._call_llm("prompt", "unknown-model")
            
            mock.assert_called_once()
    
    def test_analyze_full(self, mock_ohlcv_data):
        """Test full analyze flow."""
        with patch("tradecat.ai.analyzer.Data") as mock_data:
            mock_data.klines.return_value = mock_ohlcv_data
            
            with patch("tradecat.ai.analyzer.Signals") as mock_signals:
                mock_signals.detect.return_value = []
                
                with patch.object(AI, "_call_llm", return_value="Summary: BTC is bullish.\nTrend: Upward"):
                    analysis = AI.analyze("BTCUSDT", model="gpt-3.5-turbo")
        
        assert analysis.symbol == "BTCUSDT"
        assert len(analysis.summary) > 0
