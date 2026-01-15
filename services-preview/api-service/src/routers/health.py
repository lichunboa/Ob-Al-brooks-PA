"""健康检查路由"""

from datetime import datetime

from fastapi import APIRouter

from src import __version__
from src.schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """健康检查"""
    return HealthResponse(
        status="healthy",
        service="api-service",
        version=__version__,
        timestamp=datetime.now(),
    )
