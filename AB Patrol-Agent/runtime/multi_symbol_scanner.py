"""
多品种并行扫描模块

支持同时扫描多个品种，提高效率。

特性：
- 并行扫描多个品种
- 支持不同交易所
- 统一的信号输出
- 优先级排序
"""

from __future__ import annotations

import concurrent.futures
import time
from typing import Any

try:
    from .utils import safe_float
except ImportError:
    from utils import safe_float


def scan_multiple_symbols(
    symbols: list[str],
    exchange: str = "binance",
    timeframe: str = "5m",
    max_workers: int = 5,
) -> list[dict[str, Any]]:
    """
    并行扫描多个品种
    
    Args:
        symbols: 品种列表
        exchange: 交易所
        timeframe: 时间周期
        max_workers: 最大并行数
    
    Returns:
        信号列表，按优先级排序
    """
    signals = []
    
    # 使用线程池并行扫描
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        # 提交所有扫描任务
        future_to_symbol = {
            executor.submit(scan_single_symbol, symbol, exchange, timeframe): symbol
            for symbol in symbols
        }
        
        # 收集结果
        for future in concurrent.futures.as_completed(future_to_symbol):
            symbol = future_to_symbol[future]
            try:
                result = future.result(timeout=30)
                if result and result.get("signal"):
                    signals.append(result)
            except Exception as e:
                print(f"扫描 {symbol} 失败: {e}")
    
    # 按优先级排序
    signals.sort(key=lambda x: x.get("priority", 0), reverse=True)
    
    return signals


def scan_single_symbol(
    symbol: str,
    exchange: str,
    timeframe: str,
) -> dict[str, Any] | None:
    """
    扫描单个品种

    Args:
        symbol: 品种
        exchange: 交易所
        timeframe: 时间周期

    Returns:
        信号信息，如果没有信号返回 None
    """
    try:
        # 注意：这个函数需要在 pa_runtime.py 中集成使用
        # 独立测试时返回模拟数据
        return None

    except Exception as e:
        return None


def calculate_priority(signal: dict[str, Any]) -> float:
    """
    计算信号优先级
    
    优先级因素：
    1. 信号强度（40%）
    2. 市场状态（30%）
    3. 多周期对齐（20%）
    4. 风险回报比（10%）
    
    Returns:
        优先级分数（0-100）
    """
    priority = 0.0
    
    # 1. 信号强度（40%）
    signal_strength = safe_float(signal.get("signal_strength"), 0)
    priority += signal_strength * 0.4
    
    # 2. 市场状态（30%）
    market_state = signal.get("market_state", "")
    if market_state == "BO":
        priority += 30  # 突破最优先
    elif market_state == "TC":
        priority += 25  # 趋势次之
    elif market_state == "TR":
        priority += 15  # 震荡最低
    
    # 3. 多周期对齐（20%）
    multi_tf_align = signal.get("multi_tf_align", False)
    if multi_tf_align:
        priority += 20
    
    # 4. 风险回报比（10%）
    risk_reward = safe_float(signal.get("risk_reward"), 0)
    if risk_reward >= 3:
        priority += 10
    elif risk_reward >= 2:
        priority += 7
    elif risk_reward >= 1.5:
        priority += 5
    
    return min(priority, 100)


def filter_signals(
    signals: list[dict[str, Any]],
    min_priority: float = 50.0,
    max_signals: int = 5,
) -> list[dict[str, Any]]:
    """
    过滤信号
    
    Args:
        signals: 信号列表
        min_priority: 最低优先级
        max_signals: 最大信号数
    
    Returns:
        过滤后的信号列表
    """
    # 过滤低优先级
    filtered = [s for s in signals if s.get("priority", 0) >= min_priority]
    
    # 限制数量
    return filtered[:max_signals]


def get_default_symbols(exchange: str) -> list[str]:
    """
    获取默认扫描品种列表
    
    Args:
        exchange: 交易所
    
    Returns:
        品种列表
    """
    if exchange == "binance":
        return [
            "BTCUSDT",
            "SOLUSDT",
        ]
    elif exchange == "okx":
        return [
            "BTC-USDT-SWAP",
            "ETH-USDT-SWAP",
            "BNB-USDT-SWAP",
            "SOL-USDT-SWAP",
            "XRP-USDT-SWAP",
        ]
    elif exchange == "ctrader":
        return [
            "EURUSD",
            "GBPUSD",
            "USDJPY",
            "AUDUSD",
            "USDCAD",
            "XAUUSD",
            "US 30",
            "US TECH 100",
        ]
    else:
        return []


def scan_all_markets(
    exchanges: list[str] | None = None,
    timeframe: str = "5m",
    max_workers: int = 10,
) -> dict[str, list[dict[str, Any]]]:
    """
    扫描所有市场
    
    Args:
        exchanges: 交易所列表，None 表示所有
        timeframe: 时间周期
        max_workers: 最大并行数
    
    Returns:
        {exchange: [signals]}
    """
    if exchanges is None:
        exchanges = ["binance", "okx", "ctrader"]
    
    results = {}
    
    for exchange in exchanges:
        symbols = get_default_symbols(exchange)
        if not symbols:
            continue
        
        print(f"扫描 {exchange} 的 {len(symbols)} 个品种...")
        signals = scan_multiple_symbols(
            symbols=symbols,
            exchange=exchange,
            timeframe=timeframe,
            max_workers=max_workers,
        )
        
        # 过滤信号
        filtered = filter_signals(signals, min_priority=50.0, max_signals=5)
        
        if filtered:
            results[exchange] = filtered
            print(f"  发现 {len(filtered)} 个高优先级信号")
        else:
            print(f"  无高优先级信号")
    
    return results


def format_scan_results(results: dict[str, list[dict[str, Any]]]) -> str:
    """
    格式化扫描结果
    
    Args:
        results: 扫描结果
    
    Returns:
        格式化的字符串
    """
    lines = []
    lines.append("=" * 60)
    lines.append("多品种扫描结果")
    lines.append("=" * 60)
    
    total_signals = sum(len(signals) for signals in results.values())
    lines.append(f"总信号数: {total_signals}")
    lines.append("")
    
    for exchange, signals in results.items():
        lines.append(f"【{exchange.upper()}】")
        lines.append("-" * 60)
        
        for i, signal in enumerate(signals, 1):
            symbol = signal.get("symbol", "")
            side = signal.get("side", "")
            priority = signal.get("priority", 0)
            market_state = signal.get("market_state", "")
            playbook = signal.get("playbook", "")
            
            lines.append(f"{i}. {symbol} - {side}")
            lines.append(f"   优先级: {priority:.1f}")
            lines.append(f"   市场状态: {market_state}")
            lines.append(f"   策略: {playbook}")
            lines.append("")
    
    lines.append("=" * 60)
    
    return "\n".join(lines)


# 示例用法
if __name__ == "__main__":
    # 扫描所有市场
    results = scan_all_markets(
        exchanges=["binance"],
        timeframe="5m",
        max_workers=10,
    )
    
    # 打印结果
    print(format_scan_results(results))
