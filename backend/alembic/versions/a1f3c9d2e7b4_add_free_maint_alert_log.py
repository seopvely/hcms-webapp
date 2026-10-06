"""add_free_maint_alert_log

Revision ID: a1f3c9d2e7b4
Revises: 9952ac03c607
Create Date: 2026-10-06 00:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1f3c9d2e7b4'
down_revision: Union[str, Sequence[str], None] = '9952ac03c607'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'free_maint_alert_log',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('kind', sa.String(length=20), nullable=False),
        sa.Column('target_date', sa.Date(), nullable=False),
        sa.Column('push_sent', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('sent_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('project_id', 'kind', 'target_date', name='uq_free_maint_alert'),
    )
    op.create_index(op.f('ix_free_maint_alert_log_project_id'), 'free_maint_alert_log', ['project_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_free_maint_alert_log_project_id'), table_name='free_maint_alert_log')
    op.drop_table('free_maint_alert_log')
