"""
配置管理 - 支持 Binance / OKX / cTrader 多交易所
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# 加载 .env 文件（支持 ENV_FILE 环境变量覆盖）。
# 默认优先使用 Patrol 根目录的统一配置，服务目录内 .env 仅作为回退。
_service_env = Path(__file__).parent.parent / "config" / ".env"
_root_env = Path(__file__).resolve().parents[3] / "config" / ".env"
_default_env = _root_env if _root_env.exists() else _service_env
ENV_FILE = Path(os.getenv("ENV_FILE", str(_default_env)))
if ENV_FILE.exists():
    load_dotenv(ENV_FILE, override=True)

def _env_first(*keys: str, default: str = "") -> str:
    """按优先级读取环境变量。"""
    for key in keys:
        value = os.getenv(key)
        if value is not None and str(value).strip() != "":
            return str(value).strip()
    return default


def _is_true(value: str) -> bool:
    """解析布尔开关。"""
    return str(value).strip().lower() in {"1", "true", "yes", "on", "demo", "testnet"}


def _resolve_exchange() -> str:
    exchange = _env_first("EXCHANGE", "AB_PATROL_EXECUTION_EXCHANGE", "AB_PATROL_EXCHANGE", default="binance").lower()
    return exchange if exchange in {"binance", "okx", "ctrader"} else "binance"


def _resolve_mode(exchange: str) -> str:
    explicit = _env_first("EXCHANGE_MODE", "AB_PATROL_EXECUTION_MODE")
    if explicit:
        return explicit.lower()
    if exchange == "ctrader":
        return "demo" if _is_true(_env_first("CTRADER_MODE", "AB_PATROL_CTRADER_DEMO", default="1")) else "mainnet"
    if exchange == "okx":
        return "demo" if _is_true(_env_first("OKX_MODE", "AB_PATROL_OKX_TESTNET", default="0")) else "mainnet"
    return "demo" if _is_true(_env_first("BINANCE_MODE", "AB_PATROL_BINANCE_TESTNET", default="1")) else "mainnet"


EXCHANGE = _resolve_exchange()

# 模式: demo | mainnet
EXCHANGE_MODE = _resolve_mode(EXCHANGE)

# OKX API 配置
OKX_API_KEY = _env_first("OKX_API_KEY", "AB_PATROL_OKX_API_KEY")
OKX_SECRET = _env_first("OKX_SECRET", "AB_PATROL_OKX_API_SECRET")
OKX_PASSPHRASE = _env_first("OKX_PASSPHRASE", "AB_PATROL_OKX_PASSPHRASE")

# Binance API 配置（保留兼容）
BINANCE_MODE = _env_first("BINANCE_MODE", default="demo" if EXCHANGE_MODE == "demo" else "mainnet").lower()
if BINANCE_MODE in ("testnet", "demo"):
    BINANCE_API_KEY = _env_first("BINANCE_TESTNET_API_KEY", "AB_PATROL_BINANCE_API_KEY")
    BINANCE_SECRET = _env_first("BINANCE_TESTNET_SECRET", "AB_PATROL_BINANCE_API_SECRET")
else:
    BINANCE_API_KEY = _env_first("BINANCE_API_KEY", "AB_PATROL_BINANCE_API_KEY")
    BINANCE_SECRET = _env_first("BINANCE_SECRET", "AB_PATROL_BINANCE_API_SECRET")
BINANCE_BASE_URL = "https://fapi.binance.com"

# cTrader 配置
CTRADER_CLIENT_ID = _env_first("CTRADER_CLIENT_ID", "AB_PATROL_CTRADER_CLIENT_ID")
CTRADER_CLIENT_SECRET = _env_first("CTRADER_CLIENT_SECRET", "AB_PATROL_CTRADER_CLIENT_SECRET")
CTRADER_ACCESS_TOKEN = _env_first("CTRADER_ACCESS_TOKEN", "AB_PATROL_CTRADER_ACCESS_TOKEN")
CTRADER_ACCOUNT_ID = _env_first("CTRADER_ACCOUNT_ID", "AB_PATROL_CTRADER_ACCOUNT_ID")
CTRADER_DEMO = _is_true(_env_first("CTRADER_DEMO", "AB_PATROL_CTRADER_DEMO", default="1"))
CTRADER_BASE_URL = _env_first("CTRADER_BASE_URL", default="https://api.ctrader.com")
ACCOUNT_ASSET = "USD" if EXCHANGE == "ctrader" else "USDT"

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
    if EXCHANGE == "okx":
        active_key = OKX_API_KEY
        active_secret = OKX_SECRET
    elif EXCHANGE == "ctrader":
        active_key = CTRADER_CLIENT_ID
        active_secret = CTRADER_CLIENT_SECRET
    else:
        active_key = BINANCE_API_KEY
        active_secret = BINANCE_SECRET
    return {
        "exchange": EXCHANGE,
        "mode": EXCHANGE_MODE,
        "account_asset": ACCOUNT_ASSET,
        "api_key_configured": bool(active_key),
        "api_key_preview": f"{active_key[:8]}..." if active_key else "",
        "secret_configured": bool(active_secret),
        "max_daily_loss": MAX_DAILY_LOSS_USDT,
        "max_position_size": MAX_POSITION_SIZE_USDT,
        "max_leverage": MAX_LEVERAGE,
    }
