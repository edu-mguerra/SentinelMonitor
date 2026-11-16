import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.core.config import settings
from app.api.v1.api import api_router
from app.database.session import engine, Base
from app.services.scheduler import monitor_scheduler_loop
import app.models

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    scheduler_task = asyncio.create_task(monitor_scheduler_loop())

    yield

    scheduler_task.cancel()
    try:
        await scheduler_task
    except asyncio.CancelledError:
        pass

    await engine.dispose()

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Sentinel Monitor - Plataforma SaaS Multi-Tenant de Monitoramento de Infraestrutura",
    version="1.0.0",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

if settings.BACKEND_CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.BACKEND_CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

@app.get("/health", tags=["Status"])
async def health_check():
    """Verifica a saúde da API e a conectividade com o banco de dados."""
    db_status = "offline"
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
            db_status = "online"
    except Exception as e:
        db_status = f"error: {str(e)}"

    return {
        "status": "healthy" if db_status == "online" else "degraded",
        "database": db_status,
        "environment": settings.ENVIRONMENT,
        "version": "1.0.0"
    }

app.include_router(api_router, prefix=settings.API_V1_STR)
