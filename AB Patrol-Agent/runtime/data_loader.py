"""
数据加载器

从各种数据源加载历史 K 线数据用于回测。
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import requests


class DataLoader:
    """数据加载器"""
    
    def __init__(self, cache_dir: str = "data/cache"):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
    
    def load_binance_klines(
        self,
        symbol: str,
        interval: str = "5m",
        days: int = 7,
        use_cache: bool = True,
    ) -> list[dict[str, Any]]:
        """
        从 Binance 加载 K 线数据
        
        Args:
            symbol: 交易对，如 BTCUSDT
            interval: 时间周期，如 5m, 15m, 1h
            days: 天数
            use_cache: 是否使用缓存
        
        Returns:
            K 线列表，格式：[{time, O, H, L, C, V}, ...]
        """
        # 检查缓存
        cache_file = self.cache_dir / f"{symbol}_{interval}_{days}d.json"
        if use_cache and cache_file.exists():
            # 检查缓存是否过期（1 小时）
            cache_age = time.time() - cache_file.stat().st_mtime
            if cache_age < 3600:
                print(f"  使用缓存: {cache_file}")
                with open(cache_file) as f:
                    return json.load(f)
        
        # 从 Binance 下载
        print(f"  从 Binance 下载 {symbol} {interval} 数据...")
        
        end_time = int(time.time() * 1000)
        start_time = end_time - (days * 24 * 60 * 60 * 1000)
        
        all_klines = []
        current_start = start_time
        
        while current_start < end_time:
            url = "https://fapi.binance.com/fapi/v1/klines"
            params = {
                "symbol": symbol,
                "interval": interval,
                "startTime": current_start,
                "endTime": end_time,
                "limit": 1500,  # Binance 最大限制
            }
            
            try:
                response = requests.get(url, params=params, timeout=10)
                response.raise_for_status()
                klines = response.json()
                
                if not klines:
                    break
                
                # 转换格式
                for k in klines:
                    all_klines.append({
                        "time": datetime.fromtimestamp(k[0] / 1000).isoformat() + "Z",
                        "O": float(k[1]),
                        "H": float(k[2]),
                        "L": float(k[3]),
                        "C": float(k[4]),
                        "V": float(k[5]),
                    })
                
                # 更新起始时间
                current_start = klines[-1][0] + 1
                
                # 避免请求过快
                time.sleep(0.2)
                
            except Exception as e:
                print(f"  ❌ 下载失败: {e}")
                break
        
        print(f"  ✅ 下载了 {len(all_klines)} 根 K 线")
        
        # 保存缓存
        if all_klines:
            with open(cache_file, "w") as f:
                json.dump(all_klines, f, indent=2)
            print(f"  缓存已保存: {cache_file}")
        
        return all_klines
    
    def load_from_file(self, file_path: str) -> list[dict[str, Any]]:
        """
        从文件加载 K 线数据
        
        支持格式：
        - JSON: [{time, O, H, L, C, V}, ...]
        - CSV: time,open,high,low,close,volume
        """
        file_path = Path(file_path)
        
        if not file_path.exists():
            raise FileNotFoundError(f"文件不存在: {file_path}")
        
        if file_path.suffix == ".json":
            with open(file_path) as f:
                return json.load(f)
        
        elif file_path.suffix == ".csv":
            # TODO: 实现 CSV 加载
            raise NotImplementedError("CSV 加载尚未实现")
        
        else:
            raise ValueError(f"不支持的文件格式: {file_path.suffix}")
    
    def load_multi_timeframe(
        self,
        symbol: str,
        timeframes: list[str],
        days: int = 7,
    ) -> dict[str, list[dict[str, Any]]]:
        """
        加载多个时间周期的数据
        
        Args:
            symbol: 交易对
            timeframes: 时间周期列表，如 ["5m", "15m", "1h"]
            days: 天数
        
        Returns:
            {timeframe: klines}
        """
        result = {}
        for tf in timeframes:
            klines = self.load_binance_klines(symbol, tf, days)
            result[tf] = klines
        return result


def calculate_indicators(bars: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    计算技术指标
    
    添加 EMA20, ATR14 等指标到 K 线数据
    """
    if len(bars) < 20:
        return bars
    
    # 计算 EMA20
    closes = [b["C"] for b in bars]
    ema20 = []
    
    # 初始 SMA
    sma = sum(closes[:20]) / 20
    ema20.append(sma)
    
    # EMA
    multiplier = 2 / (20 + 1)
    for i in range(20, len(closes)):
        ema = (closes[i] - ema20[-1]) * multiplier + ema20[-1]
        ema20.append(ema)
    
    # 计算 ATR14
    atr14 = []
    for i in range(1, len(bars)):
        high = bars[i]["H"]
        low = bars[i]["L"]
        prev_close = bars[i-1]["C"]
        
        tr = max(
            high - low,
            abs(high - prev_close),
            abs(low - prev_close),
        )
        
        if len(atr14) < 14:
            atr14.append(tr)
        else:
            atr = (atr14[-1] * 13 + tr) / 14
            atr14.append(atr)
    
    # 添加指标到 K 线
    result = []
    for i, bar in enumerate(bars):
        new_bar = bar.copy()
        
        if i >= 20:
            new_bar["ema20"] = ema20[i - 20]
        else:
            new_bar["ema20"] = 0.0
        
        if i > 0 and i - 1 < len(atr14):
            new_bar["atr14"] = atr14[i - 1]
        else:
            new_bar["atr14"] = 0.0
        
        result.append(new_bar)
    
    return result
