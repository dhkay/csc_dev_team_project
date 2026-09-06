"""ClickHouse 마이그레이션 러너: Alembic 대체.

ClickHouse 는 Alembic 을 쓸 수 없어(SQLAlchemy 방언 부재) 최소한의 러너를 직접 둔다.
Drizzle/Alembic 과 같은 계약을 지킨다:

- 버전 파일(`migrations/NNNN_*.sql`)을 이름 순으로 적용한다.
- 적용 이력을 `schema_migrations` 에 남겨 재실행이 안전하다(멱등).
- 이미 적용된 파일이 사후 수정되면 체크섬 불일치로 거부한다. 환경 간 스키마 표류를
  조용히 넘기지 않는다(Drizzle 의 hash mismatch 와 같은 취지).
- 실패하면 비영(非零) 종료 → 컨테이너 기동 실패 → 스키마와 코드의 불일치가 배포되지 않는다.

컨테이너 command 에서 `python clickhouse/migrate.py && uvicorn ...` 로 실행한다.
`deploy.sh` 는 Drizzle 의 db-migrate 만 돌리므로 FastAPI 앱은 자기 마이그레이션을
자기 command 에서 돌리는 것이 이 레포의 규약이다.
"""

from __future__ import annotations

import hashlib
import logging
import pathlib
import sys

import clickhouse_connect

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from app.config import get_settings  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s [migrate] %(message)s")
_logger = logging.getLogger(__name__)

MIGRATIONS_DIR = pathlib.Path(__file__).resolve().parent / "migrations"


def main() -> int:
    settings = get_settings()

    # 첫 기동엔 DB 자체가 없다. 이 문장만 default DB 로 붙어 실행한다.
    bootstrap = clickhouse_connect.get_client(
        host=settings.clickhouse_host,
        port=settings.clickhouse_port,
        username=settings.clickhouse_user,
        password=settings.clickhouse_password,
    )
    bootstrap.command(f"CREATE DATABASE IF NOT EXISTS {settings.clickhouse_database}")
    bootstrap.close()

    client = clickhouse_connect.get_client(
        host=settings.clickhouse_host,
        port=settings.clickhouse_port,
        database=settings.clickhouse_database,
        username=settings.clickhouse_user,
        password=settings.clickhouse_password,
    )
    try:
        _ensure_history_table(client)
        applied = _load_applied(client)

        files = sorted(MIGRATIONS_DIR.glob("*.sql"))
        if not files:
            _logger.warning("마이그레이션 파일이 없습니다: %s", MIGRATIONS_DIR)
            return 0

        for path in files:
            body = path.read_text(encoding="utf-8")
            checksum = hashlib.sha256(body.encode()).hexdigest()

            if path.name in applied:
                if applied[path.name] != checksum:
                    _logger.error(
                        "체크섬 불일치: %s. 이미 적용된 마이그레이션이 수정되었습니다. "
                        "적용된 파일은 고치지 말고 새 파일을 추가하세요.",
                        path.name,
                    )
                    return 1
                continue

            _logger.info("적용: %s", path.name)
            for statement in _split_statements(body):
                client.command(statement)
            client.insert(
                "schema_migrations",
                [[path.name, checksum]],
                column_names=["name", "checksum"],
            )

        _logger.info("마이그레이션 완료 (%d개 확인)", len(files))
        return 0
    finally:
        client.close()


def _ensure_history_table(client) -> None:  # noqa: ANN001
    client.command(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations
        (
            name       String,
            checksum   String,
            applied_at DateTime DEFAULT now()
        )
        ENGINE = MergeTree()
        ORDER BY name
        """
    )


def _load_applied(client) -> dict[str, str]:  # noqa: ANN001
    result = client.query("SELECT name, checksum FROM schema_migrations")
    return {row[0]: row[1] for row in result.result_rows}


def _split_statements(body: str) -> list[str]:
    """세미콜론 기준 분리: ClickHouse HTTP 는 한 번에 한 문장만 받는다.

    주석 줄(`--`)은 제거한다. 문자열 리터럴 안의 세미콜론은 다루지 않는다
    DDL 전용이라 그런 경우가 없고, 필요해지면 그때 파서를 올릴 것.
    """
    stripped = "\n".join(
        line for line in body.splitlines() if not line.strip().startswith("--")
    )
    return [s.strip() for s in stripped.split(";") if s.strip()]


if __name__ == "__main__":
    raise SystemExit(main())
