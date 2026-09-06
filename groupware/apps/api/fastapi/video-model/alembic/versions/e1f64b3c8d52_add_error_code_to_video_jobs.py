"""add error_code (render failure reason) to video_jobs

잡의 `error` 는 사람이 읽는 한 줄이고 벤더 원문이 섞여 있다. 소비자(csc-marketing, 화면)가 그
문장으로 "한도인지 크레딧인지" 를 가르면 벤더가 문구를 바꾸는 날 조용히 어긋난다. 그래서 사유를
코드로도 남긴다(app/domains/video/core/domain/render_failure.py 가 값 공간을 소유한다).

기존 행은 NULL 로 둔다. 지난 실패의 사유를 문장에서 역추론해 채우면 그것이 곧 소비자에게 금지한
일이고, 이미 끝난 잡의 알림은 다시 뜨지 않는다.

Revision ID: e1f64b3c8d52
Revises: d9e53a2c6f41
Create Date: 2026-09-04 10:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e1f64b3c8d52'
down_revision: Union[str, None] = 'd9e53a2c6f41'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('video_jobs', sa.Column('error_code', sa.String(length=40), nullable=True))


def downgrade() -> None:
    op.drop_column('video_jobs', 'error_code')
