"""PostgreSQL 业务表与 pgvector 向量模型。"""
from datetime import date, datetime
from typing import Any
from uuid import UUID, uuid4

from pgvector.sqlalchemy import Vector
from sqlalchemy import BigInteger, Boolean, Date, DateTime, Float, ForeignKey, Index, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.config import get_settings
from app.db import Base


class Anime(Base):
    """以 Bangumi subject id 为主键的动画条目。"""

    __tablename__ = 'anime'
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    name: Mapped[str] = mapped_column(Text, default='', server_default='')
    name_cn: Mapped[str] = mapped_column(Text, default='', server_default='')
    aliases: Mapped[list[str]] = mapped_column(JSONB, default=list, server_default=text("'[]'::jsonb"))
    summary: Mapped[str] = mapped_column(Text, default='', server_default='')
    category: Mapped[str] = mapped_column(String(30), default='其他', server_default='其他')
    source: Mapped[str] = mapped_column(String(30), default='其他', server_default='其他')
    region: Mapped[str] = mapped_column(String(30), default='日本', server_default='日本')
    genres: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list, server_default=text("'{}'::text[]"))
    platform_raw: Mapped[str] = mapped_column(Text, default='', server_default='')
    air_date: Mapped[date | None] = mapped_column(Date)
    year: Mapped[int | None] = mapped_column(Integer)
    season: Mapped[str | None] = mapped_column(String(10))
    air_weekday: Mapped[int | None] = mapped_column(Integer)
    eps: Mapped[int | None] = mapped_column(Integer)
    studio: Mapped[str] = mapped_column(Text, default='', server_default='')
    director: Mapped[str] = mapped_column(Text, default='', server_default='')
    score: Mapped[float] = mapped_column(Float, default=0.0, server_default='0')
    score_details: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))
    rank: Mapped[int | None] = mapped_column(Integer)
    collects: Mapped[int] = mapped_column(Integer, default=0, server_default='0')
    tags: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list, server_default=text("'[]'::jsonb"))
    meta_tags: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list, server_default=text("'{}'::text[]"))
    nsfw: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text('false'))
    image_url: Mapped[str] = mapped_column(Text, default='', server_default='')
    infobox_raw: Mapped[str] = mapped_column(Text, default='', server_default='')
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    __table_args__ = (
        Index('ix_anime_year_season', 'year', 'season'),
        Index('ix_anime_air_weekday', 'air_weekday'),
        Index('ix_anime_score', 'score'),
        Index('ix_anime_rank', 'rank'),
        Index('ix_anime_nsfw', 'nsfw'),
        Index('ix_anime_genres', 'genres', postgresql_using='gin'),
    )


class Episode(Base):
    """动画章节，sort 支持 0.5 等特别篇编号。"""

    __tablename__ = 'episode'
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    anime_id: Mapped[int] = mapped_column(ForeignKey('anime.id', ondelete='CASCADE'), index=True)
    sort: Mapped[float] = mapped_column(Float, default=0.0)
    type: Mapped[int] = mapped_column(Integer, default=0)
    name: Mapped[str] = mapped_column(Text, default='')
    name_cn: Mapped[str] = mapped_column(Text, default='')
    airdate: Mapped[date | None] = mapped_column(Date)
    duration: Mapped[str] = mapped_column(Text, default='')
    description: Mapped[str] = mapped_column(Text, default='')


class AnimeRelation(Base):
    """动画之间的关系，目标必须是已入库动画。"""

    __tablename__ = 'anime_relation'
    anime_id: Mapped[int] = mapped_column(ForeignKey('anime.id', ondelete='CASCADE'), primary_key=True)
    related_id: Mapped[int] = mapped_column(ForeignKey('anime.id', ondelete='CASCADE'), primary_key=True)
    relation_type: Mapped[str] = mapped_column(String(100), primary_key=True)


class AnimeEmbedding(Base):
    """按文本哈希增量更新的语义向量。"""

    __tablename__ = 'anime_embedding'
    anime_id: Mapped[int] = mapped_column(ForeignKey('anime.id', ondelete='CASCADE'), primary_key=True)
    content_hash: Mapped[str] = mapped_column(String(64))
    embedding: Mapped[list[float]] = mapped_column(Vector(get_settings().embedding_dim))
    __table_args__ = (
        Index('ix_anime_embedding_hnsw', 'embedding', postgresql_using='hnsw', postgresql_ops={'embedding': 'vector_cosine_ops'}, postgresql_with={'m': 16, 'ef_construction': 64}),
    )


class ChatSession(Base):
    """由匿名客户端 ID 隔离的会话。"""

    __tablename__ = 'chat_session'
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    client_id: Mapped[str] = mapped_column(String(128), index=True)
    title: Mapped[str] = mapped_column(String(200), default='新对话')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ChatMessage(Base):
    """会话消息及结构化来源，删除会话时级联删除。"""

    __tablename__ = 'chat_message'
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    session_id: Mapped[UUID] = mapped_column(ForeignKey('chat_session.id', ondelete='CASCADE'), index=True)
    role: Mapped[str] = mapped_column(String(20))
    content: Mapped[str] = mapped_column(Text, default='')
    tool_calls: Mapped[list[dict[str, Any]] | dict[str, Any] | None] = mapped_column(JSONB)
    sources: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list, server_default=text("'[]'::jsonb"))
    anime_refs: Mapped[list[int]] = mapped_column(ARRAY(BigInteger), default=list, server_default=text("'{}'::bigint[]"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
