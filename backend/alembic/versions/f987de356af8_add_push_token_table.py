"""add_push_token_table

Revision ID: f987de356af8
Revises:
Create Date: 2026-02-13 23:03:00.363329

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f987de356af8'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'push_token',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('manager_seq', sa.Integer(), nullable=False),
        sa.Column('token', sa.String(length=512), nullable=False),
        sa.Column('platform', sa.String(length=10), nullable=False),
        sa.Column('device_id', sa.String(length=255), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('1')),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['manager_seq'], ['manager.seq']),
        sa.UniqueConstraint('token'),
    )
    op.create_index(op.f('ix_push_token_manager_seq'), 'push_token', ['manager_seq'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_push_token_manager_seq'), table_name='push_token')
    op.drop_table('push_token')
