#!/usr/bin/env python3
"""
冷启动模式 - 使用 @abconsole_pro_bot，完全干净的启动
"""

import os
import sys
import asyncio
import logging

# 强制设置新 Token
os.environ['BOT_TOKEN'] = "8375182106:AAFqQZ6jg5qtdKBi65Ahj2skMwoo5d1OV3Y"
os.environ['TELEGRAM_BOT_TOKEN'] = "8375182106:AAFqQZ6jg5qtdKBi65Ahj2skMwoo5d1OV3Y"

# 提前加载 .env 但覆盖 Token
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_SERVICE_ROOT = os.path.dirname(os.path.dirname(_SCRIPT_DIR))
_REPO_ROOT = os.path.dirname(os.path.dirname(_SERVICE_ROOT))

# 加载 .env 文件
env_path = os.path.join(_REPO_ROOT, "config", ".env")
if os.path.exists(env_path):
    with open(env_path, 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, val = line.split('=', 1)
                # 不覆盖 BOT_TOKEN
                if key and key not in os.environ:
                    os.environ[key] = val

# 设置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

async def reset_and_start():
    """重置并启动"""
    from telegram import Bot
    from telegram.ext import Application
    
    TOKEN = os.environ['BOT_TOKEN']
    logger.info(f"🔑 使用 Token: {TOKEN[:10]}...{TOKEN[-10:]}")
    
    # 1. 先创建 Bot 实例并清理状态
    bot = Bot(token=TOKEN)
    
    try:
        logger.info("🗑️  删除 webhook...")
        await bot.delete_webhook(drop_pending_updates=True)
        logger.info("✅ Webhook 已删除")
        
        # 2. 获取 Bot 信息确认 Token 有效
        me = await bot.get_me()
        logger.info(f"✅ Bot 验证成功: @{me.username}")
        
        await bot.session.close()
        
    except Exception as e:
        logger.error(f"⚠️  重置警告: {e}")
        await bot.session.close()
    
    # 3. 等待确保服务器端释放
    logger.info("⏳ 等待 10 秒让服务器端释放连接...")
    await asyncio.sleep(10)
    
    # 4. 现在启动主应用
    logger.info("🚀 启动主应用...")
    
    # 导入并修改 app.py 的启动逻辑
    import importlib.util
    spec = importlib.util.spec_from_file_location("app", 
        os.path.join(_SCRIPT_DIR, "app.py"))
    app_module = importlib.util.module_from_spec(spec)
    
    # 在加载前确保环境变量
    os.environ['BOT_TOKEN'] = TOKEN
    
    spec.loader.exec_module(app_module)
    
    # 调用 main 函数
    if hasattr(app_module, 'main'):
        app_module.main()

if __name__ == "__main__":
    print("=" * 60)
    print("🚀 Cold Start Mode - @abconsole_pro_bot")
    print("=" * 60)
    
    try:
        asyncio.run(reset_and_start())
    except KeyboardInterrupt:
        print("\n👋 已停止")
    except Exception as e:
        logger.error(f"❌ 启动失败: {e}")
        import traceback
        traceback.print_exc()
