"""ASS(Advanced SubStation Alpha) 자막 생성: 최종 영상의 상단 제목 + 하단 시간동기 자막.

순수 함수(ffmpeg 미호출): (제목 텍스트/스타일 + 자막 트랙/스타일 + 캔버스 크기)로 ASS 문자열을 만든다.
FINALIZE 가 이걸 libass(ffmpeg `ass` 필터)로 최종 캔버스에 번인한다. 내용(트랙)과 표현(스타일)을 분리해,
스튜디오가 스타일만 바꿔 재렌더하면 재합성 없이 반영된다.

스타일 dict 형태(marketing shared/domain/overlay.ts 의 TextOverlayStyle 미러):
  { fontKey?, sizePct?, color?('#RRGGBB'),
    band?: { color?, opacityPct?, xPct?, yPct?, widthPct?, heightPct? } | None }
band = 구역 뒷배경 직사각형. 두 모드 모두 텍스트 아래 레이어(Layer 0)에 \\p1 드로잉으로 하나의
직사각형을 그리고 텍스트는 그 위(Layer 1, 외곽선 BorderStyle=1)에 얹는다. 줄바꿈마다 박스가 따로
생기지 않고 텍스트 블록 전체를 감싸는 단일 직사각형이다.
  - 기하 미지정(기본): 가장 긴 줄 기준으로 크기를 잡는다. 폰트 메트릭 라이브러리가 없어 글자폭을
    추정(CJK/전각=1em, 그 외≈0.5em: 한글엔 정확)하고 여백을 더한다. 위치는 libass 정렬(\\an)+MarginV 로
    텍스트와 같은 앵커에 둬 자동 정렬(수직 레이아웃 재현 불필요).
  - 기하 지정(x/y/폭/높이 %, 완성 영상 스튜디오 리사이즈): 그 위치, 크기의 고정 직사각형(\\pos+\\an7).
    빠진 필드는 구역 기본값으로 채움.
값이 없으면 아래 기본값으로 폴백(2언어라 marketing 기본값과 수치가 중복: 의도된 방어 폴백).
"""

from __future__ import annotations

import math
import unicodedata
from typing import Any

# 논리 폰트 키 → ASS Fontname(이미지에 fonts-nanum 설치, libass 가 fontconfig 로 탐색).
_FONTS: dict[str, str] = {"nanum-gothic": "NanumGothic"}
_DEFAULT_FONT = "NanumGothic"

# 방어 폴백 기본값(캔버스 높이 대비 %). 제목은 크게 상단, 자막은 하단.
_TITLE_SIZE_PCT = 6.5
_SUB_SIZE_PCT = 5.0
_MARGIN_H_PCT = 6.0   # 좌우 여백(줄바꿈 경계)
_DEFAULT_COLOR = "#FFFFFF"

# 배경 프레임 안전 구역(제작 규약)
# 조직이 올리는 배경 프레임은 전면 배경이고 장식(로고, 그림, 브랜드 마크)은 이 구역 밖
# (위아래)에 둔다는 약속이다. 이 구역이 최종 합성에서 원천 영상이 앉는 자리이고(finalize),
# 제목과 자막도 이 구역 안에 놓인다. 레이어는 프레임 → 영상 → 텍스트라 텍스트는 영상 위에 얹힌다.
#
# 자리의 주인은 프레임이다. 텍스트 밴드로 영상 자리를 정하면 텍스트가 영상 위에 얹히는데도
# 그만큼을 비워 둬 영상이 자리를 다 쓰지 못하고, 밴드가 캔버스 맨 위와 맨 아래를 잡아 제목이
# 프레임의 장식 위에 찍힌다.
#
# 값의 근거는 실측 프레임의 장식 없는 구간이다. 프레임 제작 규약으로
# 문서에 적는다(docs/specs/marketing-tool-versions.md). 이 구역의 비율이 생성 시점 화면비를
# 정하므로(v1.0 = 4:5) 값을 바꾸면 그 화면비도 함께 봐야 한다(scripts/check-marketing-aspect.mjs).
#
# 이 수치를 사람 말로 옮긴 문구가 프레임 업로드 화면에 있다(web-groupware 의 AssetSetSection:
# "장식은 위 12% / 아래 18% 안에"). 구역을 옮기면 그 문구도 함께 고친다. 게이트가 잡아 주지 못하는
# 짝이라 여기 적어 둔다: 문구가 낡으면 조직이 그 말대로 만든 프레임의 장식이 영상에 가려진다.
_SAFE_TOP_PCT = 12.0
_SAFE_BOTTOM_PCT = 82.0
# 텍스트를 안전 구역 경계에서 조금 더 안쪽으로: 경계에 딱 붙으면 장식과 맞닿아 보인다.
_SAFE_TEXT_INSET_PCT = 2.0

_TITLE_BAND_HEIGHT_PCT = 15.0
_SUB_BAND_HEIGHT_PCT = 17.0

# 명시 기하 밴드(고정 직사각형)에서 일부 필드가 빠졌을 때 채울 기본값: 캔버스 대비 %.
# 위치는 안전 구역에서 파생한다(제목은 그 위쪽, 자막은 그 아래쪽에 붙인다). 숫자를 따로 적으면
# 구역을 옮길 때 밴드만 남아 장식 위로 되돌아간다.
_TITLE_BAND_GEOM = {
    "xPct": 0.0,
    "yPct": _SAFE_TOP_PCT + _SAFE_TEXT_INSET_PCT,
    "widthPct": 100.0,
    "heightPct": _TITLE_BAND_HEIGHT_PCT,
}
_SUB_BAND_GEOM = {
    "xPct": 0.0,
    "yPct": _SAFE_BOTTOM_PCT - _SAFE_TEXT_INSET_PCT - _SUB_BAND_HEIGHT_PCT,
    "widthPct": 100.0,
    "heightPct": _SUB_BAND_HEIGHT_PCT,
}

# 텍스트 수직 여백(캔버스 대비 %): 제목은 위에서, 자막은 아래에서 이만큼 띄운다(정렬 \an8 / \an2).
_TITLE_MARGIN_V_PCT = _SAFE_TOP_PCT + _SAFE_TEXT_INSET_PCT
_SUB_MARGIN_V_PCT = (100.0 - _SAFE_BOTTOM_PCT) + _SAFE_TEXT_INSET_PCT

# 밴드 기하 필드: 하나라도 있으면 '고정 직사각형(\pos)', 없으면 '가장 긴 줄 기준 단일 박스(\an+MarginV)'.
_BAND_GEOM_KEYS = ("xPct", "yPct", "widthPct", "heightPct")


def content_band_pct() -> tuple[float, float]:
    """프레임 안전 구역(캔버스 높이 대비 %, 위/아래) = 원천 영상이 앉는 자리.

    이 값의 주인이 여기인 이유: 같은 구역이 텍스트 위치도 정한다(제목은 그 위쪽, 자막은 아래쪽에
    붙는다). 두 곳에서 각자 정하면 한쪽만 옮겨져 텍스트가 프레임 장식 위로 나가거나 영상이
    텍스트를 덮는다.

    쓰는 곳: 최종 합성이 프레임 안에 원천을 앉힐 자리(finalize). 프레임의 장식은 이 구역 밖
    (위아래)에 있고, 영상이 그 장식을 덮으면 프레임을 넣은 의미가 없다.
    """
    return _SAFE_TOP_PCT, _SAFE_BOTTOM_PCT

# 반응형 박스 크기 추정용 글자 메트릭(em, fontsize 대비). 폰트 메트릭 라이브러리가 없어, NanumGothic/
# MalgunGothic 실측(fontsize=83px 렌더 픽셀 스캔: 한글 ~0.73em, 줄 pitch ~1.0em, 첫 줄 잉크 ~0.72em)에
# 맞춰 보정했다. 폰트마다 소폭 다를 수 있어 여유를 조금 얹어(클리핑 방지) 여백이 오차를 흡수한다.
_CJK_EM = 0.8        # 전각/CJK(W, F) 글자 폭: 한글 실측 ~0.73 + 여유
_SPACE_EM = 0.35     # 공백
_OTHER_EM = 0.55     # 그 외(라틴/숫자/문장부호) 평균
_FIRST_LINE_EM = 0.85  # 첫 줄 높이(잉크 + 약간의 위아래 여유)
_LINE_PITCH_EM = 1.02  # 줄 간 baseline pitch


def _band_has_geometry(band: Any) -> bool:
    """명시적 기하가 있으면 True → 고정 직사각형(\\p1)으로 그린다(완성 영상 스튜디오 리사이즈).

    없으면(기본) 텍스트 폭에 반응형으로 맞춰 조금 크게 감싸는 불투명 박스(BorderStyle=3)로 그린다
    텍스트 폭은 build 시점에 알 수 없어(폰트 메트릭은 libass 가 렌더 때 계산) 박스가 자연히 텍스트에 맞는다.
    """
    return isinstance(band, dict) and any(band.get(k) is not None for k in _BAND_GEOM_KEYS)


def _font(style: dict[str, Any]) -> str:
    return _FONTS.get(str(style.get("fontKey") or ""), _DEFAULT_FONT)


def _px(pct: float, canvas_h: int) -> int:
    return max(1, round(canvas_h * pct / 100.0))


def _ass_ts(seconds: float) -> str:
    """초 → ASS 타임스탬프 H:MM:SS.cc(센티초)."""
    cs = max(0, round(seconds * 100))
    h, cs = divmod(cs, 360_000)
    m, cs = divmod(cs, 6_000)
    s, cs = divmod(cs, 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def _ass_color(hex_rgb: str, opacity_pct: float = 100.0) -> str:
    """'#RRGGBB' + 불투명도(%) → ASS &HAABBGGRR. ASS 알파는 00=불투명, FF=투명."""
    h = (hex_rgb or _DEFAULT_COLOR).lstrip("#")
    if len(h) != 6:
        h = "FFFFFF"
    try:
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    except ValueError:
        r, g, b = 255, 255, 255
    a = max(0, min(255, round((100.0 - opacity_pct) / 100.0 * 255)))
    return f"&H{a:02X}{b:02X}{g:02X}{r:02X}"


def _ass_bgr(hex_rgb: str) -> str:
    """'#RRGGBB' → ASS &HBBGGRR& (색만; 드로잉 \\1c 용, 알파는 \\1a 로 별도)."""
    h = (hex_rgb or "#000000").lstrip("#")
    if len(h) != 6:
        h = "000000"
    try:
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    except ValueError:
        r, g, b = 0, 0, 0
    return f"&H{b:02X}{g:02X}{r:02X}&"


def _ass_alpha(opacity_pct: float) -> str:
    """불투명도(%) → ASS 알파 &HAA& (00=불투명, FF=투명)."""
    a = max(0, min(255, round((100.0 - opacity_pct) / 100.0 * 255)))
    return f"&H{a:02X}&"


def _clean_lines(text: str) -> list[str]:
    """개행 정규화 후 빈(공백만) 줄을 모두 버리고 각 줄을 트림한 실제 내용 줄 목록.

    앞/뒤뿐 아니라 중간의 빈 줄(연속 개행 등)도 제거한다. libass 가 빈 줄을 빈 칸으로 렌더해
    '한 줄인데 빈 줄 포함 두 줄'처럼 보이고 박스도 그만큼 커지기 때문. 렌더 텍스트(_escape)와
    박스 크기 계산(_responsive_band_event)이 같은 함수로 줄을 세어 항상 일치한다.
    """
    t = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    return [ln.strip() for ln in t.split("\n") if ln.strip()]


def _escape(text: str) -> str:
    """ASS Dialogue Text 이스케이프: 개행은 \\N, 오버라이드 브레이스는 무력화(주입 방지), 빈 줄 제거."""
    return "\\N".join(ln.replace("{", "(").replace("}", ")") for ln in _clean_lines(text))


def _style_line(
    name: str,
    style: dict[str, Any],
    canvas_h: int,
    alignment: int,
    default_size_pct: float,
    margin_v_pct: float,
    font_family: str | None = None,
) -> str:
    """텍스트 V4+ Style 한 줄.

    텍스트는 항상 외곽선+그림자(BorderStyle=1) 로 그린다. 뒷배경 밴드(직사각형)는 밴드 유무, 모드와
    무관하게 별도 \\p1 드로잉(Layer 0)이 그리므로, 여기선 가독성용 외곽선만 담당한다(줄바꿈마다 박스가
    따로 생기던 BorderStyle=3 을 제거).
    font_family = 렌더 시 해석된 실제 폰트 패밀리(자산 폰트 fetch 결과). 없으면 fontKey 폴백(_font).
    """
    fontname = font_family or _font(style)
    fontsize = _px(float(style.get("sizePct") or default_size_pct), canvas_h)
    primary = _ass_color(str(style.get("color") or _DEFAULT_COLOR))
    border_style = 1
    outline = 2
    shadow = 1
    outline_colour = _ass_color("#000000", 100)
    back = _ass_color("#000000", 100)
    margin_v = _px(margin_v_pct, canvas_h)
    # Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,
    #   Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,
    #   Alignment,MarginL,MarginR,MarginV,Encoding
    return (
        f"Style: {name},{fontname},{fontsize},{primary},{primary},{outline_colour},{back},"
        f"0,0,0,0,100,100,0,0,{border_style},{outline},{shadow},"
        f"{alignment},0,0,{margin_v},1"
    )


def _band_style_line() -> str:
    """밴드 드로잉 전용 스타일: 색/알파는 이벤트가 인라인 오버라이드. 정렬 7(좌상단), 테두리/그림자 0."""
    c = _ass_color(_DEFAULT_COLOR)
    return (
        f"Style: Band,{_DEFAULT_FONT},10,{c},{c},{c},{c},"
        f"0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1"
    )


def _band_event(
    band: dict[str, Any],
    start: float,
    end: float,
    canvas_w: int,
    canvas_h: int,
    default_geom: dict[str, float],
) -> str:
    """구역 뒷배경 직사각형 한 개 → ASS 드로잉(\\p1) Dialogue(Layer 0, 텍스트 아래). 기하 % → 캔버스 px."""
    def g(key: str) -> float:
        v = band.get(key)
        return float(v) if isinstance(v, (int, float)) else default_geom[key]

    x = round(canvas_w * g("xPct") / 100.0)
    y = round(canvas_h * g("yPct") / 100.0)
    w = max(1, round(canvas_w * g("widthPct") / 100.0))
    h = max(1, round(canvas_h * g("heightPct") / 100.0))
    fill = _ass_bgr(str(band.get("color") or "#000000"))
    op = band.get("opacityPct")
    alpha = _ass_alpha(float(op) if isinstance(op, (int, float)) else 100.0)
    draw = (
        f"{{\\pos({x},{y})\\an7\\bord0\\shad0\\1c{fill}\\1a{alpha}\\p1}}"
        f"m 0 0 l {w} 0 l {w} {h} l 0 {h}"
    )
    return f"Dialogue: 0,{_ass_ts(start)},{_ass_ts(end)},Band,,0,0,0,,{draw}"


def _char_em(ch: str) -> float:
    """글자 하나의 대략적 폭(em): 전각/CJK/공백/그 외 3분류(폰트 메트릭 없이 실측 보정값)."""
    if ch == " ":
        return _SPACE_EM
    return _CJK_EM if unicodedata.east_asian_width(ch) in ("W", "F") else _OTHER_EM


def _display_units(line: str) -> float:
    """한 줄의 대략적 글자폭 합(em)."""
    return sum(_char_em(ch) for ch in line)


def _responsive_band_event(
    raw_text: str,
    band: dict[str, Any],
    fontsize: int,
    alignment: int,
    canvas_w: int,
    canvas_h: int,
    margin_h: int,
    margin_v_pct: float,
    start: float,
    end: float,
) -> str:
    """기하 미지정 밴드 → 가장 긴(시각) 줄 기준 단일 직사각형(\\p1). 줄바꿈마다 별도 박스가 아니라 블록 전체.

    자동 줄바꿈(WrapStyle=0) 반영: libass 는 사용 가능 폭(canvas_w - 좌우 여백)을 넘는 줄을 자동으로
    접는다. 명시적 \\n 뿐 아니라 이 자동 줄바꿈까지 세어(줄별 ceil(글자폭/사용폭)) 박스 높이에 반영하고,
    폭은 사용 가능 폭으로 캡한다(안 그러면 긴 한 줄이 캔버스를 넘겨 '꽉 찬 1줄 박스'가 됨).
    위치는 텍스트와 같은 정렬(\\an{alignment})+MarginV 로 두어 libass 가 같은 앵커에 배치(수직 계산 불필요).
    """
    # 빈 줄 제거 등 렌더 텍스트와 동일 정규화(_clean_lines): 빈 줄이 박스 줄 수에 세어지는 것 방지.
    lines = _clean_lines(raw_text) or [""]
    # 사용 가능 폭(em) = (캔버스 - 좌우 여백) / fontsize. 텍스트 Dialogue 의 MarginL/R 과 동일.
    avail_units = max(1.0, (canvas_w - 2 * margin_h) / fontsize)
    visual_lines = 0
    max_visual_units = 0.0
    for ln in lines:
        u = _display_units(ln)
        wrapped = max(1, math.ceil(u / avail_units))  # 자동 줄바꿈으로 접히는 시각 줄 수(근사)
        visual_lines += wrapped
        # 이 줄의 시각적 폭: 접히면 ≈ 사용 가능 폭, 아니면 글자폭.
        max_visual_units = max(max_visual_units, min(u, avail_units))
    pad_x = max(6, round(fontsize * 0.18))
    pad_y = max(4, round(fontsize * 0.12))
    box_w = max(1, round(max_visual_units * fontsize) + 2 * pad_x)
    # 텍스트 블록 높이 ≈ 첫 줄 + (시각 줄 수-1)*줄 pitch (em, 실측 보정) → px. 자동 줄바꿈 포함.
    text_h = round((_FIRST_LINE_EM + (visual_lines - 1) * _LINE_PITCH_EM) * fontsize)
    box_h = max(1, text_h + 2 * pad_y)
    # 박스는 텍스트보다 pad_y 만큼 바깥에서 시작 → 텍스트가 상하 여백을 갖고 박스 안에 놓인다.
    box_margin_v = max(0, _px(margin_v_pct, canvas_h) - pad_y)
    fill = _ass_bgr(str(band.get("color") or "#000000"))
    op = band.get("opacityPct")
    alpha = _ass_alpha(float(op) if isinstance(op, (int, float)) else 100.0)
    draw = (
        f"{{\\an{alignment}\\bord0\\shad0\\1c{fill}\\1a{alpha}\\p1}}"
        f"m 0 0 l {box_w} 0 l {box_w} {box_h} l 0 {box_h}"
    )
    return f"Dialogue: 0,{_ass_ts(start)},{_ass_ts(end)},Band,,0,0,{box_margin_v},,{draw}"


def _abs_band_event(
    rect: tuple[int, int, int, int], band: dict[str, Any], start: float, end: float
) -> str:
    """절대 좌표(px) 직사각형 밴드(\\pos+\\an7). rect=(x, y, w, h). 실측한 텍스트 bbox+여백을 그대로 그린다.

    추정 대신 finalize 가 실제 렌더를 픽셀 측정해 얻은 rect 를 넘긴다. 자동 줄바꿈/빈 줄/폰트 편차와 무관하게
    텍스트에 정확히 맞는다.
    """
    x, y, w, h = (int(v) for v in rect)
    fill = _ass_bgr(str(band.get("color") or "#000000"))
    op = band.get("opacityPct")
    alpha = _ass_alpha(float(op) if isinstance(op, (int, float)) else 100.0)
    draw = (
        f"{{\\pos({x},{y})\\an7\\bord0\\shad0\\1c{fill}\\1a{alpha}\\p1}}"
        f"m 0 0 l {w} 0 l {w} {h} l 0 {h}"
    )
    return f"Dialogue: 0,{_ass_ts(start)},{_ass_ts(end)},Band,,0,0,0,,{draw}"


def build_overlay_ass(
    canvas_w: int,
    canvas_h: int,
    total_sec: float,
    title_text: str | None,
    title_style: dict[str, Any] | None,
    captions: list[dict[str, Any]] | None,
    subtitle_style: dict[str, Any] | None,
    title_font: str | None = None,
    subtitle_font: str | None = None,
    title_band_px: tuple[int, int, int, int] | None = None,
    caption_bands_px: list[tuple[int, int, int, int] | None] | None = None,
) -> str:
    """제목(상단 전체구간) + 자막(하단 큐별 타이밍) ASS 문자열. 둘 다 없으면 빈 문자열.

    각 구역에 band(뒷배경 직사각형)가 있으면 텍스트 아래 레이어에 사각형을 먼저 그린다.

    반응형(기하 미지정) 밴드의 크기, 위치:
      - `title_band_px`/`caption_bands_px`(finalize 가 실제 렌더를 픽셀 측정한 절대 rect)가 오면 그걸 그대로 쓴다
        (정확). `caption_bands_px` 는 `captions` 와 같은 인덱스로 정렬(밴드 없거나 측정 불가면 None).
      - 없으면(단위 테스트/측정 불가) 글자폭 추정으로 대체(_responsive_band_event).
    """
    title_style = title_style or {}
    subtitle_style = subtitle_style or {}
    captions = captions or []
    title = _escape(title_text or "")
    cues = [c for c in captions if _escape(str(c.get("text") or ""))]
    if not title and not cues:
        return ""

    margin_h = _px(_MARGIN_H_PCT, canvas_w)  # 좌우 여백은 가로폭 기준.
    header = [
        "[Script Info]",
        "ScriptType: v4.00+",
        f"PlayResX: {canvas_w}",
        f"PlayResY: {canvas_h}",
        "WrapStyle: 0",
        "ScaledBorderAndShadow: yes",
        "",
        "[V4+ Styles]",
        (
            "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, "
            "BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, "
            "BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding"
        ),
        _band_style_line(),
        _style_line(
            "Title", title_style, canvas_h, 8, _TITLE_SIZE_PCT, _TITLE_MARGIN_V_PCT, title_font
        ),
        _style_line(
            "Sub", subtitle_style, canvas_h, 2, _SUB_SIZE_PCT, _SUB_MARGIN_V_PCT, subtitle_font
        ),
        "",
        "[Events]",
        (
            "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
        ),
    ]
    # 밴드(있으면) → 텍스트 아래 레이어에 단일 직사각형 하나. 기하 지정=고정(\pos), 미지정=가장 긴 줄 기준.
    title_band = title_style.get("band")
    sub_band = subtitle_style.get("band")
    title_fontsize = _px(float(title_style.get("sizePct") or _TITLE_SIZE_PCT), canvas_h)
    sub_fontsize = _px(float(subtitle_style.get("sizePct") or _SUB_SIZE_PCT), canvas_h)

    def band_events(
        raw_text, band, fontsize, alignment, default_geom, margin_v_pct, measured_px, start, end
    ):
        """밴드 박스 이벤트(있으면 1개). 기하=고정 사각형 / 측정 rect=정확 / 그 외=추정."""
        if not band:
            return []
        if _band_has_geometry(band):
            return [_band_event(band, start, end, canvas_w, canvas_h, default_geom)]
        if measured_px is not None:
            return [_abs_band_event(measured_px, band, start, end)]
        return [
            _responsive_band_event(
                raw_text,
                band,
                fontsize,
                alignment,
                canvas_w,
                canvas_h,
                margin_h,
                margin_v_pct,
                start,
                end,
            )
        ]

    caption_bands_px = caption_bands_px or []
    events: list[str] = []
    if title:
        end = max(0.0, total_sec)
        events += band_events(
            title_text or "",
            title_band,
            title_fontsize,
            8,
            _TITLE_BAND_GEOM,
            _TITLE_MARGIN_V_PCT,
            title_band_px,
            0.0,
            end,
        )
        # 텍스트는 밴드(사각형) 위(Layer 1).
        events.append(
            f"Dialogue: 1,{_ass_ts(0)},{_ass_ts(end)},Title,,{margin_h},{margin_h},0,,{title}"
        )
    # captions 원본 인덱스로 순회(측정 rect 정렬 유지): 유효하지 않은 큐는 건너뛴다.
    for idx, c in enumerate(captions):
        raw = str(c.get("text") or "")
        if not _escape(raw):
            continue
        start = float(c.get("start") or 0.0)
        end = float(c.get("end") or start)
        if end <= start:
            continue
        mpx = caption_bands_px[idx] if idx < len(caption_bands_px) else None
        events += band_events(
            raw, sub_band, sub_fontsize, 2, _SUB_BAND_GEOM, _SUB_MARGIN_V_PCT, mpx, start, end
        )
        events.append(
            f"Dialogue: 1,{_ass_ts(start)},{_ass_ts(end)},Sub,,{margin_h},{margin_h},0,,{_escape(raw)}"
        )
    return "\n".join(header + events) + "\n"
