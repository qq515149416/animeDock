"""FastAPI 入口、跨域、限流、结构化日志和健康检查。"""
import asyncio
import json
import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import get_settings
from app.db import engine
from app.deps import check_rate_limit, get_meili_client, get_redis, resolve_client_ip
from app.routers import anime, calendar, chat, meta
from app.schemas import HealthResponse


class JSONFormatter(logging.Formatter):
    """输出便于容器日志系统检索的结构化日志。"""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {'timestamp': datetime.now(timezone.utc).isoformat(), 'level': record.levelname, 'logger': record.name, 'message': record.getMessage()}
        for key in ('path', 'method', 'status', 'duration_ms', 'error', 'anime_id', 'query', 'index_hits', 'database_hits', 'provider'):
            if hasattr(record, key):
                payload[key] = getattr(record, key)
        if record.exc_info:
            payload['exception'] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str)


handler = logging.StreamHandler()
handler.setFormatter(JSONFormatter())
logging.basicConfig(level=get_settings().log_level.upper(), handlers=[handler], force=True)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """服务关闭时释放进程共享连接，定时任务由独立 worker 执行。"""
    yield
    await get_redis().aclose()
    await get_meili_client().aclose()
    await engine.dispose()
    get_redis.cache_clear()
    get_meili_client.cache_clear()


app = FastAPI(title='番剧坞 API', version='1.0.0', description='基于 Bangumi 的动画检索、每日放送和 AI 助手。', lifespan=lifespan)


@app.exception_handler(StarletteHTTPException)
async def http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """保持机器可读错误码位于顶层，包括 NSFW_BLOCKED。"""
    content = exc.detail if isinstance(exc.detail, dict) else {'code': 'HTTP_ERROR', 'message': str(exc.detail)}
    return JSONResponse(status_code=exc.status_code, content=jsonable_encoder(content), headers=exc.headers)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    """统一参数验证错误格式。"""
    return JSONResponse(status_code=422, content=jsonable_encoder({'code': 'VALIDATION_ERROR', 'message': '请求参数无效', 'details': exc.errors()}))


@app.exception_handler(SQLAlchemyError)
async def database_error(request: Request, exc: SQLAlchemyError) -> JSONResponse:
    """数据库不可用时给出可重试状态并记录完整内部错误。"""
    logger.exception('database_request_failed', extra={'path': request.url.path})
    return JSONResponse(status_code=503, content={'code': 'DATABASE_UNAVAILABLE', 'message': '数据库暂不可用，请稍后重试'})


@app.exception_handler(Exception)
async def unexpected_error(request: Request, exc: Exception) -> JSONResponse:
    """隐藏内部异常细节，避免配置和上游信息泄漏。"""
    logger.exception('request_failed', extra={'path': request.url.path})
    return JSONResponse(status_code=500, content={'code': 'INTERNAL_ERROR', 'message': '服务暂时发生错误，请稍后重试'})


@app.middleware('http')
async def limit_and_log(request: Request, call_next: Any) -> Response:
    """按可信代理解析后的客户端 IP 限制普通请求，聊天另按 client_id 限流。"""
    started = time.monotonic()
    path = request.url.path.rstrip('/')
    if path.startswith('/api/') and path != '/api/health' and request.method != 'OPTIONS' and not (path == '/api/chat' and request.method == 'POST'):
        ip = resolve_client_ip(request)
        try:
            await check_rate_limit(f'ip:{ip}', limit=120)
        except HTTPException as exc:
            return await http_error(request, exc)
    response = await call_next(request)
    logger.info('http_request', extra={'path': path, 'method': request.method, 'status': response.status_code, 'duration_ms': round((time.monotonic() - started) * 1000, 2)})
    return response


app.include_router(calendar.router, prefix='/api')
app.include_router(anime.router, prefix='/api')
app.include_router(meta.router, prefix='/api')
app.include_router(chat.router, prefix='/api')


@app.get('/api/health', response_model=HealthResponse, responses={503: {'model': HealthResponse}}, tags=['运行状态'])
async def health(response: Response) -> HealthResponse:
    """并行验证数据库、缓存与索引连通性。"""
    async def database() -> bool:
        try:
            async with engine.connect() as connection:
                await connection.execute(text('SELECT 1'))
            return True
        except Exception:
            return False

    async def redis() -> bool:
        try:
            return bool(await get_redis().ping())
        except Exception:
            return False

    async def meilisearch() -> bool:
        try:
            result = await get_meili_client().health()
            return result.status == 'available'
        except Exception:
            return False

    values = await asyncio.gather(database(), redis(), meilisearch())
    services = dict(zip(('database', 'redis', 'meilisearch'), values))
    healthy = all(values)
    response.status_code = 200 if healthy else 503
    return HealthResponse(status='ok' if healthy else 'degraded', services=services)


# CORS 必须包裹限流中间件，使错误响应也能被跨域前端读取。
app.add_middleware(CORSMiddleware, allow_origins=get_settings().cors_origins, allow_credentials=True, allow_methods=['GET', 'POST', 'DELETE', 'OPTIONS'], allow_headers=['Content-Type', 'Authorization'])
