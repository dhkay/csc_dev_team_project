"""TtsPort 라우터: 잡의 나레이션 provider 별로 실제 TTS 어댑터에 디스패치.

씬 비주얼의 `RoutingVideoProcessing` 과 같은 모양이다. 잡 `params["tts"]["provider"]`(= 카탈로그의
모델 id)로 어느 어댑터가 합성할지 고른다.

고르지 않았다와 골랐는데 없다를 가른다. 둘을 함께 기본 TTS 로 대체하면 뜻이 다른 두 상태가 섞인다.

  provider 가 빈 값   아무도 고르지 않았다(provider 없이 저장된 구 잡). 기본으로 합성한다.
                      덮어쓸 선택이 애초에 없으므로 대체가 아니다.
  provider 가 모르는 값 조직이 그 목소리를 골랐는데 이 서버에 그 어댑터가 없다. 실패한다.

뒤쪽을 대체하지 않는 이유: 조직이 고른 목소리는 그 조직의 것이고 마케팅 영상은 그 목소리로 나가야
한다. 말없이 바꾸면 아무도 그 사실을 모른 채 브랜드와 다른 소리가 붙은 영상이 배포된다.
잘못 만들어진 것을 조용히 내보내는 것보다, 만들지 않고 왜 못 만들었는지 알리는 편이 낫다.
그 실패는 잡 실패로 올라가 화면이 사유와 함께 알린다.
"""

from __future__ import annotations

from ....core.application.ports.outbound import TtsPort


class RoutingTts:
    """provider→TtsPort 레지스트리로 디스패치하는 TtsPort 구현."""

    def __init__(self, adapters: dict[str, TtsPort], default_provider: str) -> None:
        if default_provider not in adapters:
            raise ValueError(
                f"default_provider {default_provider!r} 가 TTS 레지스트리에 없습니다"
                f" (등록: {sorted(adapters)})"
            )
        self._adapters = adapters
        self._default = default_provider

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
        key = provider.strip()
        if not key:
            # 고르지 않은 잡: 덮어쓸 선택이 없으므로 기본으로 합성한다(구 잡 호환).
            adapter = self._adapters[self._default]
        else:
            adapter = self._adapters.get(key)
            if adapter is None:
                raise RuntimeError(
                    f"나레이션 provider {key!r} 를 이 서버가 모릅니다"
                    f" (등록: {sorted(self._adapters)})."
                    " 고른 목소리를 다른 목소리로 대체하지 않습니다."
                )
        await adapter.synthesize(
            text, voice, pitch, out_path, provider=provider, api_key=api_key
        )
