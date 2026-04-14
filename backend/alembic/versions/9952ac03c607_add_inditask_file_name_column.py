"""add inditask_file_name column

Revision ID: 9952ac03c607
Revises: f987de356af8
Create Date: 2026-03-28 03:04:33.239742

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '9952ac03c607'
down_revision: Union[str, Sequence[str], None] = 'f987de356af8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('Inditask', sa.Column('inditask_file_name', sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column('Inditask', 'inditask_file_name')
