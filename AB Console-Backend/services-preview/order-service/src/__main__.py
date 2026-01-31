"""
入口: python -m src

用法:
    cd services-preview/order-service
    python -m src                           # 使用环境变量配置
    python -m src --config config/default.json  # 使用配置文件
"""
import sys
from pathlib import Path

# 添加 market-maker 目录到路径
SRC_DIR = Path(__file__).parent
MARKET_MAKER_DIR = SRC_DIR / "market-maker"
if str(MARKET_MAKER_DIR) not in sys.path:
    sys.path.insert(0, str(MARKET_MAKER_DIR))

# 导入并运行 main
from main import main

if __name__ == "__main__":
    main()
