"""add optional exam date to study sessions

Revision ID: 20260720_02
Revises: 20260720_01
Create Date: 2026-07-20 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260720_02"
down_revision: Union[str, Sequence[str], None] = "20260720_01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("study_sessions") as batch_op:
        batch_op.add_column(sa.Column("exam_date", sa.Date(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("study_sessions") as batch_op:
        batch_op.drop_column("exam_date")
