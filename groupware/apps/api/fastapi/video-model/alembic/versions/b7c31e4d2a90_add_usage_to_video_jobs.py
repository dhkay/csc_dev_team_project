"""add usage (billable render units) to video_jobs

렌더 1건이 외부 벤더에 발생시킨 청구 단위를 영속한다(동결 비용의 근거).

청구 초는 provider 가 벤더에 제출하는 시점에만 알 수 있고, COMPOSE 는 성공 시 씬 체크포인트를
지운다. 클램프된 정수초는 params.scenes(나레이션 보유)에서 복원할 수 없으므로, 완료를 관측한
폴링이 한 번 유실되면 그 렌더의 청구 근거가 영구히 사라진다. progress/worker_alive 와 달리
이 값을 영속하는 이유가 그것이다.

JSONB 인 이유: 형태가 자란다(지금은 씬별 배열, 나중에 다른 벤더 단위). params 도 같은 이유로 JSONB 다.

기존 행의 청구 초는 진짜로 모른다. params.scenes 에서 합성하면 나레이션 길이(2.0~20.0 float)를
쓰게 되는데 그건 벤더가 청구한 값(정수초 1~15)이 아니라 조작된 숫자다. 그래서 NULL 로 남긴다
'모름' 을 '0' 이나 그럴듯한 추정치로 위장하지 않는다.

Revision ID: b7c31e4d2a90
Revises: a5ad1960b9cf
Create Date: 2026-07-29 17:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'b7c31e4d2a90'
down_revision: Union[str, None] = 'a5ad1960b9cf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'video_jobs',
        sa.Column('usage', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    # 백필 없음. 위 docstring 참고(기존 행의 청구 초는 복원 불가라 NULL 이 정답).


def downgrade() -> None:
    op.drop_column('video_jobs', 'usage')
