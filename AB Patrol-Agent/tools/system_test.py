#!/usr/bin/env python3
"""
系统全面测试脚本

测试：
1. LLM 触发管理器
2. 交易所适配器
3. 多品种扫描
4. S7 持仓管理
5. 回测引擎
"""

import sys
from pathlib import Path

# 添加 runtime 到路径
sys.path.insert(0, str(Path(__file__).parent.parent / "runtime"))


def test_llm_trigger_manager():
    """测试 LLM 触发管理器"""
    print("=" * 60)
    print("测试 1: LLM 触发管理器")
    print("=" * 60)
    
    try:
        from llm_trigger_manager import LLMTriggerManager
        
        manager = LLMTriggerManager()
        
        # 测试触发判断
        should_trigger, reason = manager.should_trigger_llm(
            phase="scan",
            execution={"positions": []},
            market_cache={},
            runtime={},
        )
        
        print(f"✅ LLM 触发管理器正常")
        print(f"   触发判断: {should_trigger}")
        print(f"   原因: {reason}")
        
        # 测试统计
        stats = manager.get_statistics()
        print(f"   统计: LLM={stats['llm_calls']}, 规则={stats['rule_engine_calls']}")
        
        return True
    except Exception as e:
        print(f"❌ LLM 触发管理器失败: {e}")
        return False


def test_exchange_adapters():
    """测试交易所适配器"""
    print("\n" + "=" * 60)
    print("测试 2: 交易所适配器")
    print("=" * 60)
    
    try:
        from adapters.binance_adapter import BinanceAdapter
        from adapters.okx_adapter import OKXAdapter
        from adapters.ctrader_adapter import CTraderAdapter
        
        # 测试 Binance
        binance = BinanceAdapter({"testnet": True})
        print(f"✅ Binance 适配器初始化成功")
        print(f"   品种转换: BTCUSDT -> {binance.normalize_symbol('BTCUSDT')}")
        
        # 测试 OKX
        okx = OKXAdapter({"api_key": "", "api_secret": "", "passphrase": ""})
        print(f"✅ OKX 适配器初始化成功")
        print(f"   品种转换: BTCUSDT -> {okx.normalize_symbol('BTCUSDT')}")
        
        # 测试 cTrader
        ctrader = CTraderAdapter({
            "client_id": "",
            "client_secret": "",
            "access_token": "",
            "account_id": "",
        })
        print(f"✅ cTrader 适配器初始化成功")
        print(f"   品种转换: EURUSD -> {ctrader.normalize_symbol('EURUSD')}")
        print(f"   Lots 转换: 100000 units -> {ctrader.quantity_to_lots('EURUSD', 100000)} lots")
        
        return True
    except Exception as e:
        print(f"❌ 交易所适配器失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_multi_symbol_scanner():
    """测试多品种扫描"""
    print("\n" + "=" * 60)
    print("测试 3: 多品种扫描")
    print("=" * 60)
    
    try:
        from multi_symbol_scanner import (
            calculate_priority,
            filter_signals,
        )

        # 测试优先级计算
        signal = {
            "signal_strength": 80,
            "market_state": "BO",
            "multi_tf_align": True,
            "risk_reward": 3.0,
        }
        priority = calculate_priority(signal)
        print(f"✅ 优先级计算正常")
        print(f"   信号优先级: {priority:.1f}")

        # 测试信号过滤
        signals = [
            {"priority": 85, "symbol": "BTCUSDT"},
            {"priority": 70, "symbol": "ETHUSDT"},
            {"priority": 45, "symbol": "BNBUSDT"},
        ]
        filtered = filter_signals(signals, min_priority=50, max_signals=5)
        print(f"✅ 信号过滤正常")
        print(f"   过滤后: {len(filtered)} 个信号")

        # 测试品种配置
        import json
        symbols_file = Path(__file__).parent.parent / "config" / "symbols.json"
        if symbols_file.exists():
            with open(symbols_file) as f:
                symbols_config = json.load(f)
            print(f"✅ 品种配置文件正常")
            print(f"   Binance: {len(symbols_config.get('binance', {}).get('crypto', []))} 个")
            print(f"   OKX: {len(symbols_config.get('okx', {}).get('crypto_swap', []))} 个")
            print(f"   cTrader: {len(symbols_config.get('ctrader', {}).get('forex', []))} 个外汇")

        return True
    except Exception as e:
        print(f"❌ 多品种扫描失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_position_manager():
    """测试 S7 持仓管理"""
    print("\n" + "=" * 60)
    print("测试 4: S7 持仓管理")
    print("=" * 60)
    
    try:
        from position_manager import (
            premise_check,
            strength_check,
            calculate_trailing_sl,
            calculate_partial_close,
        )
        
        # 测试数据
        position = {
            "symbol": "BTCUSDT",
            "side": "BUY",
            "entry_price": 50000,
            "stop_loss": 49500,
            "take_profit": 51000,
            "quantity": 0.1,
            "entry_time": "2026-03-10T00:00:00",
            "style": "Swing",
        }
        
        market_data = {
            "current_price": 50500,
            "ai_direction": "long",
            "ab_state": {"state": "TC"},
            "ab_sr": {"major_hl": 50200, "major_lh": 49800},
            "ab_ema": {"ema20": 50100},
            "ab_patterns": {"patterns": []},
            "recent_bars": [],
            "account_info": {"margin_ratio": 200, "equity": 10000, "used_margin": 1000},
        }
        
        # 测试 Premise Check
        premise = premise_check(position, market_data)
        print(f"✅ Premise Check 正常")
        print(f"   有效: {premise['valid']}")
        print(f"   动作: {premise['action']}")
        
        # 测试 Strength Check
        strength = strength_check(position, market_data)
        print(f"✅ Strength Check 正常")
        print(f"   强度分数: {strength['strength_score']}/7")
        print(f"   信心等级: {strength['confidence']}")
        
        # 测试 Trailing SL
        trailing = calculate_trailing_sl(position, market_data)
        print(f"✅ Trailing SL 正常")
        print(f"   是否移动: {trailing['should_trail']}")
        print(f"   原因: {trailing['reason']}")
        
        # 测试分批止盈
        partial = calculate_partial_close(position, market_data)
        print(f"✅ 分批止盈正常")
        print(f"   是否平仓: {partial['should_close']}")
        print(f"   平仓比例: {partial['close_ratio']}")
        
        return True
    except Exception as e:
        print(f"❌ S7 持仓管理失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_backtest_engine():
    """测试回测引擎"""
    print("\n" + "=" * 60)
    print("测试 5: 回测引擎")
    print("=" * 60)
    
    try:
        from backtest_engine import BacktestEngine

        engine = BacktestEngine(
            initial_balance=10000,
            risk_pct=0.3,
        )

        print(f"✅ 回测引擎初始化成功")
        print(f"   初始余额: {engine.state.balance}")
        print(f"   风险比例: {engine.risk_pct}")

        return True
    except Exception as e:
        print(f"❌ 回测引擎失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    print("\n" + "=" * 60)
    print("系统全面测试")
    print("=" * 60)
    print()
    
    results = []
    
    # 运行所有测试
    results.append(("LLM 触发管理器", test_llm_trigger_manager()))
    results.append(("交易所适配器", test_exchange_adapters()))
    results.append(("多品种扫描", test_multi_symbol_scanner()))
    results.append(("S7 持仓管理", test_position_manager()))
    results.append(("回测引擎", test_backtest_engine()))
    
    # 汇总结果
    print("\n" + "=" * 60)
    print("测试结果汇总")
    print("=" * 60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ 通过" if result else "❌ 失败"
        print(f"{status} - {name}")
    
    print()
    print(f"总计: {passed}/{total} 通过")
    
    if passed == total:
        print("\n🎉 所有测试通过！系统运行正常！")
        return 0
    else:
        print(f"\n⚠️  {total - passed} 个测试失败，请检查！")
        return 1


if __name__ == "__main__":
    sys.exit(main())
