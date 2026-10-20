"""SQLAlchemy 异步连接池与请求会话。"""
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings


class Base(DeclarativeBase):
    """全部业务模型的声明基类。"""


engine = create_async_engine(get_settings().database_url, pool_pre_ping=True, pool_size=10, max_overflow=20, pool_timeout=5, connect_args={'timeout': 5, 'command_timeout': 60})
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncIterator[AsyncSession]:
    """为每个请求分配独立会话，失败时回滚未提交事务。"""
    async with SessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
