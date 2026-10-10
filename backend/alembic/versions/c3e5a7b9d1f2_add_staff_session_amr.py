"""add_staff_session_amr

Revision ID: c3e5a7b9d1f2
Revises: b7d2e4f6a8c1
Create Date: 2026-10-11 00:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3e5a7b9d1f2'
down_revision: Union[str, Sequence[str], None] = 'b7d2e4f6a8c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 세션이 실제로 통과한 인증 수단 (예: "pwd" / "pwd,otp") — SSO amr 판단용
    op.add_column('staff_session', sa.Column('amr', sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column('staff_session', 'amr')
