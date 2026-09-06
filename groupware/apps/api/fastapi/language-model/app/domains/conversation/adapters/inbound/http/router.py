"""Inbound Adapter: APIRouter -> Inbound Port (conversation 도메인).

세션 CRUD + 스트리밍 턴(SSE). 신원(org/user)은 get_identity 로 헤더에서 추출한다.
스트리밍은 sse-starlette 의 EventSourceResponse: 클라 연결 끊김 시 제너레이터가 취소되어
상위 추론 스트림(httpx)도 취소된다(GPU 슬롯 회수).
"""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.deps import get_identity
from app.domains.conversation.core.domain.errors import AssistantDisabledError
from app.domains.inference.core.domain.errors import (
    CredentialNotConfiguredError,
    InferenceEngineTimeoutError,
    InferenceEngineUnavailableError,
)
from csc_net_utils import require_services

from ....core.application.ports.inbound import ConversationInboundPort
from ....core.domain.types import IdentityRecord
from . import mappers
from .schemas import (
    CreateSessionRequest,
    MessageResponse,
    ModelResponse,
    SessionResponse,
    SetThinkingRequest,
    StreamTurnRequest,
)

# BFF(web-groupware/web-control-tower)만 대화 API 호출.
_CALLERS = require_services("web-groupware", "web-control-tower")


def get_conversation_service() -> ConversationInboundPort:
    # 실제 provider 는 app/container.py 에서 오버라이드된다.
    raise NotImplementedError


router = APIRouter(prefix="/conversations", tags=["conversation"])


@router.post("", response_model=SessionResponse, dependencies=[Depends(_CALLERS)])
async def create_session(
    body: CreateSessionRequest,
    identity: IdentityRecord = Depends(get_identity),
    service: ConversationInboundPort = Depends(get_conversation_service),
) -> SessionResponse:
    session = await service.create_session(
        identity, body.model, body.title, body.enable_thinking
    )
    return mappers.to_session_response(session)


@router.get("", response_model=list[SessionResponse], dependencies=[Depends(_CALLERS)])
async def list_sessions(
    identity: IdentityRecord = Depends(get_identity),
    service: ConversationInboundPort = Depends(get_conversation_service),
) -> list[SessionResponse]:
    sessions = await service.list_sessions(identity)
    return [mappers.to_session_response(s) for s in sessions]


@router.get(
    "/models", response_model=list[ModelResponse], dependencies=[Depends(_CALLERS)]
)
async def list_models(
    identity: IdentityRecord = Depends(get_identity),
    service: ConversationInboundPort = Depends(get_conversation_service),
) -> list[ModelResponse]:
    # 드롭다운 모델 목록 = 백엔드 카탈로그 SSOT. 외부(Claude) 모델은 조직 키 등록 여부로 가용성 오버라이드.
    # is_default 로 조직 기본 모델(미설정 시 내장 Qwen)을 표시해, 프론트가 새 대화의 초기 선택을
    # 자기 상수가 아니라 서버 값으로 정하게 한다.
    models = await service.list_models(identity)
    if not models:
        return []
    default_key = await service.resolve_default_model_key(identity)
    return [mappers.to_model_response(m, is_default=m.key == default_key) for m in models]


@router.get(
    "/{session_id}/messages",
    response_model=list[MessageResponse],
    dependencies=[Depends(_CALLERS)],
)
async def list_messages(
    session_id: str,
    identity: IdentityRecord = Depends(get_identity),
    service: ConversationInboundPort = Depends(get_conversation_service),
) -> list[MessageResponse]:
    try:
        messages = await service.list_messages(identity, session_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다.") from exc
    return [mappers.to_message_response(m) for m in messages]


@router.patch(
    "/{session_id}", response_model=SessionResponse, dependencies=[Depends(_CALLERS)]
)
async def set_thinking(
    session_id: str,
    body: SetThinkingRequest,
    identity: IdentityRecord = Depends(get_identity),
    service: ConversationInboundPort = Depends(get_conversation_service),
) -> SessionResponse:
    try:
        session = await service.set_thinking(identity, session_id, body.enable_thinking)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다.") from exc
    return mappers.to_session_response(session)


@router.delete("/{session_id}", status_code=204, dependencies=[Depends(_CALLERS)])
async def delete_session(
    session_id: str,
    identity: IdentityRecord = Depends(get_identity),
    service: ConversationInboundPort = Depends(get_conversation_service),
) -> None:
    await service.delete_session(identity, session_id)


@router.post("/{session_id}/stream", dependencies=[Depends(_CALLERS)])
async def stream_turn(
    session_id: str,
    body: StreamTurnRequest,
    identity: IdentityRecord = Depends(get_identity),
    service: ConversationInboundPort = Depends(get_conversation_service),
) -> EventSourceResponse:
    async def event_gen():
        usage = None
        try:
            async for chunk in service.stream_turn(
                identity, session_id, body.text, body.model, body.enable_thinking
            ):
                if chunk.usage is not None:
                    usage = chunk.usage
                if chunk.delta:
                    yield {"event": "token", "data": json.dumps({"delta": chunk.delta})}
            done = {
                "usage": (
                    {
                        "prompt": usage.prompt,
                        "completion": usage.completion,
                        "total": usage.total,
                    }
                    if usage
                    else None
                )
            }
            yield {"event": "done", "data": json.dumps(done)}
        except LookupError:
            yield {
                "event": "error",
                "data": json.dumps({"message": "세션을 찾을 수 없습니다."}),
            }
        except AssistantDisabledError as exc:
            # 플랫폼 전역 킬스위치가 꺼짐: 사용자에게 원인 메시지 전달.
            yield {"event": "error", "data": json.dumps({"message": str(exc)})}
        except CredentialNotConfiguredError as exc:
            # 외부 모델(Claude) 조직 키 미등록 등: 사용자에게 원인 메시지를 그대로 전달.
            yield {"event": "error", "data": json.dumps({"message": str(exc)})}
        except InferenceEngineTimeoutError:
            # 엔진은 살아 있고 느린 것(공유 GPU 혼잡): 연결 불가와 조치가 다르다.
            yield {
                "event": "error",
                "data": json.dumps(
                    {"message": "AI 추론 엔진(자체 LLM)이 시간 내에 응답하지 않았습니다(혼잡). 잠시 후 다시 시도해 주세요."}
                ),
            }
        except InferenceEngineUnavailableError:
            # 자체 호스팅 추론 엔진 미기동/네트워크(터널) 문제: 원인 구분 메시지.
            yield {
                "event": "error",
                "data": json.dumps(
                    {"message": "AI 추론 엔진(자체 LLM)에 연결할 수 없습니다. 엔진 상태를 확인해 주세요."}
                ),
            }
        except Exception:  # noqa: BLE001 - 클라에는 일반 메시지, 상세(벤더 에러 등)는 서버 로그.
            logging.getLogger(__name__).exception("stream_turn 처리 실패 (session=%s)", session_id)
            yield {
                "event": "error",
                "data": json.dumps({"message": "생성 중 오류가 발생했습니다."}),
            }

    return EventSourceResponse(event_gen())
