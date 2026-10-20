"""创建动画、章节、关系、向量和隔离会话表。

Revision ID: 0001
Revises:
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg
from pgvector.sqlalchemy import Vector

from app.config import get_settings

revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """安装 pgvector 并创建与初始模型一致的完整结构。"""
    op.execute('CREATE EXTENSION IF NOT EXISTS vector')
    op.create_table('anime',
        sa.Column('id', sa.BigInteger(), primary_key=True, autoincrement=False),
        sa.Column('name', sa.Text(), nullable=False, server_default=''),
        sa.Column('name_cn', sa.Text(), nullable=False, server_default=''),
        sa.Column('aliases', pg.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column('summary', sa.Text(), nullable=False, server_default=''),
        sa.Column('category', sa.String(30), nullable=False, server_default='其他'),
        sa.Column('source', sa.String(30), nullable=False, server_default='其他'),
        sa.Column('region', sa.String(30), nullable=False, server_default='日本'),
        sa.Column('genres', pg.ARRAY(sa.Text()), nullable=False, server_default=sa.text("'{}'::text[]")),
        sa.Column('platform_raw', sa.Text(), nullable=False, server_default=''),
        sa.Column('air_date', sa.Date()),
        sa.Column('year', sa.Integer()),
        sa.Column('season', sa.String(10)),
        sa.Column('air_weekday', sa.Integer()),
        sa.Column('eps', sa.Integer()),
        sa.Column('studio', sa.Text(), nullable=False, server_default=''),
        sa.Column('director', sa.Text(), nullable=False, server_default=''),
        sa.Column('score', sa.Float(), nullable=False, server_default='0'),
        sa.Column('score_details', pg.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column('rank', sa.Integer()),
        sa.Column('collects', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('tags', pg.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column('meta_tags', pg.ARRAY(sa.Text()), nullable=False, server_default=sa.text("'{}'::text[]")),
        sa.Column('nsfw', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('image_url', sa.Text(), nullable=False, server_default=''),
        sa.Column('infobox_raw', sa.Text(), nullable=False, server_default=''),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_anime_year_season', 'anime', ['year', 'season'])
    for column in ('air_weekday', 'score', 'rank', 'nsfw'):
        op.create_index(f'ix_anime_{column}', 'anime', [column])
    op.create_index('ix_anime_genres', 'anime', ['genres'], postgresql_using='gin')
    op.create_table('episode',
        sa.Column('id', sa.BigInteger(), primary_key=True, autoincrement=False),
        sa.Column('anime_id', sa.BigInteger(), sa.ForeignKey('anime.id', ondelete='CASCADE'), nullable=False),
        sa.Column('sort', sa.Float(), nullable=False),
        sa.Column('type', sa.Integer(), nullable=False),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('name_cn', sa.Text(), nullable=False),
        sa.Column('airdate', sa.Date()),
        sa.Column('duration', sa.Text(), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
    )
    op.create_index('ix_episode_anime_id', 'episode', ['anime_id'])
    op.create_table('anime_relation',
        sa.Column('anime_id', sa.BigInteger(), sa.ForeignKey('anime.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('related_id', sa.BigInteger(), sa.ForeignKey('anime.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('relation_type', sa.String(100), primary_key=True),
    )
    op.create_table('anime_embedding',
        sa.Column('anime_id', sa.BigInteger(), sa.ForeignKey('anime.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('content_hash', sa.String(64), nullable=False),
        sa.Column('embedding', Vector(get_settings().embedding_dim), nullable=False),
    )
    op.create_index('ix_anime_embedding_hnsw', 'anime_embedding', ['embedding'], postgresql_using='hnsw', postgresql_ops={'embedding': 'vector_cosine_ops'}, postgresql_with={'m': 16, 'ef_construction': 64})
    op.create_table('chat_session',
        sa.Column('id', pg.UUID(as_uuid=True), primary_key=True),
        sa.Column('client_id', sa.String(128), nullable=False),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_chat_session_client_id', 'chat_session', ['client_id'])
    op.create_table('chat_message',
        sa.Column('id', sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column('session_id', pg.UUID(as_uuid=True), sa.ForeignKey('chat_session.id', ondelete='CASCADE'), nullable=False),
        sa.Column('role', sa.String(20), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('tool_calls', pg.JSONB()),
        sa.Column('sources', pg.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column('anime_refs', pg.ARRAY(sa.BigInteger()), nullable=False, server_default=sa.text("'{}'::bigint[]")),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_chat_message_session_id', 'chat_message', ['session_id'])


def downgrade() -> None:
    """按外键依赖逆序移除业务表，保留可能由其他应用使用的扩展。"""
    for table in ('chat_message', 'chat_session', 'anime_embedding', 'anime_relation', 'episode', 'anime'):
        op.drop_table(table)
