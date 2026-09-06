"""나레이션 provider 라우팅과 ElevenLabs 필수 입력.

씬 비주얼과 달리 나레이션은 폴백이 무음이 아니라 기본 TTS 다. 그 판정이 깨지면 조직이 외부 키를
등록하지 않았을 때 영상이 통째로 실패하거나(무음보다 나쁘다) 반대로 조용히 다른 목소리가 된다.
"""

from __future__ import annotations

import pytest

from app.domains.video.adapters.outbound.tts.elevenlabs_adapter import ElevenLabsTtsAdapter
from app.domains.video.adapters.outbound.tts.routing import RoutingTts


class _Rec:
    """호출 인자를 기록하는 가짜 TTS."""

    def __init__(self, tag: str) -> None:
        self.tag = tag
        self.calls: list[dict[str, str]] = []

    async def synthesize(
        self,
        text: str,
        voice: str,
        pitch: str,
        out_path: str,
        *,
        provider: str = "",
        api_key: str = "",
    ) -> None:
        self.calls.append({"voice": voice, "provider": provider, "api_key": api_key})


def _routing() -> tuple[RoutingTts, _Rec, _Rec]:
    edge, eleven = _Rec("edge"), _Rec("eleven")
    return (
        RoutingTts({"edge-tts": edge, "eleven_v3": eleven}, default_provider="edge-tts"),
        edge,
        eleven,
    )


class TestRouting:
    @pytest.mark.asyncio
    async def test_dispatches_by_provider(self) -> None:
        router, edge, eleven = _routing()
        await router.synthesize("t", "v", "p", "/x", provider="eleven_v3", api_key="k")
        assert len(eleven.calls) == 1 and not edge.calls

    @pytest.mark.asyncio
    async def test_unknown_provider_raises_instead_of_substituting(self) -> None:
        """고른 목소리를 말없이 다른 목소리로 바꾸지 않는다.

        기본 TTS 로 대체하면 브랜드와 다른 소리가 붙은 영상이 아무도 모르는 채 배포된다.
        만들지 않고 알리는 편이 낫다.
        """
        router, edge, eleven = _routing()
        with pytest.raises(RuntimeError, match="대체하지 않습니다"):
            await router.synthesize("t", "v", "p", "/x", provider="없는-모델")
        assert not edge.calls and not eleven.calls

    @pytest.mark.asyncio
    async def test_empty_provider_uses_default(self) -> None:
        # 고르지 않은 잡(provider 없이 저장된 구 잡)은 덮어쓸 선택이 없으므로 대체가 아니다.
        #   위 케이스와 갈라 두는 것이 이 라우터의 규칙이다.
        router, edge, _ = _routing()
        await router.synthesize("t", "v", "p", "/x")
        assert len(edge.calls) == 1

    @pytest.mark.asyncio
    async def test_passes_credential_through(self) -> None:
        """조직 키가 어댑터까지 그대로 가야 한다(중간에서 삼키면 '키 없음' 으로 실패한다)."""
        router, _, eleven = _routing()
        await router.synthesize("t", "voice-1", "p", "/x", provider="eleven_v3", api_key="k")
        assert eleven.calls[0] == {"voice": "voice-1", "provider": "eleven_v3", "api_key": "k"}

    def test_default_must_be_registered(self) -> None:
        # 기본이 레지스트리에 없으면 폴백 시점에 KeyError 로 죽는다: 조립 때 잡는다.
        with pytest.raises(ValueError, match="default_provider"):
            RoutingTts({"edge-tts": _Rec("edge")}, default_provider="없는-기본")


class TestElevenLabsRequiredInputs:
    @pytest.mark.asyncio
    async def test_missing_api_key_raises(self) -> None:
        adapter = ElevenLabsTtsAdapter("https://api.elevenlabs.io", 1.0)
        with pytest.raises(RuntimeError, match="API 키"):
            await adapter.synthesize("t", "voice-1", "", "/x", provider="eleven_v3")

    @pytest.mark.asyncio
    async def test_missing_voice_raises(self) -> None:
        """음성은 요청 경로에 있어 비면 URL 이 성립하지 않는다. 임의 음성으로 대신하지 않는다."""
        adapter = ElevenLabsTtsAdapter("https://api.elevenlabs.io", 1.0)
        with pytest.raises(RuntimeError, match="음성 ID"):
            await adapter.synthesize("t", "", "", "/x", provider="eleven_v3", api_key="k")
