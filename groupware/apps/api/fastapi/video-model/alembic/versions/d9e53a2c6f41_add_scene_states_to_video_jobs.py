"""add scene_states (per-scene render results) to video_jobs

COMPOSE 잡이 만든 씬별 클립을 잡 행에 영속한다.

씬 체크포인트는 성공 시 지워지고(compose) 24시간 TTL 이다. 그래서 완료된 잡의 씬별 클립 id 를
되살릴 방법이 없는데, 그 id 가 두 가지를 성립시킨다.

  1. 완료된 영상의 세그먼트 격자: 어느 칸이 무엇이 되었는지 보고 다시 만들 칸을 고른다.
  2. 씬 하나만 다시 만들기: 재실행 시 이 값으로 체크포인트를 되살려야 나머지 씬을 건너뛴다.
     없으면 전 씬이 다시 돌아 전액 재과금된다.

usage 와 같은 이유, 같은 자리다(progress/worker_alive 는 영속하지 않는 것과 대비된다).

JSONB 인 이유: 형태가 자란다(지금은 order/clip/billed/duration, 나중에 씬별 실패 사유 등).
usage, params 도 같은 이유로 JSONB 다.

기존 완료 잡의 씬별 클립은 진짜로 사라졌다(체크포인트 TTL). 결과 영상 하나만 남아 있고 그것을
씬으로 되쪼갤 방법이 없다. 그래서 NULL 로 남긴다. 이 잡들은 세그먼트 격자와 씬 재렌더를 쓰지 못하고,
그것이 사실이다. '모름' 을 빈 배열로 위장하면 화면이 "씬이 0개인 영상" 이라고 거짓말하게 된다.

Revision ID: d9e53a2c6f41
Revises: c8d42f1a7b30
Create Date: 2026-08-27 10:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'd9e53a2c6f41'
down_revision: Union[str, None] = 'c8d42f1a7b30'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'video_jobs',
        sa.Column('scene_states', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    # 백필 없음. 위 docstring 참고(기존 행의 씬별 클립은 복원 불가라 NULL 이 정답).


def downgrade() -> None:
    op.drop_column('video_jobs', 'scene_states')
