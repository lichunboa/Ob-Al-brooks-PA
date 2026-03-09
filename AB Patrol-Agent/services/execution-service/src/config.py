"""
配置管理 - 支持 OKX / Binance 双交易所
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# 加载 .env 文件（支持 ENV_FILE 环境变量覆盖）
_default_env = Path(__file__).parent.parent / "config" / ".env"
ENV_FILE = Path(os.getenv("ENV_FILE", str(_default_env)))
if ENV_FILE.exists():
    load_dotenv(ENV_FILE, override=True)

# 交易所选择: okx | binance
# Patrol 本地执行链默认固定到 Binance demo；仅在显式覆盖时才允许切到其他交易所。
EXCHANGE = os.getenv("EXCHANGE", "binance")

# 模式: demo | mainnet
EXCHANGE_MODE = os.getenv("EXCHANGE_MODE", "demo")

# OKX API 配置
OKX_API_KEY = os.getenv("OKX_API_KEY", "")
OKX_SECRET = os.getenv("OKX_SECRET", "")
OKX_PASSPHRASE = os.getenv("OKX_PASSPHRASE", "")

# Binance API 配置（保留兼容）
BINANCE_MODE = os.getenv("BINANCE_MODE", "demo")
if BINANCE_MODE in ("testnet", "demo"):
    BINANCE_API_KEY = os.getenv("BINANCE_TESTNET_API_KEY", "")
    BINANCE_SECRET = os.getenv("BINANCE_TESTNET_SECRET", "")
else:
    BINANCE_API_KEY = os.getenv("BINANCE_API_KEY", "")
    BINANCE_SECRET = os.getenv("BINANCE_SECRET", "")
BINANCE_BASE_URL = "https://fapi.binance.com"

# 风控配置
MAX_DAILY_LOSS_USDT = float(os.getenv("MAX_DAILY_LOSS_USDT", "100"))
MAX_POSITION_SIZE_USDT = float(os.getenv("MAX_POSITION_SIZE_USDT", "50"))
MAX_LEVERAGE = int(os.getenv("MAX_LEVERAGE", "20"))
EMERGENCY_STOP = os.getenv("EMERGENCY_STOP", "false").lower() == "true"

# 服务配置
SERVICE_PORT = int(os.getenv("SERVICE_PORT", "8092"))

# 工作目录（双实例隔离）
WORKSPACE = Path(os.getenv("WORKSPACE", str(Path.home() / ".openclaw" / "workspace")))
SHARED_WORKSPACE = Path(os.getenv("SHARED_WORKSPACE", str(Path.home() / ".openclaw" / "workspaces" / "trading-shared")))


def save_env_config(config: dict) -> bool:
    """保存配置到 .env 文件"""
    try:
        lines = []
        if ENV_FILE.exists():
            with open(ENV_FILE, 'r') as f:
                lines = f.readlines()

        updated_keys = set()
        new_lines = []
        for line in lines:
            key = line.split('=')[0].strip() if '=' in line else None
            if key and key in config:
                new_lines.append(f"{key}={config[key]}\n")
                updated_keys.add(key)
            else:
                new_lines.append(line)

        for key, value in config.items():
            if key not in updated_keys:
                new_lines.append(f"{key}={value}\n")

        ENV_FILE.parent.mkdir(parents=True, exist_ok=True)

        with open(ENV_FILE, 'w') as f:
            f.writelines(new_lines)

        return True
    except Exception:
        return False


def get_current_config() -> dict:
    """获取当前配置（隐藏敏感信息）"""
    return {
        "exchange": EXCHANGE,
        "mode": EXCHANGE_MODE,
        "api_key_configured": bool(OKX_API_KEY if EXCHANGE == "okx" else BINANCE_API_KEY),
        "api_key_preview": (OKX_API_KEY[:8] if EXCHANGE == "okx" else BINANCE_API_KEY[:8]) + "..." if (OKX_API_KEY if EXCHANGE == "okx" else BINANCE_API_KEY) else "",
        "secret_configured": bool(OKX_SECRET if EXCHANGE == "okx" else BINANCE_SECRET),
        "max_daily_loss": MAX_DAILY_LOSS_USDT,
        "max_position_size": MAX_POSITION_SIZE_USDT,
        "max_leverage": MAX_LEVERAGE,
    }
