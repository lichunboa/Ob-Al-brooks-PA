#!/usr/bin/env python3
"""一次性清理脚本：清理所有品种的重复条件单

币安 Demo Trading 的 FAPI 端点无法查询条件单（STOP_MARKET），
但 DELETE /fapi/v1/allOpenOrders 可以取消包括条件单在内的所有挂单。

用法:
  python3 scripts/cleanup_duplicate_stops.py          # 干跑模式（只显示持仓，不取消）
  python3 scripts/cleanup_duplicate_stops.py --execute # 执行取消（按品种批量取消全部挂单）
"""
import sys
import os
from pathlib import Path
from dotenv import load_dotenv

# 加载 execution-service 的 .env
ENV_FILE = (Path(__file__).parent.parent
            / 'services' / 'execution-service' / 'config' / '.env')
if ENV_FILE.exists():
    load_dotenv(ENV_FILE)

import ccxt  # noqa: E402


def get_exchange():
    """初始化币安 Demo Trading 连接（与 executor.py 一致）"""
    mode = os.getenv("BINANCE_MODE", "demo")

    if mode in ("testnet", "demo"):
        api_key = os.getenv("BINANCE_TESTNET_API_KEY", "")
        secret = os.getenv("BINANCE_TESTNET_SECRET", "")
    else:
        api_key = os.getenv("BINANCE_API_KEY", "")
        secret = os.getenv("BINANCE_SECRET", "")

    exchange = ccxt.binanceusdm({
        'apiKey': api_key,
        'secret': secret,
        'options': {
            'defaultType': 'future',
            'warnOnFetchOpenOrdersWithoutSymbol': False,
        }
    })

    if mode == "demo":
        exchange.enable_demo_trading(True)

    print(f"交易所模式: {mode}")
    if api_key:
        print(f"API Key: {api_key[:8]}...")
    else:
        print("API Key: 未配置")
    return exchange


def main():
    execute = '--execute' in sys.argv
    exchange = get_exchange()

    print("=" * 60)
    label = " (执行模式)" if execute else " (干跑模式)"
    print(f"清理条件委托{label}")
    print("=" * 60)

    # 1. 获取所有活跃持仓品种
    print("\n获取持仓...")
    positions = exchange.fetch_positions()
    active = []
    for p in positions:
        amt = abs(float(p.get('contracts') or 0))
        if amt > 0:
            active.append(p)

    # 从截图看可能涉及的品种（兜底）
    known_symbols = {'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'BTCUSDT'}
    for p in active:
        raw = p.get('symbol', '').replace('/', '').split(':')[0]
        known_symbols.add(raw)

    print(f"活跃持仓: {len(active)} 个")
    for p in active:
        sym = p.get('symbol', '?')
        side = p.get('side', '?')
        amt = p.get('contracts', '?')
        print(f"  {sym} | {side} | 数量={amt}")

    print(f"\n待清理品种: {sorted(known_symbols)}")
    print("注: Demo 模式下 FAPI 无法查询条件单数量，直接按品种全量取消")

    if not execute:
        print("\n这是干跑模式。加 --execute 参数来执行取消。")
        return

    # 2. 执行取消：DELETE /fapi/v1/allOpenOrders（按品种）
    print("\n开始取消...")
    success = 0
    failed = 0

    for sym in sorted(known_symbols):
        try:
            result = exchange.fapiprivate_delete_allopenorders(
                {'symbol': sym})
            code = result.get('code', '?')
            msg = result.get('msg', '?')
            print(f"  {sym}: code={code} msg={msg}")
            success += 1
        except Exception as e:
            print(f"  {sym}: 失败 - {e}")
            failed += 1

    print(f"\n完成: {success} 个品种清理成功，{failed} 个失败")
    print("请到币安 UI 刷新确认条件委托已清零")


if __name__ == '__main__':
    main()
