#!/usr/bin/env python3
"""
强制启动脚本 - 解决 Conflict 问题
使用新 Bot Token 并确保干净启动
"""

import os
import sys
import asyncio
import logging

# 设置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ========== 配置 ==========
# 使用 @abconsole_pro_bot 的 Token
NEW_BOT_TOKEN = "8375182106:AAFqQZ6jg5qtdKBi65Ahj2skMwoo5d1OV3Y"  # @abconsole_pro_bot

async def force_reset_bot():
    """强制重置 Bot 状态"""
    from telegram import Bot
    
    logger.info("🔄 正在强制重置 Bot 状态...")
    
    try:
        bot = Bot(token=NEW_BOT_TOKEN)
        
        # 1. 删除 Webhook
        logger.info("🗑️  删除 webhook...")
        await bot.delete_webhook(drop_pending_updates=True)
        logger.info("✅ Webhook 已删除")
        
        # 2. 获取并丢弃所有待处理的 updates
        logger.info("📥 清理 pending updates...")
        updates = await bot.get_updates(offset=-1, limit=1)
        if updates:
            last_update_id = updates[-1].update_id
            # 获取所有更新的偏移量
            await bot.get_updates(offset=last_update_id + 1, limit=100)
            logger.info(f"✅ 已清理到 update_id: {last_update_id}")
        else:
            logger.info("✅ 没有 pending updates")
        
        # 3. 验证 Bot 信息
        me = await bot.get_me()
        logger.info(f"✅ Bot 验证成功: @{me.username} (ID: {me.id})")
        
        await bot.session.close()
        logger.info("✅ Bot 状态已重置")
        return True
        
    except Exception as e:
        logger.error(f"❌ 重置失败: {e}")
        return False

def kill_existing_processes():
    """杀死可能冲突的进程"""
    import subprocess
    
    logger.info("🔍 检查冲突进程...")
    
    # 查找 Python telegram 相关进程
    try:
        result = subprocess.run(
            ["pgrep", "-f", "telegram"],
            capture_output=True,
            text=True
        )
        if result.stdout:
            pids = result.stdout.strip().split('\n')
            for pid in pids:
                if pid:
                    try:
                        subprocess.run(["kill", "-9", pid], check=False)
                        logger.info(f"🗑️  已终止进程 PID: {pid}")
                    except Exception as e:
                        logger.warning(f"⚠️  无法终止 PID {pid}: {e}")
    except Exception as e:
        logger.warning(f"⚠️  进程清理警告: {e}")

def start_telegram_service():
    """启动 telegram-service"""
    import subprocess
    
    # 设置环境变量
    env = os.environ.copy()
    env['BOT_TOKEN'] = NEW_BOT_TOKEN
    env['TELEGRAM_BOT_TOKEN'] = NEW_BOT_TOKEN
    
    # 确保使用新 Token
    logger.info(f"🔑 使用 Token: {NEW_BOT_TOKEN[:15]}...{NEW_BOT_TOKEN[-10:]}")
    
    # 启动服务
    cmd = [sys.executable, "src/bot/app.py"]
    
    logger.info("🚀 启动 telegram-service...")
    try:
        subprocess.run(cmd, env=env, cwd="/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Backend/services/telegram-service")
    except KeyboardInterrupt:
        logger.info("👋 服务已停止")

async def main():
    """主函数"""
    print("=" * 60)
    print("🚀 Telegram Service 强制启动工具")
    print("=" * 60)
    
    # 1. 杀死现有进程
    kill_existing_processes()
    
    # 2. 等待一会儿
    logger.info("⏳ 等待 3 秒...")
    await asyncio.sleep(3)
    
    # 3. 重置 Bot 状态
    success = await force_reset_bot()
    
    if success:
        logger.info("✅ 重置完成，等待 5 秒后启动服务...")
        await asyncio.sleep(5)
        
        # 4. 启动服务
        start_telegram_service()
    else:
        logger.error("❌ 重置失败，尝试直接启动...")
        await asyncio.sleep(5)
        start_telegram_service()

if __name__ == "__main__":
    asyncio.run(main())
