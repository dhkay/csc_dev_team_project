"""공유 SQLAlchemy DeclarativeBase.

language-model 는 여러 도메인(conversation, retrieval)이 ORM 모델을 가지므로, Alembic 의
target_metadata 를 한 곳으로 모으기 위해 단일 Base 를 공유한다. 각 도메인 models.py 는
이 Base 를 import 해서 테이블을 선언한다("ORM 은 adapters/db 에만" 규칙은 유지).
"""

from __future__ import annotations

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
