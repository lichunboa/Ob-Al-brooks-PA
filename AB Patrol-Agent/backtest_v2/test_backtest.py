"""
测试脚本 - 运行 Brooks 回测

使用示例数据测试系统
"""

import sys
from pathlib import Path

# 添加路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from backtest_v2.engine import BrooksBacktestEngine
from backtest_v2.strategies.h2_l2 import H2L2Strategy
from backtest_v2.models import Candle
from datetime import datetime, timedelta
import random


def generate_sample_data(num_candles: int = 1000) -> list[Candle]:
    """
    生成示例K线数据（模拟趋势）

    这只是测试用，真实回测需要从数据库加载
    """
    candles = []
    base_price = 50000.0
    timestamp = datetime(2024, 1, 1)

    for i in range(num_candles):
        # 模拟趋势
        if i < 300:
            # 上升趋势
            trend = 1.0
        elif i < 600:
            # 区间震荡
            trend = 0.0
        else:
            # 下降趋势
            trend = -1.0

        # 生成K线
        open_price = base_price
        close_price = base_price + random.uniform(-50, 100) + trend * 20
        high_price = max(open_price, close_price) + random.uniform(0, 30)
        low_price = min(open_price, close_price) - random.uniform(0, 30)

        candle = Candle(
            timestamp=timestamp,
            open=open_price,
            high=high_price,
            low=low_price,
            close=close_price,
            volume=random.uniform(100, 1000)
        )

        candles.append(candle)

        base_price = close_price
        timestamp += timedelta(minutes=5)

    return candles


def main():
    """主函数"""
    print("Al Brooks 回测系统 V2.0")
    print("100% 遵循 Brooks 哲学\n")

    # 1. 生成示例数据
    print("生成示例数据...")
    candles = generate_sample_data(1000)
    print(f"生成了 {len(candles)} 根K线\n")

    # 2. 创建引擎
    engine = BrooksBacktestEngine()

    # 3. 添加策略
    engine.add_strategy(H2L2Strategy())

    # 4. 运行回测
    result = engine.run(
        candles=candles,
        symbol="BTCUSDT",
        timeframe="5m"
    )

    # 5. 输出结果
    if result:
        print("\n回测完成！")
        print(f"最终资金: ${engine.current_capital:.2f}")
        print(f"收益率: {(engine.current_capital/engine.initial_capital - 1)*100:.2f}%")


if __name__ == "__main__":
    main()
