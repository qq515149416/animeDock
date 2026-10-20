"""使用显式白名单将自由标签映射为可筛选字段。"""

from typing import Any

CATEGORY_MAP: dict[str, str] = {
    "1": "TV", "tv": "TV", "tv动画": "TV", "电视动画": "TV",
    "2": "OVA", "ova": "OVA", "oad": "OVA",
    "3": "剧场版", "movie": "剧场版", "剧场版": "剧场版", "劇場版": "剧场版", "电影": "剧场版",
    "5": "WEB", "web": "WEB", "ona": "WEB", "网络动画": "WEB",
    "0": "其他", "4": "其他", "2006": "其他", "other": "其他", "其他": "其他", "动态漫画": "其他",
}
SOURCE_MAP: dict[str, str] = {
    "原创": "原创", "原創": "原创", "original": "原创",
    "漫画改": "漫画改", "漫画改编": "漫画改", "漫改": "漫画改", "漫畫改": "漫画改",
    "小说改": "小说改", "轻小说改": "小说改", "轻改": "小说改", "小说改编": "小说改", "輕小說改": "小说改",
    "游戏改": "游戏改", "游戏改编": "游戏改", "galgame改": "游戏改", "遊戲改": "游戏改",
    "动画改": "动画改", "动画改编": "动画改", "其他": "其他",
}
REGION_MAP: dict[str, str] = {
    "日本": "日本", "日本动画": "日本", "中国": "中国", "国产": "中国", "国创": "中国",
    "中国大陆": "中国", "中国台湾": "中国", "中国香港": "中国", "台湾": "中国", "香港": "中国",
    "美国": "欧美", "欧美": "欧美", "欧洲": "欧美", "英国": "欧美", "法国": "欧美", "加拿大": "欧美", "德国": "欧美",
    "韩国": "韩国", "韓國": "韩国", "其他": "其他",
}
GENRE_MAP: dict[str, str] = {item: item for item in ("恋爱", "搞笑", "奇幻", "科幻", "异世界", "日常", "治愈", "热血", "悬疑", "运动", "音乐", "百合", "机战", "战斗", "校园", "后宫", "冒险", "推理", "历史", "偶像", "美食", "惊悚")}
GENRE_MAP.update({"爱情": "恋爱", "喜剧": "搞笑", "治愈系": "治愈", "異世界": "异世界", "恐怖": "惊悚", "机器人": "机战"})
TAG_MIN_COUNT = 10


def _names(tags: Any, min_count: int | None = None) -> list[str]:
    names = []
    for tag in tags or []:
        if isinstance(tag, str):
            if min_count is not None:
                continue
            name = tag
        elif isinstance(tag, dict):
            if min_count is not None:
                try:
                    if int(tag.get("count", 0)) < min_count:
                        continue
                except (ValueError, TypeError):
                    continue
            name = str(tag.get("name", ""))
        else:
            continue
        if name.strip():
            names.append(name.strip().lower())
    return names


def map_tags(platform: Any = None, meta_tags: Any = None, tags: Any = None, min_count: int = TAG_MIN_COUNT) -> dict[str, Any]:
    """平台优先于公共标签，公共标签优先于达到热度阈值的用户标签。"""
    names = _names(meta_tags) + _names(tags, min_count)

    def choose(mapping: dict[str, str], default: str) -> str:
        return next((mapping[name] for name in names if name in mapping), default)

    return {
        "category": CATEGORY_MAP.get(str(platform).strip().lower(), choose(CATEGORY_MAP, "其他")),
        "source": choose(SOURCE_MAP, "其他"),
        "region": choose(REGION_MAP, "日本"),
        "genres": list(dict.fromkeys(GENRE_MAP[name] for name in names if name in GENRE_MAP)),
    }
