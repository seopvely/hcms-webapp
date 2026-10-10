"""add_staff_session_and_audit_log

Revision ID: b7d2e4f6a8c1
Revises: a1f3c9d2e7b4
Create Date: 2026-10-11 00:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7d2e4f6a8c1'
down_revision: Union[str, Sequence[str], None] = 'a1f3c9d2e7b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'staff_session',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('user_id', sa.BigInteger(), nullable=False),
        sa.Column('stage', sa.String(length=10), nullable=False),
        sa.Column('csrf_hash', sa.String(length=64), nullable=True),
        sa.Column('pending_totp_secret', sa.String(length=64), nullable=True),
        sa.Column('attempts', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('last_seen_at', sa.DateTime(), nullable=True),
        sa.Column('revoked_at', sa.DateTime(), nullable=True),
        sa.Column('ip', sa.String(length=64), nullable=True),
        sa.Column('user_agent', sa.String(length=255), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('token_hash'),
    )
    op.create_index(op.f('ix_staff_session_user_id'), 'staff_session', ['user_id'], unique=False)

    op.create_table(
        'staff_audit_log',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.BigInteger(), nullable=True),
        sa.Column('action', sa.String(length=50), nullable=False),
        sa.Column('target', sa.String(length=254), nullable=True),
        sa.Column('detail', sa.Text(), nullable=True),
        sa.Column('ip', sa.String(length=64), nullable=True),
        sa.Column('user_agent', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_staff_audit_log_user_id'), 'staff_audit_log', ['user_id'], unique=False)
    op.create_index('ix_staff_audit_action_target_created', 'staff_audit_log', ['action', 'target', 'created_at'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_staff_audit_action_target_created', table_name='staff_audit_log')
    op.drop_index(op.f('ix_staff_audit_log_user_id'), table_name='staff_audit_log')
    op.drop_table('staff_audit_log')
    op.drop_index(op.f('ix_staff_session_user_id'), table_name='staff_session')
    op.drop_table('staff_session')
