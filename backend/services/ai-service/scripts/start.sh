#!/bin/bash
# ai-service 启动脚本
# 作为 telegram-service 子模块，主要用于测试和调试

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$(dirname "$SERVICE_DIR")")"

cd "$SERVICE_DIR"

# 加载全局配置
if [ -f "$PROJECT_ROOT/config/.env" ]; then
    set -a
    source "$PROJECT_ROOT/config/.env"
    set +a
fi

# 激活虚拟环境（优先用 telegram-service 的）
TELEGRAM_VENV="$PROJECT_ROOT/services/telegram-service/.venv"
if [ -d "$TELEGRAM_VENV" ]; then
    source "$TELEGRAM_VENV/bin/activate"
elif [ -d ".venv" ]; then
    source .venv/bin/activate
fi

# 添加项目路径
export PYTHONPATH="$SERVICE_DIR:$PROJECT_ROOT:$PYTHONPATH"

case "$1" in
    test)
        echo "📊 测试数据获取..."
        python3 -c "
from src.data.fetcher import fetch_payload
import json

symbol = '${2:-BTCUSDT}'
payload = fetch_payload(symbol, '15m')

print(f'币种: {symbol}')
print(f'K线周期: {list(payload.get(\"candles_latest_50\", {}).keys())}')
print(f'期货数据: {len(payload.get(\"metrics_5m_latest_50\", []))} 条')
print(f'指标表: {len(payload.get(\"indicator_samples\", {}))} 个')

# 显示部分数据
candles_1h = payload.get('candles_latest_50', {}).get('1h', [])
if candles_1h:
    latest = candles_1h[0]
    print(f'最新1h K线: {latest.get(\"bucket_ts\")} close={latest.get(\"close\")}')
"
        ;;
        
    analyze)
        symbol="${2:-BTCUSDT}"
        interval="${3:-1h}"
        prompt="${4:-市场全局解析}"
        
        echo "🤖 分析 $symbol @ $interval (提示词: $prompt)..."
        python3 -c "
import asyncio
from src.pipeline import run_analysis

async def main():
    result = await run_analysis('$symbol', '$interval', '$prompt')
    if 'error' in result:
        print('❌ 错误:', result['error'])
    else:
        print(result['analysis'])

asyncio.run(main())
"
        ;;
        
    prompts)
        echo "📝 可用提示词:"
        python3 -c "
from src.prompt import PromptRegistry
registry = PromptRegistry()
for item in registry.list_prompts():
    print(f'  - {item[\"name\"]}')
"
        ;;
        
    check)
        echo "🔍 检查依赖..."
        python3 -c "
import sys
errors = []

# 检查 psycopg
try:
    import psycopg
    print('✅ psycopg')
except ImportError:
    print('❌ psycopg (pip install psycopg[binary])')
    errors.append('psycopg')

# 检查 dotenv
try:
    from dotenv import load_dotenv
    print('✅ python-dotenv')
except ImportError:
    print('❌ python-dotenv')
    errors.append('dotenv')

# 检查 gemini_client
try:
    from libs.common.utils.gemini_client import call_gemini_with_system
    print('✅ gemini_client')
except ImportError as e:
    print(f'⚠️  gemini_client: {e}')

# 检查数据库
try:
    from src.config import INDICATOR_DB
    if INDICATOR_DB.exists():
        print(f'✅ SQLite: {INDICATOR_DB}')
    else:
        print(f'⚠️  SQLite 不存在: {INDICATOR_DB}')
except Exception as e:
    print(f'❌ 配置错误: {e}')

if errors:
    print(f'\\n需要安装: pip install {\" \".join(errors)}')
    sys.exit(1)
else:
    print('\\n✅ 依赖检查通过')
"
        ;;
        
    *)
        echo "用法: $0 {test|analyze|prompts|check} [参数]"
        echo ""
        echo "命令:"
        echo "  test [symbol]              测试数据获取 (默认 BTCUSDT)"
        echo "  analyze [symbol] [interval] [prompt]  运行 AI 分析"
        echo "  prompts                    列出可用提示词"
        echo "  check                      检查依赖"
        echo ""
        echo "示例:"
        echo "  $0 test ETHUSDT"
        echo "  $0 analyze BTCUSDT 1h 市场全局解析"
        ;;
esac
