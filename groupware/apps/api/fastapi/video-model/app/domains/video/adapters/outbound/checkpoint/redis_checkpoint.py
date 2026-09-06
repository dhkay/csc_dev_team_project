"""SceneCheckpointPort 구현: redis 해시로 씬별 진행을 durable 하게 기록.

키: `videojob:ckpt:{job_id}`, 필드=씬 order(str), 값=JSON {"prompt_id"?, "clip_file_id"?, "billed_seconds"?}.
워커가 죽어도(로컬 temp 소멸) redis 에 남아, 재시도/재시작이 완료 씬을 건너뛰고 진행 중 렌더를 재폴링한다.
TTL 로 자동 만료(잡이 끝났는데 clear 를 못 한 경우도 결국 정리).
"""

from __future__ import annotations

import json
from typing import Any

import redis.asyncio as redis

_TTL_SECONDS = 24 * 3600  # 하루: 이 안에 안 끝나면 어차피 실패로 스위핑됨.


def _key(job_id: str) -> str:
    return f"videojob:ckpt:{job_id}"


class RedisSceneCheckpoint:
    """SceneCheckpointPort(Protocol) 구현."""

    def __init__(self, redis_url: str) -> None:
        # decode_responses=True → 필드/값을 str 로 다룬다(JSON 파싱 편의).
        self._client = redis.from_url(redis_url, decode_responses=True)

    async def load(self, job_id: str) -> dict[int, dict[str, Any]]:
        raw = await self._client.hgetall(_key(job_id))
        out: dict[int, dict[str, Any]] = {}
        for field, value in raw.items():
            try:
                out[int(field)] = json.loads(value)
            except (ValueError, json.JSONDecodeError):
                continue  # 손상 필드는 무시(재렌더로 자가치유).
        return out

    async def save_scene(
        self,
        job_id: str,
        order: int,
        *,
        prompt_id: str | None = None,
        clip_file_id: str | None = None,
        billed_seconds: int | None = None,
    ) -> None:
        key = _key(job_id)
        field = str(order)
        # 부분 병합: 기존 필드(prompt_id 등)를 보존하며 갱신.
        existing_raw = await self._client.hget(key, field)
        state: dict[str, Any] = {}
        if existing_raw:
            try:
                state = json.loads(existing_raw)
            except json.JSONDecodeError:
                state = {}
        if prompt_id is not None:
            state["prompt_id"] = prompt_id
        if clip_file_id is not None:
            state["clip_file_id"] = clip_file_id
        if billed_seconds is not None:
            # 청구 초는 제출 시점에 확정된다. 재개 시 이 값을 읽어 합계를 복원한다.
            state["billed_seconds"] = billed_seconds
        # hset + expire 는 독립이라 파이프라인으로 묶어 왕복 1회로 처리(병합용 hget 은 위에서 선행).
        pipe = self._client.pipeline(transaction=False)
        pipe.hset(key, field, json.dumps(state))
        pipe.expire(key, _TTL_SECONDS)
        await pipe.execute()

    async def drop_scene_handle(self, job_id: str, order: int) -> None:
        """씬 상태에서 prompt_id 만 제거(부분 갱신): 완성 클립/청구 초는 남긴다.

        전체 clear 를 쓰지 않는 이유: 다른 씬의 완성 클립까지 버려 GPU/벤더 재작업이 발생한다.
        """
        key, field = _key(job_id), str(order)
        raw = await self._client.hget(key, field)
        if not raw:
            return
        try:
            state = json.loads(raw)
        except json.JSONDecodeError:
            return  # 손상 필드는 어차피 무시된다(load 가 걸러낸다).
        if state.pop("prompt_id", None) is None:
            return
        await self._client.hset(key, field, json.dumps(state))

    async def drop_scene(self, job_id: str, order: int) -> None:
        """그 씬 필드를 통째로 삭제. 다음 실행은 이 씬만 처음부터 만든다(다른 씬은 건너뛴다)."""
        await self._client.hdel(_key(job_id), str(order))

    async def clear(self, job_id: str) -> None:
        await self._client.delete(_key(job_id))


class NullSceneCheckpoint:
    """무동작 체크포인트: 체크포인트 저장소 없이도 compose 가 동작하게(재개 없음, 매번 새로 렌더).

    테스트/폴백용. 실제 재개를 원하면 RedisSceneCheckpoint 를 주입한다.
    """

    async def load(self, job_id: str) -> dict[int, dict[str, Any]]:
        return {}

    async def save_scene(
        self,
        job_id: str,
        order: int,
        *,
        prompt_id: str | None = None,
        clip_file_id: str | None = None,
        billed_seconds: int | None = None,
    ) -> None:
        return None

    async def drop_scene_handle(self, job_id: str, order: int) -> None:
        return None

    async def drop_scene(self, job_id: str, order: int) -> None:
        return None

    async def clear(self, job_id: str) -> None:
        return None
