"""Sync Service Entry Point"""
import sys
import uvicorn
from pathlib import Path

# 确保 src 在路径中
SRC_DIR = Path(__file__).parent
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from config import settings
from db.database import init_db


def main():
    """启动同步服务"""
    print(f"🔄 Starting {settings.service_name} v{settings.version}")
    print(f"   API: http://{settings.api_host}:{settings.api_port}")
    print(f"   Database: {settings.database_url}")
    
    # 初始化数据库
    init_db()
    print("✅ Database initialized")
    
    # 启动 API 服务
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    from api.router import router
    
    app = FastAPI(
        title="Sync Service",
        description="Obsidian Data Sync Service",
        version=settings.version,
    )
    
    # 添加 CORS 支持
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    app.include_router(router)
    
    uvicorn.run(
        app,
        host=settings.api_host,
        port=settings.api_port,
        log_level=settings.log_level.lower(),
    )


if __name__ == "__main__":
    main()
