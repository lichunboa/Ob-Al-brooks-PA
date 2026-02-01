#!/bin/bash
# =============================================================================
# Telegram Service 诊断与修复脚本
# =============================================================================

cd "$(dirname "$0")"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

NEW_TOKEN="8375182106:AAFqQZ6jg5qtdKBi65Ahj2skMwoo5d1OV3Y"
OLD_TOKEN="8421134988:AAEMO9QraIEXUaZZwPJt3ufM0T0-CPNpYs4"

echo -e "${BLUE}=============================================================================${NC}"
echo -e "${GREEN}🔍 Telegram Service 诊断工具${NC}"
echo -e "${BLUE}=============================================================================${NC}"
echo ""

# ===== 第 1 步：检查进程 =====
echo -e "${BLUE}[1/5] 检查运行中的进程...${NC}"
PYTHON_PROCS=$(ps aux | grep -E "python.*telegram|python.*app\.py" | grep -v grep | grep -v vscode | wc -l)
if [ "$PYTHON_PROCS" -gt 0 ]; then
    echo -e "${RED}❌ 发现 $PYTHON_PROCS 个 Python 进程正在运行：${NC}"
    ps aux | grep -E "python.*telegram|python.*app\.py" | grep -v grep | grep -v vscode
    echo ""
    echo -e "${YELLOW}🗑️  正在终止这些进程...${NC}"
    pkill -9 -f "python.*telegram" 2>/dev/null || true
    pkill -9 -f "python.*app\.py" 2>/dev/null || true
    sleep 2
    echo -e "${GREEN}✅ 进程已终止${NC}"
else
    echo -e "${GREEN}✅ 没有 Python 进程在运行${NC}"
fi
echo ""

# ===== 第 2 步：检查 Docker =====
echo -e "${BLUE}[2/5] 检查 Docker 容器...${NC}"
if command -v docker &> /dev/null; then
    DOCKER_CONTAINERS=$(docker ps -q 2>/dev/null | wc -l)
    if [ "$DOCKER_CONTAINERS" -gt 0 ]; then
        echo -e "${YELLOW}⚠️  发现 $DOCKER_CONTAINERS 个运行中的 Docker 容器：${NC}"
        docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"
        echo ""
        echo -e "${YELLOW}如果其中包含 telegram 相关容器，请手动停止：${NC}"
        echo "  docker stop <容器名>"
    else
        echo -e "${GREEN}✅ 没有运行中的 Docker 容器${NC}"
    fi
else
    echo -e "${GREEN}✅ Docker 未安装${NC}"
fi
echo ""

# ===== 第 3 步：检查网络连接 =====
echo -e "${BLUE}[3/5] 检查网络连接...${NC}"
if command -v lsof &> /dev/null; then
    TELEGRAM_CONNS=$(lsof -i :443 2>/dev/null | grep -v "^COMMAND" | wc -l)
    if [ "$TELEGRAM_CONNS" -gt 0 ]; then
        echo -e "${YELLOW}⚠️  发现 $TELEGRAM_CONNS 个到 443 端口的连接：${NC}"
        lsof -i :443 | head -10
    else
        echo -e "${GREEN}✅ 没有到 443 端口的连接${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  lsof 未安装，跳过网络检查${NC}"
fi
echo ""

# ===== 第 4 步：更新配置文件 =====
echo -e "${BLUE}[4/5] 更新配置文件...${NC}"
ENV_FILE="../config/.env"
if [ -f "$ENV_FILE" ]; then
    CURRENT_TOKEN=$(grep "^BOT_TOKEN=" "$ENV_FILE" | cut -d= -f2)
    echo "当前 Token: ${CURRENT_TOKEN:0:15}...${CURRENT_TOKEN: -10}"
    
    if [ "$CURRENT_TOKEN" = "$OLD_TOKEN" ]; then
        echo -e "${YELLOW}⚠️  config/.env 仍在使用旧 Token，需要更新${NC}"
        sed -i.bak "s/BOT_TOKEN=.*/BOT_TOKEN=$NEW_TOKEN/" "$ENV_FILE"
        echo -e "${GREEN}✅ 已更新 config/.env 使用新 Token${NC}"
    elif [ "$CURRENT_TOKEN" = "$NEW_TOKEN" ]; then
        echo -e "${GREEN}✅ config/.env 已使用新 Token${NC}"
    else
        echo -e "${YELLOW}⚠️  config/.env 使用的是未知的 Token${NC}"
        echo "Token: ${CURRENT_TOKEN:0:15}...${CURRENT_TOKEN: -10}"
    fi
else
    echo -e "${RED}❌ 未找到 config/.env 文件${NC}"
fi
echo ""

# ===== 第 5 步：Python 强制重置 =====
echo -e "${BLUE}[5/5] 强制重置 Bot 状态...${NC}"
source .venv/bin/activate

python3 << 'PYTHON_EOF'
import asyncio
import sys
sys.path.insert(0, 'src')

TOKEN = "8375182106:AAFqQZ6jg5qtdKBi65Ahj2skMwoo5d1OV3Y"

async def diagnose():
    from telegram import Bot
    from telegram.error import Conflict
    
    print("  🔄 创建 Bot 实例...")
    bot = Bot(token=TOKEN)
    
    try:
        print("  🗑️  删除 webhook...")
        result = await bot.delete_webhook(drop_pending_updates=True)
        print(f"  ✅ Webhook 删除结果: {result}")
        
        print("  📥 尝试获取 pending updates...")
        updates = await bot.get_updates(limit=1)
        if updates:
            print(f"  ⚠️  有 {len(updates)} 个待处理更新")
            # 清理它们
            last_id = updates[-1].update_id
            await bot.get_updates(offset=last_id + 1, limit=100)
            print(f"  ✅ 已清理")
        else:
            print("  ✅ 没有待处理更新")
        
        me = await bot.get_me()
        print(f"  ✅ Bot 信息: @{me.username} (ID: {me.id})")
        
        await bot.session.close()
        print("  ✅ Bot 状态正常，可以启动")
        return True
        
    except Conflict as e:
        print(f"  ❌ Conflict 错误: {e}")
        await bot.session.close()
        return False
    except Exception as e:
        print(f"  ⚠️  其他错误: {e}")
        await bot.session.close()
        return False

result = asyncio.run(diagnose())
if result:
    print("\n✅ 诊断通过，准备启动...")
else:
    print("\n⚠️  检测到 Conflict，需要等待服务器端释放...")
    print("   等待 30 秒后重试...")
PYTHON_EOF

echo ""
echo -e "${BLUE}=============================================================================${NC}"
echo ""

# 如果诊断通过，询问是否启动
read -p "是否现在启动 telegram-service? (y/n): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${GREEN}🚀 启动 telegram-service...${NC}"
    echo -e "${BLUE}=============================================================================${NC}"
    export BOT_TOKEN="$NEW_TOKEN"
    export TELEGRAM_BOT_TOKEN="$NEW_TOKEN"
    python src/bot/app.py --token "$NEW_TOKEN"
else
    echo -e "${YELLOW}⏹️  已取消启动${NC}"
    echo ""
    echo "你可以稍后手动启动："
    echo "  cd 'AB Console-Backend/services/telegram-service'"
    echo "  source .venv/bin/activate"
    echo "  python src/bot/app.py --token '$NEW_TOKEN'"
fi
