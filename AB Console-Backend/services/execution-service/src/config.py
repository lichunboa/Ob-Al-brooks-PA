"""
配置管理
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# 加载 .env 文件
ENV_FILE = Path(__file__).parent.parent / "config" / ".env"
if ENV_FILE.exists():
    load_dotenv(ENV_FILE)

# 模式: demo | testnet | mainnet
BINANCE_MODE = os.getenv("BINANCE_MODE", "demo")

# API 配置
if BINANCE_MODE in ("testnet", "demo"):
    # Demo Trading 和旧版 Testnet 使用相同的配置变量
    BINANCE_API_KEY = os.getenv("BINANCE_TESTNET_API_KEY", "")
    BINANCE_SECRET = os.getenv("BINANCE_TESTNET_SECRET", "")
    # Demo Trading 使用主网 API 端点
    BINANCE_BASE_URL = "https://fapi.binance.com"
else:
    BINANCE_API_KEY = os.getenv("BINANCE_API_KEY", "")
    BINANCE_SECRET = os.getenv("BINANCE_SECRET", "")
    BINANCE_BASE_URL = "https://fapi.binance.com"

# 风控配置
MAX_DAILY_LOSS_USDT = float(os.getenv("MAX_DAILY_LOSS_USDT", "100"))
MAX_POSITION_SIZE_USDT = float(os.getenv("MAX_POSITION_SIZE_USDT", "50"))
MAX_LEVERAGE = int(os.getenv("MAX_LEVERAGE", "5"))
EMERGENCY_STOP = os.getenv("EMERGENCY_STOP", "false").lower() == "true"

# 服务配置
SERVICE_PORT = int(os.getenv("SERVICE_PORT", "8091"))


def save_env_config(config: dict) -> bool:
    """保存配置到 .env 文件"""
    try:
        lines = []
        if ENV_FILE.exists():
            with open(ENV_FILE, 'r') as f:
                lines = f.readlines()

        # 更新或添加配置
        updated_keys = set()
        new_lines = []
        for line in lines:
            key = line.split('=')[0].strip() if '=' in line else None
            if key and key in config:
                new_lines.append(f"{key}={config[key]}\n")
                updated_keys.add(key)
            else:
                new_lines.append(line)

        # 添加新的配置项
        for key, value in config.items():
            if key not in updated_keys:
                new_lines.append(f"{key}={value}\n")

        # 确保目录存在
        ENV_FILE.parent.mkdir(parents=True, exist_ok=True)

        with open(ENV_FILE, 'w') as f:
            f.writelines(new_lines)

        return True
    except Exception:
        return False


def get_current_config() -> dict:
    """获取当前配置（隐藏敏感信息）"""
    return {
        "mode": BINANCE_MODE,
        "api_key_configured": bool(BINANCE_API_KEY),
        "api_key_preview": BINANCE_API_KEY[:8] + "..." if BINANCE_API_KEY else "",
        "secret_configured": bool(BINANCE_SECRET),
        "max_daily_loss": MAX_DAILY_LOSS_USDT,
        "max_position_size": MAX_POSITION_SIZE_USDT,
        "max_leverage": MAX_LEVERAGE,
    }
