"""프롬프트 자산 로더: prompts/ 의 manifest + .md 조각을 합성해 프롬프트 문자열을 만든다.

서버 비종속 인프라: FastAPI/SQLAlchemy 를 모른다(순수 파일 IO + stdlib tomllib).
기능(feature)당 features/<id>/manifest.toml 의 compose[] 순서대로 조각을 연결(빈 줄 구분)한다.
결과는 프로세스 수명 캐시(프롬프트는 정적): 파일 변경 반영은 재기동.
"""

from __future__ import annotations

import tomllib
from pathlib import Path


class PromptLibrary:
    """PromptLibraryPort 구현: prompts/ 루트에서 기능별 프롬프트를 렌더링."""

    def __init__(self, root: Path | str) -> None:
        self._root = Path(root)
        self._cache: dict[str, str] = {}

    def render(self, feature_id: str) -> str:
        """features/<feature_id>/manifest.toml 의 compose 를 순서대로 연결한 텍스트."""
        cached = self._cache.get(feature_id)
        if cached is not None:
            return cached

        manifest_path = self._root / "features" / feature_id / "manifest.toml"
        if not manifest_path.is_file():
            raise FileNotFoundError(f"프롬프트 manifest 없음: {manifest_path}")
        manifest = tomllib.loads(manifest_path.read_text(encoding="utf-8"))

        parts: list[str] = []
        for rel in manifest.get("compose", []):
            fragment = self._root / rel
            if not fragment.is_file():
                raise FileNotFoundError(
                    f"프롬프트 조각 없음: {fragment} (feature={feature_id})"
                )
            text = fragment.read_text(encoding="utf-8").strip()
            if text:
                parts.append(text)

        rendered = "\n\n".join(parts)
        self._cache[feature_id] = rendered
        return rendered
