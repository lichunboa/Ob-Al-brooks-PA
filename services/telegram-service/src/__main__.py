"""
入口: python -m src

用法:
    cd services/telegram-service
    python -m src
"""
import sys
from pathlib import Path

# 确保 src 目录在路径中
SRC_DIR = Path(__file__).parent
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from bot.app import main

if __name__ == "__main__":
    main()
