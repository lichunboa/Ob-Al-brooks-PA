"""
市场扫描模块

提供市场扫描相关功能：
- 品种优先级排序
- 扫描状态管理
- 品种过滤
"""

from __future__ import annotations

from typing import Any

from utils import safe_float, parse_dt, utc_now


# ============================================================
# 优先级计算
# ============================================================

def calculate_priority_score(symbol_state: dict[str, Any]) -> tuple[int, float, str]:
    """
    计算品种的优先级分数
    
    Returns:
        (priority_level, priority_score, priority_note)
        
    优先级：
    - 0: 持仓中（最高优先级）
    - 1: entry_ready（准备入场）
    - 2: pre_signal（预信号）
    - 3: watching（观察中）
    """
    status = str(symbol_state.get("status") or "watching").strip().lower()
    stage = str(symbol_state.get("stage") or "").strip().upper()
    
    # 持仓中 - 最高优先级
    if status in {"in_trade", "manage"}:
        return (0, 1000.0, "持仓中")
    
    # entry_ready - 准备入场
    if status in {"entry_ready", "entry_ready_blocked"}:
        score = 900.0
        if status == "entry_ready":
            score += 10.0
        return (1, score, "准备入场")
    
    # pre_signal - 预信号
    if status == "pre_signal":
        score = 800.0
        # 根据 stage 调整分数
        if stage.startswith("EXECUTABLE_"):
            score += 50.0
        elif stage.startswith("CANDIDATE_"):
            score += 30.0
        return (2, score, "预信号")
    
    # watching - 观察中
    score = 100.0
    consecutive_watching = safe_float(symbol_state.get("consecutive_watching"), 0)
    if consecutive_watching > 0:
        score -= min(consecutive_watching * 5, 50)  # 最多减 50 分
    
    return (3, score, "观察中")


def sort_symbols_by_priority(symbols: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    按优先级排序品种
    
    排序规则：
    1. priority_level 升序（0 最高）
    2. priority_score 降序
    3. symbol 字母序
    """
    def sort_key(item: dict[str, Any]) -> tuple[int, float, str]:
        priority = item.get("priority", 3)
        score = safe_float(item.get("priority_score"), 0)
        symbol = str(item.get("symbol") or "")
        return (priority, -score, symbol)
    
    return sorted(symbols, key=sort_key)


# ============================================================
# 扫描状态管理
# ============================================================

def should_scan_symbol(
    symbol_state: dict[str, Any],
    last_scan_time: str | None,
    scan_interval_seconds: int = 120,
) -> tuple[bool, str]:
    """
    判断是否应该扫描该品种
    
    Returns:
        (should_scan, reason)
    """
    status = str(symbol_state.get("status") or "watching").strip().lower()
    
    # 持仓中 - 总是扫描
    if status in {"in_trade", "manage"}:
        return (True, "持仓中，需要管理")
    
    # entry_ready - 总是扫描
    if status in {"entry_ready", "entry_ready_blocked"}:
        return (True, "准备入场，需要监控")
    
    # 检查扫描间隔
    if last_scan_time:
        last_scan = parse_dt(last_scan_time)
        if last_scan:
            elapsed = (utc_now() - last_scan).total_seconds()
            if elapsed < scan_interval_seconds:
                return (False, f"距离上次扫描仅 {int(elapsed)} 秒")
    
    # pre_signal - 扫描
    if status == "pre_signal":
        return (True, "预信号，需要监控")
    
    # watching - 扫描
    return (True, "观察中")


def filter_scannable_symbols(
    symbols: list[dict[str, Any]],
    scan_interval_seconds: int = 120,
) -> list[dict[str, Any]]:
    """
    过滤出需要扫描的品种
    """
    scannable = []
    for symbol_state in symbols:
        last_scan = symbol_state.get("last_scan_time")
        should_scan, reason = should_scan_symbol(symbol_state, last_scan, scan_interval_seconds)
        if should_scan:
            scannable.append(symbol_state)
    return scannable


# ============================================================
# 品种状态更新
# ============================================================

def update_symbol_priority(symbol_state: dict[str, Any]) -> dict[str, Any]:
    """
    更新品种的优先级信息
    
    Returns:
        更新后的 symbol_state（会修改原对象）
    """
    priority, score, note = calculate_priority_score(symbol_state)
    symbol_state["priority"] = priority
    symbol_state["priority_score"] = score
    symbol_state["priority_note"] = note
    return symbol_state


def increment_consecutive_watching(symbol_state: dict[str, Any]) -> dict[str, Any]:
    """
    增加连续观察计数
    
    只在 status=watching 时增加
    """
    status = str(symbol_state.get("status") or "watching").strip().lower()
    if status == "watching":
        current = safe_float(symbol_state.get("consecutive_watching"), 0)
        symbol_state["consecutive_watching"] = int(current) + 1
    else:
        symbol_state["consecutive_watching"] = 0
    return symbol_state


def reset_consecutive_watching(symbol_state: dict[str, Any]) -> dict[str, Any]:
    """
    重置连续观察计数
    """
    symbol_state["consecutive_watching"] = 0
    return symbol_state


# ============================================================
# 品种过滤
# ============================================================

def filter_active_symbols(symbols: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    过滤出活跃的品种（有持仓或有信号）
    """
    active = []
    for symbol_state in symbols:
        status = str(symbol_state.get("status") or "watching").strip().lower()
        if status in {"in_trade", "manage", "entry_ready", "entry_ready_blocked", "pre_signal"}:
            active.append(symbol_state)
    return active


def filter_in_trade_symbols(symbols: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    过滤出持仓中的品种
    """
    in_trade = []
    for symbol_state in symbols:
        status = str(symbol_state.get("status") or "watching").strip().lower()
        if status in {"in_trade", "manage"}:
            in_trade.append(symbol_state)
    return in_trade


def filter_entry_ready_symbols(symbols: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    过滤出准备入场的品种
    """
    entry_ready = []
    for symbol_state in symbols:
        status = str(symbol_state.get("status") or "watching").strip().lower()
        if status in {"entry_ready", "entry_ready_blocked"}:
            entry_ready.append(symbol_state)
    return entry_ready


# ============================================================
# 扫描统计
# ============================================================

def calculate_scan_stats(symbols: list[dict[str, Any]]) -> dict[str, Any]:
    """
    计算扫描统计信息
    """
    total = len(symbols)
    in_trade = len(filter_in_trade_symbols(symbols))
    entry_ready = len(filter_entry_ready_symbols(symbols))
    pre_signal = len([s for s in symbols if str(s.get("status") or "").lower() == "pre_signal"])
    watching = len([s for s in symbols if str(s.get("status") or "").lower() == "watching"])
    cooldown = len([s for s in symbols if str(s.get("status") or "").lower() == "cooldown"])
    
    return {
        "total": total,
        "in_trade": in_trade,
        "entry_ready": entry_ready,
        "pre_signal": pre_signal,
        "watching": watching,
        "cooldown": cooldown,
        "active": in_trade + entry_ready + pre_signal,
    }


def format_scan_stats(stats: dict[str, Any]) -> str:
    """
    格式化扫描统计信息为文本
    """
    return (
        f"总计 {stats.get('total', 0)} 品种 | "
        f"持仓 {stats.get('in_trade', 0)} | "
        f"准备入场 {stats.get('entry_ready', 0)} | "
        f"预信号 {stats.get('pre_signal', 0)} | "
        f"观察 {stats.get('watching', 0)} | "
        f"冷却 {stats.get('cooldown', 0)}"
    )
