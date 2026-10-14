# backend/alembic/versions/a1f2b0c3d4e5_add_f2b_tables.py
"""add_f2b_tables (web1 Fail2Ban 차단 원인 분석)

Revision ID: a1f2b0c3d4e5
Revises: f7b9d1e3a5c6
Create Date: 2026-10-15 00:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1f2b0c3d4e5'
down_revision: Union[str, Sequence[str], None] = 'f7b9d1e3a5c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'f2b_ban',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('banned_at', sa.DateTime(), nullable=False),
        sa.Column('unbanned_at', sa.DateTime(), nullable=True),
        sa.Column('jail', sa.String(40), nullable=False),
        sa.Column('ip', sa.String(45), nullable=False),
        sa.Column('reason', sa.String(40), nullable=False),
        sa.Column('reason_detail', sa.String(255), nullable=False),
        sa.Column('site', sa.String(255), nullable=True),
        sa.Column('request_count', sa.Integer(), nullable=False),
        sa.Column('status_summary', sa.JSON(), nullable=True),
        sa.Column('user_agent', sa.String(500), nullable=True),
        sa.Column('country', sa.String(2), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('jail', 'ip', 'banned_at', name='uq_f2b_ban'),
    )
    op.create_index('ix_f2b_ban_banned_at', 'f2b_ban', ['banned_at'])
    op.create_index('ix_f2b_ban_reason_time', 'f2b_ban', ['reason', 'banned_at'])
    op.create_index('ix_f2b_ban_jail_time', 'f2b_ban', ['jail', 'banned_at'])
    op.create_index('ix_f2b_ban_ip', 'f2b_ban', ['ip'])
    op.create_table(
        'f2b_ban_evidence',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('ban_id', sa.BigInteger(), nullable=False),
        sa.Column('logged_at', sa.DateTime(), nullable=False),
        sa.Column('source_file', sa.String(255), nullable=False),
        sa.Column('line', sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['ban_id'], ['f2b_ban.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_f2b_ban_evidence_ban_id', 'f2b_ban_evidence', ['ban_id'])
    op.create_table(
        'f2b_ai_review',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('kind', sa.String(10), nullable=False),
        sa.Column('period_from', sa.DateTime(), nullable=False),
        sa.Column('period_to', sa.DateTime(), nullable=False),
        sa.Column('filters_json', sa.Text(), nullable=False),
        sa.Column('filters_hash', sa.String(64), nullable=False),
        sa.Column('result_md', sa.Text(), nullable=True),
        sa.Column('model', sa.String(20), nullable=False),
        sa.Column('status', sa.String(10), nullable=False),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('attempts', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_f2b_ai_review_kind_period', 'f2b_ai_review', ['kind', 'period_from'])
    op.create_index('ix_f2b_ai_review_filters_hash', 'f2b_ai_review', ['filters_hash'])


def downgrade() -> None:
    op.drop_table('f2b_ai_review')
    op.drop_table('f2b_ban_evidence')
    op.drop_table('f2b_ban')
