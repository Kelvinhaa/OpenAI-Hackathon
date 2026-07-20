"""constrain concept edges to one directed pair per learning map

Revision ID: 20260720_01
Revises: 20260718_01
Create Date: 2026-07-20 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op


revision: str = "20260720_01"
down_revision: Union[str, Sequence[str], None] = "20260718_01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Preserve the earliest instance of any historical duplicate directed edge
    # before applying the invariant that prevents future duplicates.
    op.execute(
        """
        DELETE FROM concept_edges
        WHERE id NOT IN (
            SELECT MIN(id)
            FROM concept_edges
            GROUP BY study_session_id, prerequisite_node_id, dependent_node_id
        )
        """
    )
    with op.batch_alter_table("concept_edges") as batch_op:
        batch_op.create_unique_constraint(
            "uq_concept_edges_session_pair",
            ["study_session_id", "prerequisite_node_id", "dependent_node_id"],
        )


def downgrade() -> None:
    with op.batch_alter_table("concept_edges") as batch_op:
        batch_op.drop_constraint("uq_concept_edges_session_pair", type_="unique")
