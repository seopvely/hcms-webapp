"""add_job_run_claim_notification_event (스케줄러·outbox)

Revision ID: f7b9d1e3a5c6
Revises: e5a7c9d1f3b4
Create Date: 2026-10-11 00:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f7b9d1e3a5c6'
down_revision: Union[str, Sequence[str], None] = 'e5a7c9d1f3b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'job_run',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('job', sa.String(50), nullable=False),
        sa.Column('started_at', sa.DateTime(), nullable=False),
        sa.Column('finished_at', sa.DateTime(), nullable=True),
        sa.Column('status', sa.String(10), nullable=False),
        sa.Column('dry_run', sa.Boolean(), nullable=False),
        sa.Column('summary', sa.Text(), nullable=True),
        sa.Column('error', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_job_run_job', 'job_run', ['job'])
    op.create_table(
        'job_claim',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('job', sa.String(50), nullable=False),
        sa.Column('claim_key', sa.String(191), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('result', sa.String(20), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('job', 'claim_key', name='uq_job_claim'),
    )
    op.create_table(
        'notification_event',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('event_type', sa.String(50), nullable=False),
        sa.Column('ref_table', sa.String(50), nullable=True),
        sa.Column('ref_id', sa.Integer(), nullable=True),
        sa.Column('payload', sa.Text(), nullable=True),
        sa.Column('message', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('delivered_imessage_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_notification_event_event_type', 'notification_event', ['event_type'])


def downgrade() -> None:
    op.drop_index('ix_notification_event_event_type', table_name='notification_event')
    op.drop_table('notification_event')
    op.drop_table('job_claim')
    op.drop_index('ix_job_run_job', table_name='job_run')
    op.drop_table('job_run')
