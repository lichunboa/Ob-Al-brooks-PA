import yfinance as yf
import pandas as pd
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

class StockCollector:
    def process_symbol(self, yf_symbol: str):
        """
        Fetch data from YF and parse it
        """
        try:
            # Fetch 1m data for last 1 day (covers active trading session)
            # period="1d" for rapid updates.
            # Using progress=False to avoid cluttering logs
            df = yf.download(yf_symbol, period="1d", interval="1m", progress=False)
            
            if df.empty:
                return []
            
            logger.info(f"DEBUG: {yf_symbol} Columns: {df.columns}")
            if hasattr(df.columns, 'nlevels') and df.columns.nlevels > 1:
                # Flatten multi-index
                 df.columns = df.columns.droplevel(1)

            candles = []
            
            # Reset index to access Datetime
            df = df.reset_index()
            logger.info(f"DEBUG: {yf_symbol} Reset Columns: {df.columns}")
            
            for _, row in df.iterrows():
                # YF columns: Datetime, Open, High, Low, Close, Adj Close, Volume
                # Convert timestamp to UTC
                ts = row['Datetime']
                if ts.tzinfo is None:
                    # Assume UTC if not set, but YF usually sets it
                    ts = ts.replace(tzinfo=timezone.utc)
                else:
                    ts = ts.astimezone(timezone.utc)

                # Ensure values are float
                try:
                    open_price = float(row['Open'].iloc[0] if isinstance(row['Open'], pd.Series) else row['Open'])
                    high = float(row['High'].iloc[0] if isinstance(row['High'], pd.Series) else row['High'])
                    low = float(row['Low'].iloc[0] if isinstance(row['Low'], pd.Series) else row['Low'])
                    close = float(row['Close'].iloc[0] if isinstance(row['Close'], pd.Series) else row['Close'])
                    volume = float(row['Volume'].iloc[0] if isinstance(row['Volume'], pd.Series) else row['Volume'])
                except Exception:
                     # Handle single value series or scalar
                    open_price = float(row['Open'])
                    high = float(row['High'])
                    low = float(row['Low'])
                    close = float(row['Close'])
                    volume = float(row['Volume'])


                candles.append({
                    'symbol': yf_symbol,
                    'open_time': ts,
                    'open': open_price,
                    'high': high,
                    'low': low,
                    'close': close,
                    'volume': volume
                })
            
            if candles:
                latest = candles[-1]
                logger.info(f"Fetched {len(candles)} candles for {yf_symbol}. Latest: {latest['open_time']} price={latest['close']}")
            
            return candles

        except Exception as e:
            logger.error(f"Error fetching {yf_symbol}: {e}")
            return []

collector = StockCollector()
