"""add client_request_id (호출자 멱등키) to video_jobs

호출자가 같은 요청을 다시 보내도 유료 잡이 두 번 만들어지지 않게 한다.

호출자(csc-marketing 의 사가)는 벤더 호출과 자기 진행 기록 사이에서 죽을 수 있다. 그 폭은 DB 쓰기
한 번이지만, 그 사이에서 죽으면 재실행이 그 단계를 한 번 더 돌린다. 호출자 쪽에서는 이것을 닫을
방법이 없다: 이미 만들어진 잡을 알아보는 것은 잡을 만든 쪽만 할 수 있다. 그래서 키를 받아 이 서버가
접는다. 접지 않으면 요금이 두 번 나가고, 나중에 붙은 잡만 폴링되므로 먼저 만든 잡은 아무도 보지
않는 고아가 된다.

키를 보내지 않는 호출자(구 클라이언트, 키가 의미 없는 경로)를 막지 않아야 한다. NULL 은 유니크에서
서로 다르게 취급되므로 `WHERE client_request_id IS NOT NULL` 로 키가 있을 때만 유일하게 만든다.
이 인덱스는 최후 방어선이다: 사전 조회를 통과한 두 요청이 동시에 등록해도 하나만 남고, 진 쪽은
재조회해서 이긴 잡을 받는다.

기존 잡의 호출자 키는 존재하지 않았다. NULL 이 사실이다.

Revision ID: c8d42f1a7b30
Revises: b7c31e4d2a90
Create Date: 2026-08-20 18:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c8d42f1a7b30'
down_revision: Union[str, None] = 'b7c31e4d2a90'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'video_jobs',
        sa.Column('client_request_id', sa.String(length=160), nullable=True),
    )
    op.create_index(
        'video_jobs_client_request_uq',
        'video_jobs',
        ['client_request_id'],
        unique=True,
        postgresql_where=sa.text('client_request_id IS NOT NULL'),
    )


def downgrade() -> None:
    op.drop_index('video_jobs_client_request_uq', table_name='video_jobs')
    op.drop_column('video_jobs', 'client_request_id')