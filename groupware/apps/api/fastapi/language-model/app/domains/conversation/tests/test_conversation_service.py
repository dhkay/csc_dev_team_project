"""ConversationService 단위 테스트: Protocol Fake 주입(프레임워크 없이).

저장 순서(유저→스트림→어시스턴트+usage)와 테넌트 인자 관통을 검증한다.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from app.domains.conversation.core.application.services import ConversationService
from app.domains.conversation.core.domain.entities import ChatMessage, ChatSession
from app.domains.conversation.core.domain.types import IdentityRecord, MessageRole
from app.domains.inference.core.application.model_catalog import ModelCatalog
from app.domains.inference.core.domain.types import (
    GenerationChunkRecord,
    GenerationRequestRecord,
    ModelSpecRecord,
    TokenUsage,
)

IDENTITY = IdentityRecord(organization_id="o1", user_id="u1")


class FakeRepo:
    def __init__(self) -> None:
        self.sessions: dict[str, ChatSession] = {}
        self.messages: list[ChatMessage] = []

    async def create_session_record(self, session: ChatSession) -> ChatSession:
        self.sessions[session.id] = session
        return session

    async def find_session_record(self, organization_id, user_id, session_id):
        s = self.sessions.get(session_id)
        if s and s.organization_id == organization_id and s.user_id == user_id:
            return s
        return None

    async def find_session_records(self, organization_id, user_id):
        return [
            s
            for s in self.sessions.values()
            if s.organization_id == organization_id and s.user_id == user_id
        ]

    async def update_session_record(self, session: ChatSession) -> ChatSession:
        self.sessions[session.id] = session
        return session

    async def delete_session_record(self, organization_id, user_id, session_id):
        self.sessions.pop(session_id, None)

    async def create_message_record(self, message: ChatMessage) -> ChatMessage:
        self.messages.append(message)
        return message

    async def find_message_records(self, session_id):
        return [m for m in self.messages if m.session_id == session_id]


class FakeInference:
    def __init__(self) -> None:
        self.seen_req: GenerationRequestRecord | None = None

    async def generate(self, req):  # pragma: no cover - unused here
        raise NotImplementedError

    async def stream(self, req: GenerationRequestRecord) -> AsyncIterator[GenerationChunkRecord]:
        self.seen_req = req
        yield GenerationChunkRecord(delta="안녕")
        yield GenerationChunkRecord(delta="하세요")
        yield GenerationChunkRecord(
            delta="", finish_reason="stop", usage=TokenUsage(prompt=3, completion=2, total=5)
        )

    async def embed(self, req):  # pragma: no cover
        return []

    async def aclose(self):  # pragma: no cover
        return None


def _catalog() -> ModelCatalog:
    return ModelCatalog(
        {"qwen": ModelSpecRecord(key="qwen", served_model_name="qwen3-14b", kind="chat")},
        default_key="qwen",
    )


def _service(repo: FakeRepo, inference: FakeInference) -> ConversationService:
    return ConversationService(repo, inference, _catalog(), "테스트 시스템 프롬프트")


async def test_create_session_scopes_to_identity() -> None:
    repo = FakeRepo()
    svc = _service(repo, FakeInference())
    session = await svc.create_session(IDENTITY, model=None, title=None)
    assert session.organization_id == "o1"
    assert session.user_id == "u1"
    assert session.model == "qwen"


async def test_stream_turn_persists_user_then_assistant_with_usage() -> None:
    repo = FakeRepo()
    inference = FakeInference()
    svc = _service(repo, inference)
    session = await svc.create_session(IDENTITY, model="qwen", title=None)

    chunks = [c async for c in svc.stream_turn(IDENTITY, session.id, "테스트", None)]

    # 방출된 delta 는 어시스턴트 텍스트를 이룬다.
    text = "".join(c.delta for c in chunks)
    assert text == "안녕하세요"

    roles = [m.role for m in repo.messages]
    assert roles == [MessageRole.USER, MessageRole.ASSISTANT]
    assistant = repo.messages[-1]
    assert assistant.content == "안녕하세요"
    assert assistant.token_usage == TokenUsage(prompt=3, completion=2, total=5)

    # 카탈로그가 served 이름으로 resolve 되어 추론에 전달됐다.
    assert inference.seen_req is not None
    assert inference.seen_req.model == "qwen3-14b"
    # 시스템 프롬프트 + 유저 메시지가 포함됐다.
    assert inference.seen_req.messages[0].role == "system"
    assert inference.seen_req.messages[-1].content == "테스트"

    # 첫 턴 → 제목 자동 설정.
    assert repo.sessions[session.id].title == "테스트"


async def test_stream_turn_unknown_session_raises() -> None:
    repo = FakeRepo()
    svc = _service(repo, FakeInference())
    import pytest

    with pytest.raises(LookupError):
        _ = [c async for c in svc.stream_turn(IDENTITY, "nope", "x", None)]


async def test_stream_turn_enable_thinking_flows_and_persists() -> None:
    repo = FakeRepo()
    inference = FakeInference()
    svc = _service(repo, inference)
    session = await svc.create_session(IDENTITY, model="qwen", title=None)
    assert session.enable_thinking is False  # 기본 off

    # 대화창에서 사고 on 토글 → 이 턴에 반영 + 세션에 영속.
    _ = [c async for c in svc.stream_turn(IDENTITY, session.id, "x", None, enable_thinking=True)]

    assert inference.seen_req is not None
    assert inference.seen_req.enable_thinking is True
    assert repo.sessions[session.id].enable_thinking is True

    # 이후 턴은 토글을 안 넘겨도(None) 세션 저장값(True)을 유지한다.
    inference.seen_req = None
    _ = [c async for c in svc.stream_turn(IDENTITY, session.id, "y", None)]
    assert inference.seen_req is not None
    assert inference.seen_req.enable_thinking is True


async def test_set_thinking_persists_without_touching_title() -> None:
    repo = FakeRepo()
    svc = _service(repo, FakeInference())
    session = await svc.create_session(IDENTITY, model="qwen", title="유지")

    updated = await svc.set_thinking(IDENTITY, session.id, enable_thinking=True)
    assert updated.enable_thinking is True
    assert updated.title == "유지"  # 제목은 건드리지 않음


async def test_cross_tenant_session_not_found() -> None:
    repo = FakeRepo()
    svc = _service(repo, FakeInference())
    session = await svc.create_session(IDENTITY, model="qwen", title=None)
    other = IdentityRecord(organization_id="o2", user_id="u1")
    assert await svc.get_session(other, session.id) is None


class _Resolver:
    """CredentialResolverPort 가짜: 조직 키 등록 여부를 주입."""

    def __init__(self, registered: bool) -> None:
        self._registered = registered

    async def resolve(self, organization_id, provider):
        return {"apiKey": "k"} if self._registered else None

    async def has(self, organization_id, provider) -> bool:
        return self._registered


def _mixed_catalog() -> ModelCatalog:
    return ModelCatalog(
        {
            "qwen": ModelSpecRecord(
                key="qwen", served_model_name="q", kind="chat",
                provider="internal", available=True,
            ),
            "claude-sonnet": ModelSpecRecord(
                key="claude-sonnet", served_model_name="claude-sonnet-5", kind="chat",
                provider="anthropic", credential_provider="ANTHROPIC",
                vendor="Anthropic", available=True,
            ),
        },
        default_key="qwen",
    )


async def test_list_models_gates_external_by_org_credential() -> None:
    # 미등록 조직 → external(Claude) available=False, internal 은 그대로.
    svc = ConversationService(FakeRepo(), FakeInference(), _mixed_catalog(), "테스트 시스템 프롬프트", _Resolver(False))
    by = {m.key: m for m in await svc.list_models(IDENTITY)}
    assert by["qwen"].available is True
    assert by["claude-sonnet"].available is False

    # 등록 조직 → external available=True.
    svc2 = ConversationService(FakeRepo(), FakeInference(), _mixed_catalog(), "테스트 시스템 프롬프트", _Resolver(True))
    by2 = {m.key: m for m in await svc2.list_models(IDENTITY)}
    assert by2["claude-sonnet"].available is True


async def test_stream_turn_external_without_credential_raises() -> None:
    from app.domains.inference.core.domain.errors import CredentialNotConfiguredError

    import pytest

    svc = ConversationService(FakeRepo(), FakeInference(), _mixed_catalog(), "테스트 시스템 프롬프트", _Resolver(False))
    session = await svc.create_session(IDENTITY, model="claude-sonnet", title=None)
    with pytest.raises(CredentialNotConfiguredError):
        _ = [c async for c in svc.stream_turn(IDENTITY, session.id, "hi", "claude-sonnet")]
