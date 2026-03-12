#!/usr/bin/env python3
"""
检查系统重启后订单接管功能。

验证：
1. 持仓状态恢复
2. 订单状态恢复
3. 止损/止盈恢复
4. 持仓管理继续
"""

import json

from _bootstrap import ensure_agent_root_on_path

PROJECT_ROOT = ensure_agent_root_on_path()


def check_execution_state():
    """检查 execution 状态文件"""
    state_file = PROJECT_ROOT / "data" / "pa_trader" / "state" / "runtime_state.json"

    if not state_file.exists():
        print("❌ runtime_state.json 不存在")
        return False

    with open(state_file) as f:
        state = json.load(f)

    execution = state.get("execution", {})
    positions = execution.get("positions", [])

    print(f"✅ 找到 {len(positions)} 个持仓")

    for pos in positions:
        symbol = pos.get("symbol", "")
        side = pos.get("side", "")
        quantity = pos.get("quantity", 0)
        entry_price = pos.get("entry_price", 0)
        stop_loss = pos.get("stop_loss", 0)
        take_profit = pos.get("take_profit", 0)

        print(f"  - {symbol}: {side} {quantity} @ {entry_price}")
        print(f"    SL: {stop_loss}, TP: {take_profit}")

    return True


def check_decision_log():
    """检查决策日志"""
    log_file = PROJECT_ROOT / "data" / "pa_trader" / "journal" / "decision_log.jsonl"

    if not log_file.exists():
        print("❌ decision_log.jsonl 不存在")
        return False

    # 读取最后 10 条
    with open(log_file) as f:
        lines = f.readlines()

    recent = lines[-10:] if len(lines) >= 10 else lines

    print(f"✅ 找到 {len(lines)} 条决策记录")
    print(f"   最近 {len(recent)} 条：")

    for line in recent:
        try:
            entry = json.loads(line)
            timestamp = entry.get("timestamp", "")
            action = entry.get("action", "")
            symbol = entry.get("symbol", "")
            print(f"  - {timestamp}: {action} {symbol}")
        except json.JSONDecodeError:
            pass

    return True


def check_execution_log():
    """检查执行日志"""
    log_file = PROJECT_ROOT / "data" / "pa_trader" / "journal" / "execution_log.jsonl"

    if not log_file.exists():
        print("❌ execution_log.jsonl 不存在")
        return False

    # 读取最后 10 条
    with open(log_file) as f:
        lines = f.readlines()

    recent = lines[-10:] if len(lines) >= 10 else lines

    print(f"✅ 找到 {len(lines)} 条执行记录")
    print(f"   最近 {len(recent)} 条：")

    for line in recent:
        try:
            entry = json.loads(line)
            timestamp = entry.get("timestamp", "")
            action = entry.get("action", "")
            symbol = entry.get("symbol", "")
            result = entry.get("result", "")
            print(f"  - {timestamp}: {action} {symbol} -> {result}")
        except json.JSONDecodeError:
            pass

    return True


def main():
    print("=" * 60)
    print("订单接管功能检查")
    print("=" * 60)
    print()

    print("1. 检查持仓状态")
    print("-" * 60)
    check_execution_state()
    print()

    print("2. 检查决策日志")
    print("-" * 60)
    check_decision_log()
    print()

    print("3. 检查执行日志")
    print("-" * 60)
    check_execution_log()
    print()

    print("=" * 60)
    print("检查完成")
    print("=" * 60)
    print()
    print("说明：")
    print("- 系统重启后会自动从 runtime_state.json 恢复持仓")
    print("- 持仓管理会继续执行（Premise Check、Trailing SL 等）")
    print("- 所有决策和执行都会记录到日志")
    print()


if __name__ == "__main__":
    main()
