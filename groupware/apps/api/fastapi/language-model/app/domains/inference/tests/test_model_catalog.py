"""ModelCatalog 단위 테스트: 드롭다운 SSOT(chat_models) + 추론 폴백(resolve_chat)."""

from __future__ import annotations

from app.domains.inference.core.application.model_catalog import ModelCatalog
from app.domains.inference.core.domain.types import ModelSpecRecord


def _catalog() -> ModelCatalog:
    specs = {
        "qwen": ModelSpecRecord(
            key="qwen",
            served_model_name="qwen3-14b",
            kind="chat",
            label="Qwen",
            provider="internal",
            available=True,
            supports_thinking=True,
        ),
        "opus": ModelSpecRecord(
            key="opus",
            served_model_name="opus",
            kind="chat",
            label="Opus",
            provider="external",
            available=False,
        ),
        "qwen-embed": ModelSpecRecord(
            key="qwen-embed", served_model_name="qwen-embed", kind="embedding"
        ),
    }
    return ModelCatalog(specs, default_key="qwen")


def test_chat_models_excludes_embedding_and_orders_available_first() -> None:
    models = _catalog().chat_models()
    keys = [m.key for m in models]
    assert keys == ["qwen", "opus"]  # embedding 제외, 사용가능(qwen) 먼저
    assert models[0].supports_thinking is True
    assert models[1].available is False


def test_resolve_chat_falls_back_for_unavailable_or_unknown() -> None:
    cat = _catalog()
    # 준비중(available=False) → 기본 chat 모델로 폴백.
    assert cat.resolve_chat("opus").key == "qwen"
    # 미지 key → 폴백.
    assert cat.resolve_chat("nope").key == "qwen"
    # embedding key → chat 아니므로 폴백.
    assert cat.resolve_chat("qwen-embed").key == "qwen"
    # 정상 chat key → 그대로.
    assert cat.resolve_chat("qwen").served_model_name == "qwen3-14b"


def test_display_label_falls_back_to_key() -> None:
    spec = ModelSpecRecord(key="foo", served_model_name="foo")
    assert spec.display_label == "foo"


class TestClaudeOutputWindow:
    """Claude 스펙이 출력 창을 선언한다.

    선언이 없으면 `output_budget` 이 깎지 못하고 호출자가 보낸 값이 그대로 벤더로 나간다.
    그러면 창을 넘긴 요청이 400 으로 거절되고, 호출자는 벤더 창을 스스로 추측하게 된다. 실제로
    csc-marketing 이 그 추측(고정 천장)을 들고 있었고, 그 값이 실제 창보다 훨씬 작아 큰 요청이
    이유 없이 모자란 예산을 받았다.

    값의 근거는 실측이다(`_CLAUDE_MAX_OUTPUT_TOKENS` 주석). 여기서는 선언되어 있다는 사실과
    그 값이 벤더가 받아 주는 범위 안이라는 것만 잠근다: 숫자를 그대로 박으면 창이 넓어질 때
    테스트가 먼저 막는다.
    """

    def test_every_claude_spec_declares_a_window(self) -> None:
        from app.domains.inference.core.application.model_catalog import _EXTERNAL_DEFAULTS

        claude = [m for m in _EXTERNAL_DEFAULTS if m.provider == "anthropic"]
        assert claude, "외부 기본 모델에 Claude 가 하나도 없다"
        for spec in claude:
            assert spec.max_output_tokens, f"{spec.key} 가 출력 창을 선언하지 않았다"

    def test_declared_window_is_within_the_measured_limit(self) -> None:
        # 실측: haiku 는 80,000 에서 거절됐다. 선언값이 그 위로 올라가면 클램프가 통과시킨 요청을
        #   벤더가 거절하게 되므로, 깎는 의미가 사라진다.
        from app.domains.inference.core.application.model_catalog import _EXTERNAL_DEFAULTS

        for spec in (m for m in _EXTERNAL_DEFAULTS if m.provider == "anthropic"):
            assert spec.max_output_tokens is not None
            assert spec.max_output_tokens <= 64_000


class TestChatFallbackIsLoud:
    """고른 모델이 아닌 모델이 답을 쓰게 되면 경고가 남는다.

    이 경로가 조용하면 카탈로그에 없는 key 로 만든 건의 금액이 원장에 기록되지 않고 그 사실을
    알릴 신호도 남지 않는다. 이미지 경로에는 같은 경고가 있다.

    특히 도구 버전이 모델을 고정한 경우(v1.5 의 기획 LLM), 그 key 에 오타가 나거나 배포 환경의
    MODEL_CATALOG_JSON 이 그 모델을 빼면 내장 모델이 기획서를 쓴다. 그것이 조용하면 몇 달 뒤
    원장을 볼 때에야 드러난다.
    """

    def test_unknown_ref_warns(self, caplog) -> None:
        with caplog.at_level("WARNING"):
            spec = _catalog().resolve_chat_by_ref("claude-sonnet-5")
        assert spec.key == "qwen"  # 이 카탈로그에는 없어 기본으로 흡수된다
        assert "claude-sonnet-5" in caplog.text
        assert "qwen" in caplog.text

    def test_unavailable_ref_warns(self, caplog) -> None:
        """카탈로그에는 있지만 준비중인 모델. 흡수 자체는 정상이고, 조용한 것이 문제다."""
        with caplog.at_level("WARNING"):
            spec = _catalog().resolve_chat_by_ref("opus")
        assert spec.key == "qwen"
        assert "opus" in caplog.text

    def test_resolved_ref_is_quiet(self, caplog) -> None:
        """고른 모델이 그대로 쓰이면 아무 말도 하지 않는다(경고가 소음이 되면 읽히지 않는다)."""
        with caplog.at_level("WARNING"):
            spec = _catalog().resolve_chat_by_ref("qwen")
        assert spec.key == "qwen"
        assert caplog.text == ""

    def test_missing_ref_is_quiet(self, caplog) -> None:
        """미지정은 "기본을 쓰겠다" 는 정상 경로다. 여기서 경고하면 매 호출이 시끄러워진다."""
        with caplog.at_level("WARNING"):
            assert _catalog().resolve_chat_by_ref(None).key == "qwen"
        assert caplog.text == ""

    def test_served_name_match_is_quiet(self, caplog) -> None:
        """프론트가 저장한 served 이름으로 와도 그 모델이 쓰이므로 경고 대상이 아니다."""
        with caplog.at_level("WARNING"):
            spec = _catalog().resolve_chat_by_ref("qwen3-14b")
        assert spec.key == "qwen"
        assert caplog.text == ""

    def test_legacy_alias_is_quiet(self, caplog) -> None:
        """구 key 는 의도된 매핑이라 조용하다. 그 표가 있는 이유가 조용한 폴백을 막는 것이다.

        별칭 대상이 카탈로그에서 사라진 경우만 경고에 걸린다(그때는 실제로 다른 모델이 답을 쓴다).
        """
        specs = {
            "internal-qwen3": ModelSpecRecord(
                key="internal-qwen3",
                served_model_name="qwen3-14b",
                kind="chat",
                label="Qwen",
                provider="internal",
                available=True,
            ),
        }
        catalog = ModelCatalog(specs, default_key="internal-qwen3")
        with caplog.at_level("WARNING"):
            # 'qwen' 은 카탈로그 key 가 아니고 _LEGACY_CHAT_KEY_ALIASES 가 현재 key 로 옮긴다.
            spec = catalog.resolve_chat_by_ref("qwen")
        assert spec.key == "internal-qwen3"
        assert caplog.text == ""
