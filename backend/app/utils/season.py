from datetime import date, datetime
from zoneinfo import ZoneInfo

SEASONS = ("winter", "spring", "summer", "autumn")


def get_season(day: date) -> str:
    """根据首播日期返回季度的稳定英文标识。"""
    return SEASONS[(day.month - 1) // 3]


def get_current_season() -> tuple[int, str]:
    """以北京时间计算当前年份与季度。"""
    today = datetime.now(ZoneInfo("Asia/Shanghai")).date()
    return today.year, get_season(today)


def season_date_range(year: int, season: str) -> tuple[date, date]:
    """返回季度起止日期，结束日期不包含在范围内。"""
    if season not in SEASONS:
        raise ValueError(f"无效季度: {season}")
    month = SEASONS.index(season) * 3 + 1
    return date(year, month, 1), date(year + (month == 10), 1 if month == 10 else month + 3, 1)
