"""兼容 Bangumi 原始 wiki 字符串和 v0 API infobox 数组。"""

import html
import re
from datetime import date
from typing import Any


def _clean(value: Any) -> str:
    return html.unescape(str(value or "")).strip()


def _api_value(value: Any) -> Any:
    if isinstance(value, list):
        result = []
        for item in value:
            if isinstance(item, dict):
                val = _clean(item.get("v", item.get("value", "")))
                key = _clean(item.get("k", item.get("key", "")))
                result.append({key: val} if key else val)
            else:
                result.append(_clean(item))
        return result
    return _clean(value)


def parse_infobox(raw: Any) -> dict[str, Any]:
    """解析单值字段以及 {[值][键|值]} 数组，不拆分数组中的竖线。"""
    if isinstance(raw, dict):
        return {str(key): _api_value(value) for key, value in raw.items()}
    if isinstance(raw, list):
        return {_clean(item["key"]): _api_value(item.get("value")) for item in raw if isinstance(item, dict) and "key" in item}
    if not isinstance(raw, str) or not raw.strip():
        return {}
    text = raw.replace("\r\n", "\n").strip()
    if text.endswith("}}"):
        text = text[:-2]
    fields = list(re.finditer(r"(?:^|\n)\s*\|([^=\n]+)=", text))
    result: dict[str, Any] = {}
    for index, match in enumerate(fields):
        key = _clean(match.group(1))
        value = text[match.end():fields[index + 1].start() if index + 1 < len(fields) else len(text)].strip()
        if value.startswith("{"):
            array: list[Any] = []
            for item in re.findall(r"\[([^\[\]]*)\]", value, re.DOTALL):
                if "|" in item:
                    label, entry = item.split("|", 1)
                    array.append({_clean(label): _clean(entry)})
                else:
                    array.append(_clean(item))
            result[key] = array
        else:
            result[key] = _clean(value)
    return result


def parse_date(value: Any) -> date | None:
    """兼容 ISO 与中文年月日，未知或非法日期返回空值。"""
    if isinstance(value, date):
        return value
    match = re.search(r"(\d{4})\s*[-年/.]\s*(\d{1,2})\s*[-月/.]\s*(\d{1,2})", str(value or ""))
    if match:
        try:
            return date(*(int(item) for item in match.groups()))
        except ValueError:
            pass
    return None


def _values(value: Any) -> list[str]:
    if isinstance(value, list):
        return [text for item in value for text in _values(item)]
    if isinstance(value, dict):
        return [text for item in value.values() for text in _values(item)]
    text = _clean(value)
    return [text] if text else []


def extract_metadata(raw: Any) -> dict[str, Any]:
    """提取别名、集数、首播、星期、制作公司与导演。"""
    fields = parse_infobox(raw)

    def first(*keys: str) -> Any:
        return next((fields[key] for key in keys if fields.get(key)), "")

    eps_match = re.search(r"\d+", " ".join(_values(first("话数", "集数", "全话数"))))
    weekday_text = " ".join(_values(first("放送星期", "播放星期")))
    weekday_match = re.search(r"(?:星期|周|週|礼拜)?\s*([一二三四五六日天月火水木金土1-7])(?:曜日)?", weekday_text)
    weekday = None
    if weekday_match:
        character = weekday_match.group(1)
        weekday = int(character) if character.isdigit() else {"一": 1, "月": 1, "二": 2, "火": 2, "三": 3, "水": 3, "四": 4, "木": 4, "五": 5, "金": 5, "六": 6, "土": 6, "日": 7, "天": 7}[character]
    aliases = list(dict.fromkeys(_values(first("别名", "别称"))))
    return {
        "aliases": aliases,
        "eps": int(eps_match.group()) if eps_match else None,
        "air_date": parse_date(" ".join(_values(first("放送开始", "上映日", "发售日", "发售日期", "上映年度")))),
        "air_weekday": weekday,
        "studio": "、".join(_values(first("动画制作", "制作公司"))) or None,
        "director": "、".join(_values(first("导演", "监督", "監督"))) or None,
    }
