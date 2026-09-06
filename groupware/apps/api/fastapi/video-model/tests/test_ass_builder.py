"""ass_builder 단위: 제목(상단 전체구간) + 자막(하단 큐별) ASS 생성. 순수 함수(ffmpeg 무관)."""

from __future__ import annotations

from app.domains.video.adapters.outbound.processing import ass_builder
from app.domains.video.adapters.outbound.processing.ass_builder import (
    _ass_color,
    _ass_ts,
    _escape,
    _px,
    build_overlay_ass,
)


def test_ass_timestamp() -> None:
    assert _ass_ts(0) == "0:00:00.00"
    assert _ass_ts(3.5) == "0:00:03.50"
    assert _ass_ts(65.0) == "0:01:05.00"
    assert _ass_ts(-1) == "0:00:00.00"


def test_ass_color_and_alpha() -> None:
    # ASS 는 &HAABBGGRR, 알파 00=불투명.
    assert _ass_color("#FF0000", 100) == "&H000000FF"  # 빨강 불투명
    assert _ass_color("#00FF00", 100) == "&H0000FF00"  # 초록
    assert _ass_color("#000000", 0) == "&HFF000000"    # 완전 투명
    assert _ass_color("#000000", 50) == "&H80000000"   # 반투명(round(127.5)=128=0x80)
    assert _ass_color("bad", 100) == "&H00FFFFFF"       # 폴백 흰색


def test_escape() -> None:
    assert _escape("a\nb") == "a\\Nb"
    assert _escape("a\r\nb") == "a\\Nb"
    assert _escape("{tag}") == "(tag)"
    assert _escape("  x  ") == "x"


def test_escape_drops_empty_lines() -> None:
    # 앞/뒤/중간의 빈(공백만) 줄은 제거: '한 줄인데 빈 줄 포함 두 줄'로 렌더되던 문제 방지.
    assert _escape("\n한 줄") == "한 줄"          # 리딩 개행
    assert _escape("한 줄\n") == "한 줄"          # 트레일링 개행
    assert _escape("한 줄\n   \n") == "한 줄"     # 공백만 있는 줄
    assert _escape("가\n\n나") == "가\\N나"       # 중간 빈 줄 제거(내용 2줄만)
    assert _escape("가\n\n\n나") == "가\\N나"     # 연속 빈 줄도 접힘


def test_px_scales_by_canvas_height() -> None:
    assert _px(5.0, 1000) == 50
    assert _px(6.5, 1280) == 83  # round(83.2)


def test_build_empty_when_no_title_no_captions() -> None:
    assert build_overlay_ass(720, 1280, 10.0, None, None, [], None) == ""
    assert build_overlay_ass(720, 1280, 10.0, "", {}, [{"text": ""}], {}) == ""


def test_build_title_and_captions() -> None:
    ass = build_overlay_ass(
        canvas_w=720,
        canvas_h=1280,
        total_sec=10.0,
        title_text="제목",
        title_style=None,
        captions=[
            {"text": "안녕하세요", "start": 0.0, "end": 3.0},
            {"text": "두번째", "start": 3.0, "end": 6.5},
        ],
        subtitle_style=None,
    )
    assert "PlayResX: 720" in ass and "PlayResY: 1280" in ass
    assert "Style: Title," in ass and "Style: Sub," in ass
    # 제목: 상단정렬(Alignment 8), 전체 구간, 텍스트는 Layer 1(밴드 위).
    assert "Dialogue: 1,0:00:00.00,0:00:10.00,Title,,43,43,0,,제목" in ass
    # 자막: 큐별 타이밍 + 텍스트.
    assert ",Sub,,43,43,0,,안녕하세요" in ass
    assert "0:00:03.00,0:00:06.50,Sub" in ass
    assert "두번째" in ass


def test_title_only_no_caption_events() -> None:
    ass = build_overlay_ass(720, 1280, 5.0, "타이틀", None, [], None)
    assert "Title,,43,43,0,,타이틀" in ass
    assert ",Sub,," not in ass  # 자막 이벤트 없음


def test_band_without_geometry_is_single_box() -> None:
    # 기본(기하 미지정) 밴드 = 가장 긴 줄 기준 단일 \p1 사각형(정렬 \an 로 배치). 텍스트는 외곽선(BorderStyle=1).
    ass = build_overlay_ass(
        720, 1280, 5.0, "T", {"band": {"color": "#112233", "opacityPct": 100}},
        [{"text": "c", "start": 0, "end": 1}],
        {"band": {"color": "#445566"}},
    )
    assert ",Band,," in ass          # 밴드 드로잉 이벤트 존재
    assert "\\p1}" in ass            # \p1 사각형으로 그림
    assert "\\an8" in ass and "\\an2" in ass  # 제목=상단중앙, 자막=하단중앙 정렬 기반 배치(\pos 아님)
    assert "\\1c&H332211&" in ass    # 제목 박스 색 #112233 인라인(\1c)
    lines = {ln.split(",")[0]: ln for ln in ass.splitlines() if ln.startswith("Style: ")}
    # 텍스트 스타일은 외곽선(BorderStyle=1): 줄바꿈마다 박스 생기던 BorderStyle=3 제거.
    assert lines["Style: Title"].split(",")[15] == "1"
    assert lines["Style: Sub"].split(",")[15] == "1"


def test_multiline_band_is_one_rectangle_sized_to_longest_line() -> None:
    # 줄바꿈이 여러 개여도 밴드 사각형은 하나(각 줄마다 별도 사각형 아님), 폭은 가장 긴 줄 기준.
    short = build_overlay_ass(
        720, 1280, 5.0, "짧게", {"band": {"color": "#000000"}}, [], {},
    )
    longmulti = build_overlay_ass(
        720, 1280, 5.0, "아주아주아주긴제목입니다\n짧음", {"band": {"color": "#000000"}}, [], {},
    )
    # 3줄이어도 Band(드로잉) 이벤트는 정확히 1개.
    assert longmulti.count(",Band,,") == 1
    # 가장 긴 줄 기준이라, 더 긴 텍스트의 박스 폭(\p1 첫 l 좌표)이 더 크다.
    import re
    def box_w(a: str) -> int:
        m = re.search(r"\\p1\}m 0 0 l (\d+) 0", a)
        return int(m.group(1))
    assert box_w(longmulti) > box_w(short)


def test_autowrapped_long_line_grows_height_and_caps_width() -> None:
    # 명시적 \n 이 없어도(긴 한 줄) libass 자동 줄바꿈만큼 박스 높이가 커지고, 폭은 캔버스를 안 넘는다.
    import re
    def box(a: str):
        m = re.search(r"\\p1\}m 0 0 l (\d+) 0 l \d+ (\d+)", a)
        return int(m.group(1)), int(m.group(2))
    oneword = build_overlay_ass(720, 1280, 5.0, None, None,
        [{"text": "짧다", "start": 0, "end": 5}], {"band": {"color": "#000000"}})
    longline = build_overlay_ass(720, 1280, 5.0, None, None,
        [{"text": "이 제품은 정말 좋은 제품이고 꼭 한번 사용해보시길 강력히 추천드립니다", "start": 0, "end": 5}],
        {"band": {"color": "#000000"}})
    w_short, h_short = box(oneword)
    w_long, h_long = box(longline)
    assert h_long > h_short           # 자동 줄바꿈 → 높이 증가
    assert w_long <= 720              # 폭은 캔버스를 넘지 않는다(꽉 찬 1줄 박스 방지)


def test_band_with_geometry_draws_fixed_rectangle() -> None:
    # 명시 기하 밴드 = 그 위치, 크기의 고정 직사각형(\p1, Layer 0). 텍스트는 외곽선(BorderStyle=1).
    ass = build_overlay_ass(
        720, 1280, 5.0, "T",
        {"band": {"color": "#112233", "widthPct": 50, "heightPct": 10}},
        [{"text": "c", "start": 0, "end": 1}],
        {},
    )
    assert ",Band,," in ass
    assert "\\p1}m 0 0 l " in ass
    assert "\\1c&H332211&" in ass  # #112233 → &H332211& 인라인(\1c)
    lines = {ln.split(",")[0]: ln for ln in ass.splitlines() if ln.startswith("Style: ")}
    assert lines["Style: Title"].split(",")[15] == "1"  # 텍스트는 외곽선(박스 아님)


def test_measured_band_rect_draws_absolute_box() -> None:
    # finalize 가 픽셀 측정한 절대 rect 를 넘기면 추정 대신 그 위치, 크기로 \pos 박스를 그린다.
    ass = build_overlay_ass(
        720, 1280, 5.0, "제목", {"band": {"color": "#000000"}},
        [{"text": "자막", "start": 0, "end": 3}], {"band": {"color": "#000000"}},
        title_band_px=(40, 50, 300, 90),
        caption_bands_px=[(60, 1100, 400, 70)],
    )
    assert "\\pos(40,50)" in ass and "m 0 0 l 300 0 l 300 90" in ass   # 제목 박스 = 측정 rect
    assert "\\pos(60,1100)" in ass and "l 400 0 l 400 70" in ass        # 자막 박스 = 측정 rect
    assert "\\an7" in ass  # 절대 배치


def test_no_band_has_no_drawing_event() -> None:
    ass = build_overlay_ass(720, 1280, 5.0, "T", {}, [{"text": "c", "start": 0, "end": 1}], {})
    assert ",Band,," not in ass
    assert "\\p1}" not in ass
    lines = {ln.split(",")[0]: ln for ln in ass.splitlines() if ln.startswith("Style: ")}
    assert lines["Style: Title"].split(",")[15] == "1"  # 배경 없음 → 외곽선


def test_invalid_captions_skipped() -> None:
    # end<=start 큐는 생략, 빈 텍스트도 생략.
    ass = build_overlay_ass(
        720, 1280, 5.0, None, None,
        [{"text": "ok", "start": 0, "end": 2}, {"text": "bad", "start": 2, "end": 2}, {"text": ""}],
        None,
    )
    assert ass.count("Dialogue:") == 1
    assert "ok" in ass


def test_font_family_override() -> None:
    # 렌더가 해석한 패밀리명(자산 폰트)이 Fontname 을 덮어쓴다.
    ass = build_overlay_ass(
        720, 1280, 5.0, "T", {}, [{"text": "c", "start": 0, "end": 1}], {},
        title_font="FooFamily", subtitle_font="BarFamily",
    )
    lines = {ln.split(",")[0]: ln for ln in ass.splitlines() if ln.startswith("Style: ")}
    assert lines["Style: Title"].split(",")[1] == "FooFamily"
    assert lines["Style: Sub"].split(",")[1] == "BarFamily"


def test_font_family_falls_back_to_fontkey_then_nanum() -> None:
    ass = build_overlay_ass(720, 1280, 5.0, "T", {"fontKey": "nanum-gothic"}, [], {})
    assert "Style: Title,NanumGothic," in ass  # 자산 폰트 미지정 → fontKey 매핑 폴백


def test_module_exports_build() -> None:
    assert callable(ass_builder.build_overlay_ass)

class TestFrameSafeArea:
    """프레임 안전 구역: 영상이 앉는 자리와 텍스트 위치가 같은 값에서 나온다.

    이 구역 밖(위아래)이 프레임 장식 자리다. 텍스트가 그 밖으로 나가면 조직이 올린 로고와 그림 위에
    글자가 찍히고(그렇게 렌더된 최종본이 있었다), 자리가 구역보다 좁으면 영상이 쓸 수 있는 자리를
    못 쓴다. 두 사실이 한 곳에서 나오는지를 여기서 지킨다.
    """

    def test_band_is_the_place_for_the_video(self) -> None:
        top, bottom = ass_builder.content_band_pct()
        assert (top, bottom) == (
            ass_builder._SAFE_TOP_PCT,
            ass_builder._SAFE_BOTTOM_PCT,
        )
        # 구역이 캔버스의 절반 이상이어야 영상이 자리를 얻는다(장식이 위아래 몫을 가진다).
        assert bottom - top > 50.0

    def test_title_and_caption_stay_inside_the_band(self) -> None:
        # 텍스트는 캔버스 가장자리가 아니라 구역 안쪽에서 시작한다(n8 / n2 의 MarginV).
        top, bottom = ass_builder.content_band_pct()
        canvas_h = 1280
        ass = build_overlay_ass(
            720, canvas_h, 5.0, 'T', None, [{'text': 'c', 'start': 0, 'end': 1}], None
        )
        styles = {ln.split(',')[0]: ln for ln in ass.splitlines() if ln.startswith('Style: ')}
        title_margin = int(styles['Style: Title'].split(',')[21])
        sub_margin = int(styles['Style: Sub'].split(',')[21])
        # 제목은 위에서, 자막은 아래에서 띄운다. 둘 다 구역 경계보다 안쪽이어야 한다.
        assert title_margin >= round(canvas_h * top / 100.0)
        assert canvas_h - sub_margin <= round(canvas_h * bottom / 100.0)

    def test_default_band_rectangles_stay_inside_the_band(self) -> None:
        # 명시 기하 밴드의 폴백 위치도 같은 구역에서 파생한다(따로 적으면 장식 위로 되돌아간다).
        top, bottom = ass_builder.content_band_pct()
        title = ass_builder._TITLE_BAND_GEOM
        sub = ass_builder._SUB_BAND_GEOM
        assert title['yPct'] >= top
        assert title['yPct'] + title['heightPct'] <= bottom
        assert sub['yPct'] >= top
        assert sub['yPct'] + sub['heightPct'] <= bottom
