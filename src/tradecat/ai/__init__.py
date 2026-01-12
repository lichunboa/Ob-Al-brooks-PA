"""AI analysis module.

Provides AI-powered market analysis using various LLM providers.

Examples:
    >>> from tradecat import AI, Config
    >>> 
    >>> # Configure API key (or set OPENAI_API_KEY env var)
    >>> # Config.set_ai_key("sk-...")
    >>> 
    >>> # Analyze a symbol
    >>> analysis = AI.analyze("BTCUSDT")
    >>> print(analysis.summary)
    >>> 
    >>> # Use specific model
    >>> analysis = AI.analyze("BTCUSDT", model="gpt-4")
"""

from tradecat.ai.analyzer import AI

__all__ = ["AI"]
