"""chat_sessions.enable_thinking: 대화별 사고형 추론(<think>) on/off

Revision ID: 0002_session_enable_thinking
Revises: 0001_initial
Create Date: 2026-07-03

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0002_session_enable_thinking"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 기존 세션은 사고 off 기본. server_default 로 채우고 NOT NULL 승격.
    op.add_column(
        "chat_sessions",
        sa.Column(
            "enable_thinking",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("chat_sessions", "enable_thinking")
