#!/bin/bash
# =============================================================================
# Telegram Service 终极启动脚本
# 解决 Conflict: terminated by other getUpdates request 错误
# =============================================================================

set -e

cd "$(dirname "$0")"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Bot Token
BOT_TOKEN="8375182106:AAFqQZ6jg5qtdKBi65Ahj2skMwoo5d1OV3Y"
BOT_NAME="@abconsole_pro_bot"

echo -e "${BLUE}=============================================================================${NC}"
echo -e "${GREEN}🚀 Telegram Service 终极启动脚本${NC}"
echo -e "${BLUE}=============================================================================${NC}"
echo -e "🤖 Bot: ${YELLOW}$BOT_NAME${NC}"
echo -e "🔑 Token: ${YELLOW}${BOT_TOKEN:0:15}...${BOT_TOKEN: -10}${NC}"
echo -e "${BLUE}=============================================================================${NC}"
echo ""

# 步骤 1: 彻底清理进程
echo -e "${BLUE}[1/6] 清理现有进程...${NC}"
# 杀死所有 Python telegram 相关进程
pkill -9 -f "telegram-service" 2>/dev/null || true
pkill -9 -f "python.*app\.py" 2>/dev/null || true
pkill -9 -f "python.*bot" 2>/dev/null || true
sleep 2
# 再次检查
PYTHON_PROCS=$(pgrep -f "python.*telegram" 2>/dev/null | wc -l)
if [ "$PYTHON_PROCS" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  仍有 $PYTHON_PROCS 个 Python 进程在运行，强制终止...${NC}"
    pgrep -f "python.*telegram" 2>/dev/null | xargs kill -9 2>/dev/null || true
fi
echo -e "${GREEN}✅ 进程清理完成${NC}"
echo ""

# 步骤 2: 清理网络连接
echo -e "${BLUE}[2/6] 清理网络连接...${NC}"
# 清理可能的 Telegram API 连接
if command -v lsof &> /dev/null; then
    lsof -ti:443 2>/dev/null | xargs kill -9 2>/dev/null || true
fi
echo -e "${GREEN}✅ 网络连接清理完成${NC}"
echo ""

# 步骤 3: 激活虚拟环境
echo -e "${BLUE}[3/6] 激活虚拟环境...${NC}"
if [ -f ".venv/bin/activate" ]; then
    source .venv/bin/activate
    echo -e "${GREEN}✅ 虚拟环境已激活${NC}"
else
    echo -e "${RED}❌ 虚拟环境不存在，请先运行 make init${NC}"
    exit 1
fi
echo ""

# 步骤 4: 设置环境变量
echo -e "${BLUE}[4/6] 设置环境变量...${NC}"
export BOT_TOKEN="$BOT_TOKEN"
export TELEGRAM_BOT_TOKEN="$BOT_TOKEN"
# 强制禁用代理以避免可能的连接问题
unset HTTP_PROXY
unset HTTPS_PROXY
unset http_proxy
unset https_proxy
echo -e "${GREEN}✅ 环境变量已设置${NC}"
echo ""

# 步骤 5: Python 强制重置 Bot 状态
echo -e "${BLUE}[5/6] 强制重置 Bot 状态...${NC}"
python3 << 'PYTHON_EOF'
import asyncio
import sys
import logging

logging.basicConfig(level=logging.INFO, format='%(message)s')
logger = logging.getLogger(__name__)

TOKEN = "8375182106:AAFqQZ6jg5qtdKBi65Ahj2skMwoo5d1OV3Y"

async def reset_bot():
    try:
        from telegram import Bot
        bot = Bot(token=TOKEN)
        
        logger.info("  🗑️  删除 webhook...")
        await bot.delete_webhook(drop_pending_updates=True)
        logger.info("  ✅ Webhook 已删除")
        
        logger.info("  📥 清理 pending updates...")
        updates = await bot.get_updates(offset=-1, limit=100)
        if updates:
            last_id = max(u.update_id for u in updates)
            await bot.get_updates(offset=last_id + 1, limit=100)
            logger.info(f"  ✅ 已清理 {len(updates)} 个 pending updates")
        else:
            logger.info("  ✅ 没有 pending updates")
        
        me = await bot.get_me()
        logger.info(f"  ✅ Bot 验证成功: @{me.username}")
        
        await bot.session.close()
        return True
    except Exception as e:
        logger.error(f"  ⚠️  重置警告: {e}")
        return False

result = asyncio.run(reset_bot())
if result:
    logger.info("✅ Bot 状态重置完成")
else:
    logger.warning("⚠️  重置过程有警告，继续启动...")
PYTHON_EOF
echo ""

# 步骤 6: 等待并启动
echo -e "${BLUE}[6/6] 等待并启动服务...${NC}"
echo -e "${YELLOW}⏳ 等待 15 秒让服务器端释放连接...${NC}"
for i in {15..1}; do
    echo -ne "\r  倒计时: $i 秒..."
    sleep 1
done
echo -e "\r  ✅ 等待完成          "
echo ""

echo -e "${GREEN}🚀 启动 telegram-service...${NC}"
echo -e "${BLUE}=============================================================================${NC}"
echo ""

# 使用 exec 替换当前进程，确保信号能正确传递
exec python src/bot/app.py --token "$BOT_TOKEN"
