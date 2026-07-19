"""add learning map persistence

Revision ID: 20260718_01
Revises: a1b2c3d4e5f6
Create Date: 2026-07-18 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260718_01"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "concept_nodes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("study_session_id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("explanation", sa.String(), nullable=False),
        sa.Column("retrieval_prompt", sa.String(), nullable=False),
        sa.Column("last_reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_review_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("interval_days", sa.Integer(), server_default="1", nullable=False),
        sa.Column("stability", sa.Float(), server_default="0", nullable=False),
        sa.Column("difficulty", sa.Float(), server_default="0", nullable=False),
        sa.Column("last_rating", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["study_session_id"], ["study_sessions.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("study_session_id", "key", name="uq_concept_nodes_session_key"),
        sa.UniqueConstraint("study_session_id", "id", name="uq_concept_nodes_session_id"),
        sa.CheckConstraint(
            "last_rating IS NULL OR (last_rating >= 1 AND last_rating <= 4)",
            name="ck_concept_nodes_last_rating_range",
        ),
    )
    op.create_index(
        op.f("ix_concept_nodes_study_session_id"),
        "concept_nodes",
        ["study_session_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_concept_nodes_next_review_at"),
        "concept_nodes",
        ["next_review_at"],
        unique=False,
    )

    op.create_table(
        "concept_edges",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("study_session_id", sa.Integer(), nullable=False),
        sa.Column("prerequisite_node_id", sa.Integer(), nullable=False),
        sa.Column("dependent_node_id", sa.Integer(), nullable=False),
        sa.CheckConstraint(
            "prerequisite_node_id <> dependent_node_id",
            name="ck_concept_edges_not_self_referential",
        ),
        sa.ForeignKeyConstraint(
            ["study_session_id", "dependent_node_id"],
            ["concept_nodes.study_session_id", "concept_nodes.id"],
            name="fk_concept_edges_dependent_node_session",
        ),
        sa.ForeignKeyConstraint(
            ["study_session_id", "prerequisite_node_id"],
            ["concept_nodes.study_session_id", "concept_nodes.id"],
            name="fk_concept_edges_prerequisite_node_session",
        ),
        sa.ForeignKeyConstraint(["study_session_id"], ["study_sessions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_concept_edges_study_session_id"),
        "concept_edges",
        ["study_session_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_concept_edges_prerequisite_node_id"),
        "concept_edges",
        ["prerequisite_node_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_concept_edges_dependent_node_id"),
        "concept_edges",
        ["dependent_node_id"],
        unique=False,
    )

    op.create_table(
        "concept_review_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("concept_node_id", sa.Integer(), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("answer", sa.String(), nullable=True),
        sa.Column(
            "reviewed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["concept_node_id"], ["concept_nodes.id"]),
        sa.CheckConstraint(
            "rating >= 1 AND rating <= 4", name="ck_concept_review_events_rating"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_concept_review_events_concept_node_id"),
        "concept_review_events",
        ["concept_node_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_concept_review_events_concept_node_id"),
        table_name="concept_review_events",
    )
    op.drop_table("concept_review_events")
    op.drop_index(op.f("ix_concept_edges_dependent_node_id"), table_name="concept_edges")
    op.drop_index(
        op.f("ix_concept_edges_prerequisite_node_id"), table_name="concept_edges"
    )
    op.drop_index(op.f("ix_concept_edges_study_session_id"), table_name="concept_edges")
    op.drop_table("concept_edges")
    op.drop_index(op.f("ix_concept_nodes_next_review_at"), table_name="concept_nodes")
    op.drop_index(op.f("ix_concept_nodes_study_session_id"), table_name="concept_nodes")
    op.drop_table("concept_nodes")
