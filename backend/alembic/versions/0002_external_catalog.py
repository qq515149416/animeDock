"""Add expiring external catalog metadata without changing Bangumi IDs.

Revision ID: 0002
Revises: 0001
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg

revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('anime_external_source',
        sa.Column('anime_id', sa.BigInteger(), sa.ForeignKey('anime.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('provider', sa.String(30), primary_key=True),
        sa.Column('external_id', sa.String(64)),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('match_method', sa.String(30), nullable=False),
        sa.Column('payload', pg.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column('checked_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('last_accessed_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_anime_external_source_expires_at', 'anime_external_source', ['expires_at'])
    op.create_index('ix_anime_external_source_last_accessed_at', 'anime_external_source', ['last_accessed_at'])


def downgrade():
    op.drop_table('anime_external_source')
