"""从环境变量读取并校验服务配置。"""
from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """所有外部服务均通过环境变量配置，属性统一使用小写。"""

    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore', case_sensitive=False)

    app_name: str = '番剧坞'
    database_url: str = 'postgresql+asyncpg://fanjuwu:fanjuwu@localhost:5432/fanjuwu'
    redis_url: str = 'redis://localhost:6379/0'
    meili_url: str = 'http://localhost:7700'
    meili_master_key: str = ''
    meili_index: str = 'anime'
    bangumi_base_url: str = 'https://api.bgm.tv'
    bangumi_user_agent: str = 'fanjuwu/1.0 (self-hosted anime catalog)'
    bangumi_access_token: str = ''
    archive_manifest_url: str = 'https://raw.githubusercontent.com/bangumi/Archive/master/aux/latest.json'
    llm_base_url: str = 'https://api.openai.com/v1'
    llm_api_key: str = ''
    llm_model: str = 'gpt-4o-mini'
    embedding_base_url: str = 'https://api.openai.com/v1'
    embedding_api_key: str = ''
    embedding_model: str = 'text-embedding-3-small'
    embedding_dim: int = Field(default=1536, ge=1, le=2000)
    embed_min_collects: int = Field(default=50, ge=0)
    tavily_api_key: str = ''
    web_search_enabled: bool = True
    tz: str = 'Asia/Shanghai'
    trusted_proxy_cidrs: list[str] = []
    cors_origins: list[str] = ['http://localhost:3000', 'http://127.0.0.1:3000']
    log_level: str = 'INFO'
    request_timeout: float = Field(default=20.0, gt=0)
    chat_max_message_length: int = Field(default=8000, ge=1)

    @field_validator('database_url', mode='before')
    @classmethod
    def async_database_url(cls, value: str) -> str:
        """兼容托管平台提供的 PostgreSQL URL。"""
        for prefix in ('postgres://', 'postgresql://'):
            if value.startswith(prefix):
                return value.replace(prefix, 'postgresql+asyncpg://', 1)
        return value


@lru_cache
def get_settings() -> Settings:
    """返回当前进程共享的配置对象。"""
    return Settings()
