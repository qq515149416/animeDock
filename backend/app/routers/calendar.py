"""每日放送接口。"""
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.schemas import CalendarDay
from app.services.calendar_service import get_calendar

router = APIRouter(prefix='/calendar', tags=['每日放送'])


@router.get('', response_model=list[CalendarDay])
async def calendar(db: Annotated[AsyncSession, Depends(get_db)], nsfw: bool = False) -> list[dict]:
    """返回按北京时间星期一至星期日排列的七组动画。"""
    return await get_calendar(db, nsfw=nsfw)
