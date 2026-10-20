"""命令行任务和独立 worker 共用的 JSON 日志配置。"""

import json
import logging
from datetime import datetime, timezone

from app.config import get_settings

_STANDARD_FIELDS = set(logging.makeLogRecord({}).__dict__) | {"message", "asctime"}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {"time": datetime.fromtimestamp(record.created, timezone.utc).isoformat(), "level": record.levelname, "logger": record.name, "event": record.getMessage()}
        payload.update({key: value for key, value in record.__dict__.items() if key not in _STANDARD_FIELDS})
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str)


def setup_logging() -> None:
    """保留日志附加字段，便于 Docker 日志查询与故障定位。"""
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    logging.basicConfig(level=get_settings().log_level, handlers=[handler], force=True)
