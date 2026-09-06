"""VideoProcessingPort 구현: 최종 합성(FINALIZE 잡).

원천 영상(완성본) + 세트(프레임 + 아웃트로)를 받아 배포용 최종 mp4 를 만든다:
  1. 캔버스 = 원천 모양. 프레임은 위에 덮이므로 결과의 모양을 정하지 않는다.
  2. 프레임이 둘러싸고 영상이 그 안에 들어간다. 프레임을 깔고 원천을 제목과 자막 사이에
     비율 그대로 앉힌다(원천 오디오 유지). 자리 밖에 남는 것이 프레임이고, 그것이 이 단계의
     산출물이다. 위에 덮지 않는 이유: 조직 프레임은 전면 배경이라 덮으면 영상이 100% 가려진다.
  3. 아웃트로가 있으면 캔버스로 정규화 후 뒤에 concat.

원천 영상은 워커가 source_file_id 로 다운로드(source_path). 프레임/아웃트로는 params 의 file-upload id 를
FileGatewayPort 로 fetch(둘 다 nullable: 없으면 해당 단계 생략). ffmpeg 저수준은 ffmpeg_ops 로 위임.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any

from ....core.application.ports.outbound import FileGatewayPort
from ....core.domain.types import ProcessedResult, VideoJobType
from . import ass_builder, ffmpeg_ops

_logger = logging.getLogger(__name__)


class FinalizeProcessing:
    """VideoProcessingPort(Protocol) 구현: FINALIZE 잡(원천 + 세트 → 최종 영상)."""

    def __init__(self, files: FileGatewayPort) -> None:
        self._files = files

    async def process(
        self,
        type: VideoJobType,
        params: dict[str, Any],
        source_path: str | None,
        out_dir: str,
    ) -> ProcessedResult:
        if not source_path:
            raise ValueError("finalize: 원천 영상(source_file_id)이 필요합니다")

        # 프레임/아웃트로 fetch 병렬(독립 다운로드).
        frame_path, outro_path = await asyncio.gather(
            self._fetch(params.get("frame_file_id"), out_dir, "frame"),
            self._fetch(params.get("outro_file_id"), out_dir, "outro"),
        )

        # 캔버스 = 원천 모양(프레임은 결과의 모양을 정하지 않는다).
        cw, ch = await ffmpeg_ops.resolve_final_canvas(frame_path, source_path)

        # 프레임이 있으면 영상은 그 안에 들어간다. 자리는 제목과 자막 사이의 빈 구역이다.
        #   덮지 않고 안에 앉히는 이유는 composite_final 독스트링에 있다.
        content_box = self._content_box(cw, ch) if frame_path else None

        # 오버레이(제목/자막/밴드) ASS 를 먼저 만든다(자막 트랙/폰트 fetch 포함). 없으면 (None, None).
        ass_path, fonts_dir = await self._build_overlays(params, source_path, out_dir, cw, ch)

        # 메인 = (원천 + 프레임 오버레이) + 텍스트 번인 을 단일 인코딩으로. 아웃트로 정규화와 병렬.
        main_path = os.path.join(out_dir, "main.mp4")
        composite = ffmpeg_ops.composite_final(
            source_path, frame_path, main_path, cw, ch, ass_path, fonts_dir, content_box
        )
        outro_norm = os.path.join(out_dir, "outro-norm.mp4") if outro_path else None
        if not outro_norm:
            # 아웃트로 없으면 메인이 곧 최종(추가 인코딩/concat 없음).
            await composite
            return ProcessedResult(path=main_path, file_name="final.mp4", mime_type="video/mp4")

        await asyncio.gather(
            composite,
            ffmpeg_ops.normalize_clip_to_canvas(outro_path, outro_norm, cw, ch),
        )

        # 이어붙이기: 두 클립이 동일 파라미터라 재인코딩 없이 복사(빠름). 어긋나면 재인코딩 폴백.
        result_path = os.path.join(out_dir, "final.mp4")
        try:
            await ffmpeg_ops.concat_copy([main_path, outro_norm], result_path)
        except Exception:  # noqa: BLE001 - 복사 concat 실패(파라미터 불일치 등) 시 재인코딩으로 안전 폴백.
            await ffmpeg_ops.concat_clips([main_path, outro_norm], result_path, cw, ch)

        return ProcessedResult(path=result_path, file_name="final.mp4", mime_type="video/mp4")

    @staticmethod
    def _content_box(cw: int, ch: int) -> tuple[int, int, int, int]:
        """프레임 안에서 원천이 차지할 자리(x, y, w, h) = 프레임 안전 구역.

        가로는 전부, 세로는 안전 구역(`ass_builder.content_band_pct`)이다. 그 구역의 주인이
        오버레이 레이아웃인 이유는 같은 값이 제목과 자막의 위치도 정하기 때문이다(텍스트는 이
        구역 안에서 영상 위에 얹힌다). 여기서 숫자를 다시 적지 않는다: 구역을 옮기면 이 자리도
        함께 움직여야 한다.

        텍스트 몫을 빼지 않는 이유: 레이어가 프레임 → 영상 → 텍스트라 텍스트는 영상 위에 그려진다.
        빼 두면 그만큼 자리를 못 쓰면서(실측 프레임에서 자리의 88%) 정작 텍스트는 구역 밖 프레임
        장식 위에 찍혔다.
        """
        top_pct, bottom_pct = ass_builder.content_band_pct()
        y = round(ch * top_pct / 100.0)
        h = max(2, round(ch * (bottom_pct - top_pct) / 100.0))
        return 0, y, cw, h

    async def _build_overlays(
        self, params: dict[str, Any], source_path: str, out_dir: str, cw: int, ch: int
    ) -> tuple[str | None, str | None]:
        """제목/자막 오버레이 ASS 를 만들어 파일로 쓰고 (ass_path, fonts_dir) 반환. 오버레이 없으면 (None, None).

        자막 트랙(내용)은 captions_file_id(JSON 아티팩트, COMPOSE 산출)에서 fetch, 스타일(표현)은 params 로 받는다.
        길이는 원천에서 잰다(오버레이가 붙는 메인 = 원천 길이). 트랙/폰트 fetch 실패는 해당 요소만 빠지고 렌더는 유효.
        폰트를 하나라도 fetch 하면 fonts_dir 를, 아니면 None 을 함께 돌려준다.
        """
        title_text = str(params.get("title") or "").strip()
        captions: list[dict[str, Any]] = []
        captions_file_id = params.get("captions_file_id")
        if captions_file_id:
            cap_path = os.path.join(out_dir, "captions.json")
            try:
                await self._files.download_source(str(captions_file_id), cap_path)
                with open(cap_path, encoding="utf-8") as f:
                    loaded = json.load(f)
                if isinstance(loaded, list):
                    captions = loaded
            except Exception:  # noqa: BLE001 - 자막 트랙 실패는 치명적이지 않다(자막만 생략).
                _logger.warning(
                    "자막 트랙 fetch/파싱 실패(captions_file_id=%s): 자막 없이 진행", captions_file_id
                )

        # 폰트 자산(FONT 에셋) fetch + 패밀리 해석. 미지정/실패면 None → ass_builder 가 번들 NanumGothic 폴백.
        title_style = params.get("title_style") or {}
        subtitle_style = params.get("subtitle_style") or {}
        fonts_dir = os.path.join(out_dir, "fonts")
        title_font = await self._resolve_font(title_style.get("fontUploadId"), fonts_dir)
        subtitle_font = await self._resolve_font(subtitle_style.get("fontUploadId"), fonts_dir)
        fonts_arg = fonts_dir if os.path.isdir(fonts_dir) and os.listdir(fonts_dir) else None

        # 반응형(기하 미지정) 밴드는 실제 렌더를 픽셀 측정해 텍스트에 정확히 맞춘다(추정 대신). 측정 실패는
        #   None 으로 두면 ass_builder 가 추정으로 폴백한다. 밴드 없음/고정 기하면 측정하지 않는다(None).
        title_band_px = await self._measure_band_rect(
            title_text, title_style, True, title_font, cw, ch, out_dir, fonts_arg, "title"
        ) if title_text else None
        caption_bands_px = await self._measure_caption_bands(
            captions, subtitle_style, subtitle_font, cw, ch, out_dir, fonts_arg
        )

        ass = ass_builder.build_overlay_ass(
            canvas_w=cw,
            canvas_h=ch,
            total_sec=await ffmpeg_ops.probe_duration(source_path),
            title_text=title_text or None,
            title_style=title_style,
            captions=captions,
            subtitle_style=subtitle_style,
            title_font=title_font,
            subtitle_font=subtitle_font,
            title_band_px=title_band_px,
            caption_bands_px=caption_bands_px,
        )
        if not ass:
            return None, None  # 오버레이 없음.
        ass_path = os.path.join(out_dir, "overlays.ass")
        with open(ass_path, "w", encoding="utf-8") as f:
            f.write(ass)
        # 폰트를 하나라도 fetch 했으면 fontsdir 지정, 아니면 시스템(번들) 폰트.
        use_fonts = os.path.isdir(fonts_dir) and bool(os.listdir(fonts_dir))
        return ass_path, (fonts_dir if use_fonts else None)

    async def _measure_band_rect(
        self,
        text: str | None,
        style: dict[str, Any],
        is_title: bool,
        font_family: str | None,
        cw: int,
        ch: int,
        out_dir: str,
        fonts_dir: str | None,
        tag: str,
    ) -> tuple[int, int, int, int] | None:
        """반응형(기하 미지정) 밴드일 때만: 텍스트만(밴드 제거) 렌더 → 잉크 bbox 측정 → 박스 rect(bbox+여백).

        libass 실제 레이아웃(자동 줄바꿈/폰트 편차 포함)을 픽셀 측정하므로 박스가 텍스트에 정확히 맞는다.
        밴드 없음/고정 기하/빈 텍스트/측정 실패면 None(ass_builder 가 추정으로 폴백).
        """
        band = style.get("band")
        if not band or ass_builder._band_has_geometry(band):
            return None
        text = (text or "").strip()
        if not text:
            return None
        style_no_band = {**style, "band": None}
        if is_title:
            ass = ass_builder.build_overlay_ass(
                cw, ch, 2.0, text, style_no_band, [], {}, title_font=font_family
            )
        else:
            ass = ass_builder.build_overlay_ass(
                cw, ch, 2.0, None, None,
                [{"text": text, "start": 0.0, "end": 2.0}], style_no_band,
                subtitle_font=font_family,
            )
        if not ass:
            return None
        mpath = os.path.join(out_dir, f"measure-{tag}.ass")
        with open(mpath, "w", encoding="utf-8") as f:
            f.write(ass)
        bbox = await ffmpeg_ops.measure_ass_ink_bbox(mpath, cw, ch, fonts_dir)
        if not bbox:
            return None
        x, y, w, h = bbox
        default_pct = 6.5 if is_title else 5.0
        fontsize = max(1, round(ch * float(style.get("sizePct") or default_pct) / 100.0))
        pad_x = max(6, round(fontsize * 0.18))
        pad_y = max(4, round(fontsize * 0.12))
        return (max(0, x - pad_x), max(0, y - pad_y), w + 2 * pad_x, h + 2 * pad_y)

    async def _measure_caption_bands(
        self,
        captions: list[dict[str, Any]],
        subtitle_style: dict[str, Any],
        subtitle_font: str | None,
        cw: int,
        ch: int,
        out_dir: str,
        fonts_dir: str | None,
    ) -> list[tuple[int, int, int, int] | None]:
        """자막 큐별 밴드 rect 를 captions 인덱스에 정렬해 측정. 동일 텍스트는 한 번만 측정(캐시)해 병렬 렌더."""
        result: list[tuple[int, int, int, int] | None] = [None] * len(captions)
        band = subtitle_style.get("band")
        if not band or ass_builder._band_has_geometry(band):
            return result  # 밴드 없음/고정 기하 → 측정 불필요.
        # 고유 텍스트 → 등장 인덱스들.
        by_text: dict[str, list[int]] = {}
        for i, c in enumerate(captions):
            t = str(c.get("text") or "").strip()
            if t:
                by_text.setdefault(t, []).append(i)
        texts = list(by_text)

        async def measure(t: str, n: int) -> tuple[int, int, int, int] | None:
            return await self._measure_band_rect(
                t, subtitle_style, False, subtitle_font, cw, ch, out_dir, fonts_dir, f"cue-{n}"
            )

        rects = await asyncio.gather(*(measure(t, n) for n, t in enumerate(texts)))
        for t, rect in zip(texts, rects):
            for i in by_text[t]:
                result[i] = rect
        return result

    async def _resolve_font(self, font_upload_id: Any, fonts_dir: str) -> str | None:
        """폰트 자산 fetch + 패밀리명 해석. 미지정/실패면 None(번들 폴백). fetch 한 파일은 fonts_dir 에 모은다(fontsdir)."""
        if not font_upload_id:
            return None
        os.makedirs(fonts_dir, exist_ok=True)
        path = os.path.join(fonts_dir, str(font_upload_id))
        try:
            await self._files.download_source(str(font_upload_id), path)
        except Exception:  # noqa: BLE001 - 폰트 fetch 실패는 치명적이지 않다(기본 폰트로 렌더).
            _logger.warning("폰트 자산 fetch 실패(font=%s): 기본 폰트 폴백", font_upload_id)
            return None
        return await ffmpeg_ops.probe_font_family(path)

    async def _fetch(self, file_id: Any, out_dir: str, name: str) -> str | None:
        """세트 슬롯(프레임/아웃트로) file-upload id 를 로컬로 fetch. 없으면 None."""
        if not file_id:
            return None
        path = os.path.join(out_dir, name)
        await self._files.download_source(str(file_id), path)
        return path
