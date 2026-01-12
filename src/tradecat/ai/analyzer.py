"""AI-powered market analysis."""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from tradecat.data import Data
from tradecat.indicators import Indicators
from tradecat.signals import Signals

logger = logging.getLogger(__name__)


@dataclass
class Analysis:
    """AI analysis result."""
    symbol: str
    summary: str
    wyckoff: Optional[str] = None
    trend: Optional[str] = None
    support_resistance: Optional[List[float]] = None
    suggestion: Optional[str] = None
    confidence: float = 0.0
    raw_response: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "symbol": self.symbol,
            "summary": self.summary,
            "wyckoff": self.wyckoff,
            "trend": self.trend,
            "support_resistance": self.support_resistance,
            "suggestion": self.suggestion,
            "confidence": self.confidence,
        }


class AI:
    """AI-powered market analysis interface.
    
    Supports multiple LLM providers:
    - OpenAI (GPT-4, GPT-3.5)
    - Anthropic (Claude)
    - Google (Gemini)
    - DeepSeek
    
    Examples:
        >>> from tradecat import AI
        >>> 
        >>> # Basic analysis
        >>> result = AI.analyze("BTCUSDT")
        >>> print(result.summary)
        >>> 
        >>> # With specific model
        >>> result = AI.analyze("BTCUSDT", model="gpt-4")
        >>> 
        >>> # Wyckoff analysis
        >>> result = AI.analyze("BTCUSDT", method="wyckoff")
        >>> print(result.wyckoff)
    
    Environment Variables:
        OPENAI_API_KEY: OpenAI API key
        ANTHROPIC_API_KEY: Anthropic API key
        GOOGLE_API_KEY: Google AI API key
        DEEPSEEK_API_KEY: DeepSeek API key
    """
    
    SUPPORTED_MODELS = {
        "gpt-4": "openai",
        "gpt-4-turbo": "openai",
        "gpt-3.5-turbo": "openai",
        "claude-3-opus": "anthropic",
        "claude-3-sonnet": "anthropic",
        "gemini-pro": "google",
        "gemini-1.5-pro": "google",
        "deepseek-chat": "deepseek",
    }
    
    @classmethod
    def analyze(
        cls,
        symbol: str,
        interval: str = "4h",
        model: str = "gpt-3.5-turbo",
        method: str = "technical",
        language: str = "en",
    ) -> Analysis:
        """Analyze a symbol using AI.
        
        Args:
            symbol: Trading pair (e.g., "BTCUSDT")
            interval: Time interval for analysis (default: "4h")
            model: LLM model to use (default: "gpt-3.5-turbo")
            method: Analysis method - "technical", "wyckoff", "sentiment"
            language: Response language ("en" or "zh")
        
        Returns:
            Analysis object with summary, trend, and suggestions
        
        Raises:
            ValueError: If API key not configured
            RuntimeError: If API call fails
        """
        # Gather market data
        context = cls._build_context(symbol, interval)
        
        # Build prompt
        prompt = cls._build_prompt(symbol, context, method, language)
        
        # Call LLM
        response = cls._call_llm(prompt, model)
        
        # Parse response
        return cls._parse_response(symbol, response)
    
    @classmethod
    def _build_context(cls, symbol: str, interval: str) -> Dict[str, Any]:
        """Build context data for analysis."""
        # Fetch K-line data
        df = Data.klines(symbol, interval=interval, days=30)
        
        if len(df) < 10:
            return {"error": "Insufficient data"}
        
        # Calculate indicators
        ind = Indicators(df)
        
        # Get current values
        latest = df.iloc[-1]
        
        context = {
            "symbol": symbol,
            "interval": interval,
            "current_price": float(latest["close"]),
            "price_change_24h": float((df["close"].iloc[-1] / df["close"].iloc[-24] - 1) * 100) if len(df) > 24 else 0,
            "high_24h": float(df["high"].tail(24).max()),
            "low_24h": float(df["low"].tail(24).min()),
            "volume_24h": float(df["volume"].tail(24).sum()),
            "indicators": {
                "rsi": float(ind.rsi().iloc[-1]) if not ind.rsi().iloc[-1] != ind.rsi().iloc[-1] else None,
                "macd_hist": float(ind.macd()[2].iloc[-1]) if not ind.macd()[2].iloc[-1] != ind.macd()[2].iloc[-1] else None,
                "ema_7": float(ind.ema(7).iloc[-1]),
                "ema_25": float(ind.ema(25).iloc[-1]),
                "ema_99": float(ind.ema(99).iloc[-1]) if len(df) > 99 else None,
                "bb_position": cls._bb_position(df, ind),
            },
        }
        
        # Get signals
        signals = Signals.detect(symbol, interval)
        context["signals"] = signals[:5]  # Top 5 signals
        
        return context
    
    @classmethod
    def _bb_position(cls, df, ind) -> str:
        """Get price position relative to Bollinger Bands."""
        upper, mid, lower = ind.bollinger()
        close = df["close"].iloc[-1]
        
        if close > upper.iloc[-1]:
            return "above_upper"
        elif close < lower.iloc[-1]:
            return "below_lower"
        elif close > mid.iloc[-1]:
            return "upper_half"
        else:
            return "lower_half"
    
    @classmethod
    def _build_prompt(
        cls,
        symbol: str,
        context: Dict[str, Any],
        method: str,
        language: str,
    ) -> str:
        """Build analysis prompt."""
        
        lang_instruction = "Respond in Chinese (简体中文)." if language == "zh" else "Respond in English."
        
        base_prompt = f"""You are an expert cryptocurrency analyst. Analyze {symbol} based on the following data:

Current Price: ${context.get('current_price', 'N/A'):,.2f}
24h Change: {context.get('price_change_24h', 0):.2f}%
24h High: ${context.get('high_24h', 'N/A'):,.2f}
24h Low: ${context.get('low_24h', 'N/A'):,.2f}

Technical Indicators:
- RSI (14): {context.get('indicators', {}).get('rsi', 'N/A')}
- MACD Histogram: {context.get('indicators', {}).get('macd_hist', 'N/A')}
- EMA 7/25/99: {context.get('indicators', {}).get('ema_7', 'N/A'):.2f} / {context.get('indicators', {}).get('ema_25', 'N/A'):.2f} / {context.get('indicators', {}).get('ema_99', 'N/A') or 'N/A'}
- Bollinger Position: {context.get('indicators', {}).get('bb_position', 'N/A')}

Active Signals:
{json.dumps(context.get('signals', []), indent=2)}

{lang_instruction}

Provide:
1. Market Summary (2-3 sentences)
2. Trend Analysis (bullish/bearish/neutral with reasoning)
3. Key Support/Resistance levels
4. Trading Suggestion (with risk warning)
"""
        
        if method == "wyckoff":
            base_prompt += """
Also provide Wyckoff analysis:
- Current market phase (Accumulation, Markup, Distribution, Markdown)
- Key Wyckoff events observed
- Expected next phase
"""
        
        return base_prompt
    
    @classmethod
    def _call_llm(cls, prompt: str, model: str) -> str:
        """Call LLM API."""
        provider = cls.SUPPORTED_MODELS.get(model, "openai")
        
        if provider == "openai":
            return cls._call_openai(prompt, model)
        elif provider == "anthropic":
            return cls._call_anthropic(prompt, model)
        elif provider == "google":
            return cls._call_google(prompt, model)
        elif provider == "deepseek":
            return cls._call_deepseek(prompt, model)
        else:
            raise ValueError(f"Unsupported model: {model}")
    
    @classmethod
    def _call_openai(cls, prompt: str, model: str) -> str:
        """Call OpenAI API."""
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise ValueError(
                "OpenAI API key not found. "
                "Set OPENAI_API_KEY environment variable or use Config.set_ai_key()"
            )
        
        try:
            import openai
        except ImportError:
            raise ImportError(
                "openai package required. Install with: pip install openai"
            )
        
        client = openai.OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=1000,
        )
        
        return response.choices[0].message.content
    
    @classmethod
    def _call_anthropic(cls, prompt: str, model: str) -> str:
        """Call Anthropic API."""
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("Anthropic API key not found. Set ANTHROPIC_API_KEY.")
        
        try:
            import anthropic
        except ImportError:
            raise ImportError(
                "anthropic package required. Install with: pip install anthropic"
            )
        
        client = anthropic.Anthropic(api_key=api_key)
        
        model_map = {
            "claude-3-opus": "claude-3-opus-20240229",
            "claude-3-sonnet": "claude-3-sonnet-20240229",
        }
        
        response = client.messages.create(
            model=model_map.get(model, model),
            max_tokens=1000,
            messages=[{"role": "user", "content": prompt}],
        )
        
        return response.content[0].text
    
    @classmethod
    def _call_google(cls, prompt: str, model: str) -> str:
        """Call Google Gemini API."""
        api_key = os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("Google API key not found. Set GOOGLE_API_KEY.")
        
        try:
            import google.generativeai as genai
        except ImportError:
            raise ImportError(
                "google-generativeai required. Install with: pip install google-generativeai"
            )
        
        genai.configure(api_key=api_key)
        
        model_map = {
            "gemini-pro": "gemini-pro",
            "gemini-1.5-pro": "gemini-1.5-pro",
        }
        
        model_obj = genai.GenerativeModel(model_map.get(model, "gemini-pro"))
        response = model_obj.generate_content(prompt)
        
        return response.text
    
    @classmethod
    def _call_deepseek(cls, prompt: str, model: str) -> str:
        """Call DeepSeek API."""
        api_key = os.environ.get("DEEPSEEK_API_KEY")
        if not api_key:
            raise ValueError("DeepSeek API key not found. Set DEEPSEEK_API_KEY.")
        
        import requests
        
        response = requests.post(
            "https://api.deepseek.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "deepseek-chat",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.7,
                "max_tokens": 1000,
            },
            timeout=60,
        )
        response.raise_for_status()
        
        return response.json()["choices"][0]["message"]["content"]
    
    @classmethod
    def _parse_response(cls, symbol: str, response: str) -> Analysis:
        """Parse LLM response into Analysis object."""
        # Simple parsing - in production, use structured output
        lines = response.strip().split("\n")
        
        summary = ""
        trend = None
        suggestion = None
        wyckoff = None
        
        current_section = None
        section_content = []
        
        for line in lines:
            line_lower = line.lower()
            
            if "summary" in line_lower or "概要" in line_lower:
                current_section = "summary"
                section_content = []
            elif "trend" in line_lower or "趋势" in line_lower:
                if section_content and current_section == "summary":
                    summary = " ".join(section_content)
                current_section = "trend"
                section_content = []
            elif "suggestion" in line_lower or "建议" in line_lower:
                if section_content and current_section == "trend":
                    trend = " ".join(section_content)
                current_section = "suggestion"
                section_content = []
            elif "wyckoff" in line_lower:
                if section_content and current_section:
                    if current_section == "suggestion":
                        suggestion = " ".join(section_content)
                current_section = "wyckoff"
                section_content = []
            elif line.strip():
                section_content.append(line.strip())
        
        # Handle last section
        if section_content:
            if current_section == "summary":
                summary = " ".join(section_content)
            elif current_section == "trend":
                trend = " ".join(section_content)
            elif current_section == "suggestion":
                suggestion = " ".join(section_content)
            elif current_section == "wyckoff":
                wyckoff = " ".join(section_content)
        
        # If no structured parsing worked, use full response as summary
        if not summary:
            summary = response[:500] + "..." if len(response) > 500 else response
        
        return Analysis(
            symbol=symbol,
            summary=summary,
            trend=trend,
            suggestion=suggestion,
            wyckoff=wyckoff,
            raw_response=response,
            confidence=0.7,  # Placeholder
        )
    
    @classmethod
    def available_models(cls) -> List[str]:
        """List available AI models."""
        return list(cls.SUPPORTED_MODELS.keys())
