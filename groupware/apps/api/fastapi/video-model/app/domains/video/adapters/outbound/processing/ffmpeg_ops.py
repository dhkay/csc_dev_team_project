"""ffmpeg/ffprobe 저수준 헬퍼: 슬라이드쇼(씬 비주얼)와 조합(concat/mux)이 공유.

subprocess 로 시스템 ffmpeg 를 호출한다(Dockerfile 이 ffmpeg 설치). 순수 파일-경로 기반이라
슬라이드쇼/조합 어댑터가 조합해 쓴다. FINALIZE 최종 합성은 composite_final 하나가 원천 +
프레임 overlay + (있으면) ASS 텍스트 번인을 단일 인코딩으로 처리한다.
"""

from __future__ import annotations

import asyncio
import os

FPS = 30

# (해상도등급, 화면비) → 픽셀. 모든 값이 16의 배수: Wan 2.2 TI2V-5B 의 latent 제약이자,
# slideshow/Wan/Grok 이 같은 크기로 렌더해야 concat 이 매끄럽기 때문이다. 쇼츠 기본 9:16.
#
# 해상도 등급은 "짧은 변 픽셀 수"가 아니라 픽셀 면적 기준이다. 그래서 720p 1:1 이 720x720 이 아니라
# 960x960 이다(전 화면비가 대략 같은 면적 = 같은 렌더 비용/화질을 갖도록). 720p ≈ 90만 px,
# 480p ≈ 40만 px((480/720)^2 배).
#
# 새 화면비 = 각 등급에 한 줄. 새 해상도 등급 = 블록 하나 추가.
#   ※ 등급을 추가해도 모든 모델이 쓸 수 있는 건 아니다: 자체 Wan 2.2 는 VRAM(공유 GPU 16GB)과
#     latent 제약으로 720p 고정이다. 모델별 지원 등급의 SSOT 는 웹 카탈로그(aiModelOptions.ts 의
#     videoResolutions)이고, 여기 맵은 "그 선택을 픽셀로 해석"하는 쪽일 뿐이다.
_DIMS: dict[str, dict[str, tuple[int, int]]] = {
    "720p": {
        "9:16": (704, 1280),
        "16:9": (1280, 704),
        "1:1": (960, 960),
        "4:5": (768, 960),
    },
    "480p": {
        "9:16": (480, 848),
        "16:9": (848, 480),
        "1:1": (640, 640),
        "4:5": (512, 640),
    },
}

# 화면비 기본: 미지정/미지원 요청의 폴백.
#   값의 주인은 버전 사실 표(`@csc/tool-versions` 의 aspectRatio)이고 해석은 `@csc/video-capabilities`
#   다. 언어가 달라 import 할 수 없어 문자열만 맞추고, 그 일치는 scripts/check-marketing-aspect.mjs 가
#   CI 에서 지킨다(주석으로 부탁하지 않는다). 여기가 어긋나면 화면비를 못 알아들은 요청이 조용히
#   다른 모양으로 렌더된다.
DEFAULT_ASPECT = "9:16"

# 배경 프레임 제작 규약: 조직이 올리는 프레임은 이 모양의 전면 배경이다(숏폼 배포 규격).
#   최종 캔버스가 프레임 모양이므로(resolve_final_canvas) 이 값 + 안전 구역(ass_builder)이 원천이
#   앉을 자리의 비율을 정하고, 그 자리에 가장 잘 들어가는 값이 생성 시점 화면비다(v1.0 = 4:5).
#   그 판정은 scripts/check-marketing-aspect.mjs 가 검사한다: 여기서 규약을 바꾸면 그 게이트가
#   화면비를 함께 고치라고 알려 준다.
FRAME_CONVENTION_ASPECT = "9:16"

# 화질 기본: 원천 영상 화질 미지정(구 잡 포함)이면 기존 동작 그대로 720p.
DEFAULT_RESOLUTION = "720p"


def dims_for(resolution: str, aspect: str) -> tuple[int, int]:
    """(해상도등급, 화면비) → (width, height). 미지원 값은 각각 기본으로 폴백(16 배수, 짝수 보장)."""
    table = _DIMS.get(resolution, _DIMS[DEFAULT_RESOLUTION])
    return table.get(aspect, table[DEFAULT_ASPECT])


def _cover(width: int, height: int) -> str:
    """WxH 를 꽉 채우는 스케일+크롭 필터(비율 유지, 넘치는 부분 잘라내고 SAR 정규화)."""
    return (
        f"scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{height},setsar=1"
    )


async def _run(args: list[str], cwd: str | None = None) -> None:
    """ffmpeg/ffprobe 실행: 실패 시 stderr 꼬리를 담아 예외. cwd 는 필터 경로 이스케이프 회피용."""
    proc = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=cwd,
    )
    _out, err = await proc.communicate()
    if proc.returncode != 0:
        tail = err.decode("utf-8", "replace")[-1500:]
        raise RuntimeError(f"ffmpeg 실패(code={proc.returncode}): {args[0]}\n{tail}")


async def probe_duration(path: str) -> float:
    """미디어 길이(초). 실패/불명이면 0.0."""
    proc = await asyncio.create_subprocess_exec(
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        path,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    out, _err = await proc.communicate()
    try:
        return float(out.decode().strip())
    except (ValueError, AttributeError):
        return 0.0


async def probe_font_family(path: str) -> str | None:
    """폰트 파일의 패밀리명(fc-query, fontconfig). libass ASS Fontname 매칭용. 실패/불명/미설치면 None(폴백)."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "fc-query",
            "--format",
            "%{family[0]}",
            path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        out, _err = await proc.communicate()
    except Exception:  # noqa: BLE001 - fc-query 미설치 등. 패밀리 못 구하면 기본 폰트 폴백.
        return None
    fam = out.decode("utf-8", "replace").strip()
    return fam or None


async def make_silence(out_path: str, duration: float) -> None:
    """무음 오디오(aac) 생성: 나레이션 없는 씬용."""
    await _run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "anullsrc=r=44100:cl=stereo",
            "-t",
            f"{duration:.3f}",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            out_path,
        ]
    )


async def still_to_silent_clip(
    image_path: str,
    out_path: str,
    duration: float,
    width: int,
    height: int,
    ken_burns: bool = True,
) -> None:
    """정지 이미지 → 무음 클립(WxH, duration 초). ken_burns=천천히 줌인(모션).

    2배 해상도로 스케일 후 zoompan → 서브픽셀 흔들림(zoompan 정수 좌표 지터) 완화, 최종 WxH 출력.
    """
    frames = max(1, round(duration * FPS))
    if ken_burns:
        vf = (
            f"scale={width * 2}:{height * 2}:force_original_aspect_ratio=increase,"
            f"crop={width * 2}:{height * 2},"
            f"zoompan=z='min(zoom+0.0009,1.10)':d={frames}:"
            f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
            f"s={width}x{height}:fps={FPS},setsar=1"
        )
    else:
        vf = _cover(width, height)
    await _run(
        [
            "ffmpeg",
            "-y",
            "-loop",
            "1",
            "-i",
            image_path,
            "-t",
            f"{duration:.3f}",
            "-vf",
            vf,
            "-an",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-r",
            str(FPS),
            out_path,
        ]
    )


async def fit_to_duration(
    in_path: str,
    out_path: str,
    target: float,
    width: int,
    height: int,
    epsilon: float = 0.2,
) -> None:
    """비주얼 클립을 목표 길이(초)에 맞추고 단일 h264 비디오 스트림(무음)으로 정규화한다.

    provider 편차를 흡수한다. 더 길면 target 으로 잘라내고(-t), 더 짧으면 마지막 프레임을
    고정(tpad clone)해 채운다(나레이션이 끊기지 않게). 출력은 항상 WxH/FPS/libx264/무음 단일
    비디오라 concat 이 매끄럽다.

    `-map 0:v:0` 로 첫 비디오 스트림만 취한다. 외부(Grok) mp4 는 자체 오디오(aac)와 썸네일(mjpeg)을
    한 컨테이너에 함께 담아서, 그대로 두면 이후 mux/concat 이 비디오 스트림 둘(h264+mjpeg)을 잡아
    필터그래프가 깨진다(원천영상 99% 멈춤). 오디오는 mux_audio 가 넣으므로 여기선 -an.

    대사(립싱크)를 살리는 씬에는 이 함수를 쓰지 않는다. 두 전제가 깨진다.
      1. `-an` 이 버리는 것이 "쓰지 않을 소리" 가 아니라 그 씬의 대사가 된다.
      2. 길이의 주인이 뒤집힌다. 여기서는 나레이션이 길이를 정하는데, 대사는 클립 안에서 이미
         발화가 끝나 있어 자르면 문장이 잘린다.
    그 씬은 `normalize_clip_to_canvas` 로 간다(길이를 건드리지 않고 오디오를 보존한다). 섞지
    않는다. 나레이션과 대사는 배타라서 한 씬에 한 목소리만 있고(둘 다 넣으면 두 사람이 동시에
    말한다), 그래서 필요한 것은 믹스 비율이 아니라 갈림이다(compose 의 synthesizes_speech).
    계약: docs/specs/marketing-tool-versions.md
    """
    d = await probe_duration(in_path)
    vf = _cover(width, height)
    if d < target - epsilon:
        # 마지막 프레임을 target-d 만큼 고정해 길이를 채운다.
        vf += f",tpad=stop_mode=clone:stop_duration={target - d:.3f}"
    await _run(
        [
            "ffmpeg",
            "-y",
            "-i",
            in_path,
            "-map",
            "0:v:0",  # 첫 비디오만. 외부 mp4 의 자체 오디오/썸네일(mjpeg) 스트림 제거
            "-t",
            f"{target:.3f}",
            "-vf",
            vf,
            "-an",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-r",
            str(FPS),
            out_path,
        ]
    )


async def mux_audio(video_path: str, audio_path: str, out_path: str) -> None:
    """무음 클립 + 오디오 → 오디오 있는 클립. 짧은 쪽에 맞춰 자른다(-shortest).

    `-map 0:v:0` / `-map 1:a:0` 로 각 입력의 첫 스트림만 취한다. 정규화 뒤라도 비디오/오디오 스트림이
    정확히 하나씩만 담기게 해 concat(=n:v=1:a=1)이 안전하다.
    """
    await _run(
        [
            "ffmpeg",
            "-y",
            "-i",
            video_path,
            "-i",
            audio_path,
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-shortest",
            out_path,
        ]
    )


async def concat_clips(
    clip_paths: list[str],
    out_path: str,
    width: int,
    height: int,
) -> None:
    """씬 클립들을 이어붙인다(concat 필터, 재인코딩). 모든 클립이 같은 WxH/FPS/코덱이라 매끄럽게 이어진다.

    각 클립은 v+a 를 모두 가진다(무나레이션 씬도 무음 트랙 보유). 단일 클립이면 호출부가 concat 없이 그대로 쓴다.
    """
    inputs: list[str] = []
    streams = ""
    for i, path in enumerate(clip_paths):
        inputs += ["-i", path]
        streams += f"[{i}:v][{i}:a]"
    n = len(clip_paths)
    filtergraph = f"{streams}concat=n={n}:v=1:a=1[v][a]"
    await _run(
        [
            "ffmpeg",
            "-y",
            *inputs,
            "-filter_complex",
            filtergraph,
            "-map",
            "[v]",
            "-map",
            "[a]",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-r",
            str(FPS),
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            out_path,
        ]
    )


async def mix_final_audio(
    video_path: str,
    bgm_path: str | None,
    sfx_specs: list[tuple[str, float]],
    out_path: str,
    bgm_gain: float = 0.2,
) -> None:
    """완성 영상 오디오에 BGM 베드(루프+감쇠)와 효과음(지정 시각 오버레이)을 믹스한다.

    입력: 0=완성 영상(나레이션/무음 트랙 포함), [BGM 있으면] 다음이 BGM(`-stream_loop -1` 무한 루프),
    그 뒤 효과음들. 나레이션은 원음, BGM 은 bgm_gain(기본 0.2)으로 낮춰 깔고, 효과음은 adelay 로 절대 시각(초)에
    배치한다. amix `duration=first`(=영상 전체 길이인 나레이션 트랙)로 합쳐 무한 루프 BGM 을 그 길이로 캡한다
    (normalize=0 으로 나레이션 음량 보존, dropout_transition=0 으로 효과음 종료 시 음량 튐 방지). 비디오 스트림은
    copy(재인코딩 안 함), 오디오만 재인코딩한다.

    sfx_specs = [(파일경로, 시작초)]. bgm_path/sfx 둘 다 없으면 호출하지 않는다(호출부가 가드).
    """
    inputs = ["-i", video_path]
    filters = ["[0:a]volume=1[nar]"]
    labels = ["nar"]
    next_idx = 1
    if bgm_path:
        inputs += ["-stream_loop", "-1", "-i", bgm_path]  # -stream_loop 은 입력 앞에 온다.
        filters.append(f"[{next_idx}:a]volume={bgm_gain}[bg]")
        labels.append("bg")
        next_idx += 1
    for i, (path, start) in enumerate(sfx_specs):
        inputs += ["-i", path]
        ms = max(0, round(start * 1000))
        filters.append(f"[{next_idx}:a]adelay={ms}|{ms}[s{i}]")
        labels.append(f"s{i}")
        next_idx += 1
    joined = "".join(f"[{lbl}]" for lbl in labels)
    filters.append(
        f"{joined}amix=inputs={len(labels)}:duration=first:normalize=0:dropout_transition=0[mix]"
    )
    await _run(
        [
            "ffmpeg",
            "-y",
            *inputs,
            "-filter_complex",
            ";".join(filters),
            "-map",
            "0:v",
            "-map",
            "[mix]",
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            out_path,
        ]
    )


# 최종 합성(FINALIZE): 원천 + 프레임 오버레이 + 아웃트로 concat


async def _probe_dims(path: str) -> tuple[int, int]:
    """미디어(이미지/영상) 첫 비디오 스트림의 (width, height). 실패면 (0, 0)."""
    proc = await asyncio.create_subprocess_exec(
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "csv=p=0:s=x",
        path,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    out, _err = await proc.communicate()
    try:
        w_str, h_str = out.decode().strip().split("x")
        return int(w_str), int(h_str)
    except (ValueError, AttributeError):
        return 0, 0


def _even(n: int) -> int:
    """짝수로 내림(libx264 yuv420p 는 짝수 해상도 요구). 최소 2."""
    return max(2, n - (n % 2))


def _fit_canvas(w: int, h: int, max_side: int) -> tuple[int, int]:
    """비율을 유지한 캔버스 해상도(최대변 max_side 로 캡, 짝수). 과소는 그대로 둔다."""
    longest = max(w, h)
    if longest > max_side:
        scale = max_side / longest
        w, h = round(w * scale), round(h * scale)
    return _even(w), _even(h)


async def resolve_final_canvas(
    frame_path: str | None, source_path: str, max_side: int = 1280
) -> tuple[int, int]:
    """최종 합성 캔버스(짝수, 최대변 max_side 로 캡) = 프레임 모양(없으면 원천 모양).

    프레임이 결과의 모양을 정하는 이유는 그것이 화면 전체이기 때문이다. 원천은 그 안의 한 자리에
    앉으므로(composite_final 의 content_box) 원천 비율이 결과의 비율일 이유가 없다. 원천을 따르게
    두면 4:5 원천을 넣는 순간 최종이 4:5 로 나와 9:16 프레임이 사라진다(배포처가 요구하는 모양도
    함께 사라진다).

    프레임을 못 재면 원천으로, 그것도 못 재면 프레임 제작 규약의 모양으로 폴백한다(이 캔버스는
    프레임을 담는 자리라, 아무것도 못 잰 경우에도 프레임이 있을 모양으로 두는 것이 맞다).
    """
    frame_w, frame_h = await _probe_dims(frame_path) if frame_path else (0, 0)
    if frame_w > 0 and frame_h > 0:
        return _fit_canvas(frame_w, frame_h, max_side)
    src_w, src_h = await _probe_dims(source_path)
    if src_w > 0 and src_h > 0:
        return _fit_canvas(src_w, src_h, max_side)
    return dims_for(DEFAULT_RESOLUTION, FRAME_CONVENTION_ASPECT)


async def _has_audio(path: str) -> bool:
    """오디오 스트림 존재 여부."""
    proc = await asyncio.create_subprocess_exec(
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_entries",
        "stream=index",
        "-of",
        "csv=p=0",
        path,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    out, _err = await proc.communicate()
    return bool(out.decode().strip())


async def measure_ass_ink_bbox(
    ass_path: str, width: int, height: int, fonts_dir: str | None = None
) -> tuple[int, int, int, int] | None:
    """ASS 를 검은 캔버스에 번인한 1프레임에서 잉크(비-검정) 픽셀의 bbox 를 잰다 → (x, y, w, h) px.

    libass 실제 레이아웃(자동 줄바꿈/폰트 편차 포함)을 그대로 측정하므로, 뒷배경 박스를 텍스트에 픽셀 단위로
    맞출 수 있다(추정 불필요). 잉크가 없으면 None. 경로 이스케이프를 피하려 cwd=ass 디렉터리 + 상대경로.
    """
    cwd = os.path.dirname(os.path.abspath(ass_path)) or "."
    ass_val = f"ass={os.path.basename(ass_path)}"
    if fonts_dir:
        rel = os.path.relpath(os.path.abspath(fonts_dir), cwd).replace("\\", "/")
        ass_val += f":fontsdir={rel}"
    args = [
        "ffmpeg", "-y", "-f", "lavfi", "-i", f"color=c=black:s={width}x{height}:d=1",
        "-vf", ass_val, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-",
    ]
    proc = await asyncio.create_subprocess_exec(
        *args, cwd=cwd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    out, _err = await proc.communicate()
    if proc.returncode != 0 or len(out) < width * height:
        return None
    frame = out[: width * height]
    thresh = 40
    rows_with_ink = [y for y in range(height) if max(frame[y * width : (y + 1) * width]) > thresh]
    if not rows_with_ink:
        return None
    y0, y1 = rows_with_ink[0], rows_with_ink[-1]
    x0, x1 = width, -1
    for y in rows_with_ink:
        row = frame[y * width : (y + 1) * width]
        for x in range(width):  # 첫 밝은 픽셀
            if row[x] > thresh:
                if x < x0:
                    x0 = x
                break
        for x in range(width - 1, -1, -1):  # 마지막 밝은 픽셀
            if row[x] > thresh:
                if x > x1:
                    x1 = x
                break
    return (x0, y0, x1 - x0 + 1, y1 - y0 + 1)


async def composite_final(
    source_path: str,
    frame_path: str | None,
    out_path: str,
    width: int,
    height: int,
    ass_path: str | None = None,
    fonts_dir: str | None = None,
    content_box: tuple[int, int, int, int] | None = None,
) -> None:
    """최종 메인 합성: (원천 + 프레임 오버레이)[+ ASS 번인]을 단일 인코딩으로 처리.

    프레임이 둘러싸고 영상이 그 안에 들어간다. 프레임을 캔버스에 깔고, 호출부가 준
    `content_box` 자리에 원천을 비율 그대로 앉힌다. 그 자리 밖에 남는 것이 프레임이고, 그것이 이
    단계의 산출물이다(v1.0 이 이 단계를 '프레임 적용' 이라고 부르는 이유다).

    프레임을 영상 위에 덮지 않는다. 조직이 올리는 프레임은 전면 배경이라(가운데가 비고 위아래에
    장식) 위에 덮으면 영상이 100% 가려져 정지화면 한 장이 나온다.

    - 프레임 없으면: 원천을 cover 로 캔버스에 정규화(프레임 단계가 없다).
    - 프레임이 있는데 자리를 주지 않으면(content_box=None): 원천이 캔버스를 채우고 프레임은 그 뒤에
      완전히 가려진다. 그 조합은 호출부의 배선 오류다.
    - ass_path 있으면: 같은 필터그래프 끝에 libass 번인을 이어 붙인다(별도 재인코딩 패스 없이).
      프레임보다 뒤에 얹으므로 텍스트가 프레임 장식 위에 온다.
    - 오디오: 원천 유지(없으면 무음 추가). 44.1k/스테레오/aac 통일 → 아웃트로와 concat 을 복사로.

    레이어를 stages 로 쌓아 [vout] 하나로 내므로 워터마크 등을 더 얹어도 인코딩 패스가 늘지 않는다.
    ass 가 있으면 cwd 를 그 디렉터리로 두고 상대경로만 필터에 쓴다. ffmpeg 필터의 경로
    이스케이프(콜론, 역슬래시)를 피하기 위한 것이다(입력과 출력은 절대경로라 무관).
    """
    src_has_audio = await _has_audio(source_path)
    args: list[str] = ["ffmpeg", "-y"]
    stages: list[str] = []
    idx = 0

    if frame_path and content_box:
        bx, by, bw, bh = content_box
        # 검정 밑판을 먼저 깐다. 프레임에 투명한 부분이 있으면 그 아래에 아무것도 없어 결과가
        #   인코더의 알파 처리에 좌우된다(예측 불가). 검정으로 못박아 두면 어떤 프레임이 와도
        #   같은 그림이 나온다. 불투명 프레임에는 아무 영향이 없다.
        args += ["-f", "lavfi", "-i", f"color=black:s={width}x{height}"]
        black_i, idx = idx, idx + 1
        args += ["-loop", "1", "-i", os.path.abspath(frame_path)]
        frame_i, idx = idx, idx + 1
        args += ["-i", os.path.abspath(source_path)]
        src_i, idx = idx, idx + 1
        stages.append(f"[{frame_i}:v]{_cover(width, height)},format=rgba[fr]")
        stages.append(f"[{black_i}:v][fr]overlay=0:0[bg]")
        # 자리 안에 다 들어가게 축소한다(비율 유지). 자리와 비율이 다르면 그 안에서 가운데.
        stages.append(
            f"[{src_i}:v]scale={bw}:{bh}:force_original_aspect_ratio=decrease,setsar=1[fg]"
        )
        stages.append(
            f"[bg][fg]overlay={bx}+({bw}-w)/2:{by}+({bh}-h)/2:shortest=1[vbase]"
        )
    else:
        args += ["-i", os.path.abspath(source_path)]
        src_i, idx = idx, idx + 1
        # 프레임이 없으면 원천이 곧 화면이다. 캔버스가 원천 모양에서 나오므로(resolve_final_canvas)
        #   이 cover 가 실제로 잘라내는 것은 짝수 반올림의 1px 이하다.
        stages.append(f"[{src_i}:v]{_cover(width, height)}[vbase]")

    # 오디오 소스: 원천에 오디오 없으면 무음 입력을 붙인다(concat/믹스 요건).
    if src_has_audio:
        audio_map = f"{src_i}:a"
    else:
        args += ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"]
        sil_i, idx = idx, idx + 1
        audio_map = f"{sil_i}:a"

    # 텍스트 번인: 비디오 체인 끝에 libass 스테이지를 이어 붙인다(같은 인코딩). 끝이라는 것이
    #   곧 텍스트가 맨 위라는 뜻이다: 프레임 장식에 가려지면 읽을 수 없다.
    vlabel = "vbase"
    cwd: str | None = None
    if ass_path:
        cwd = os.path.dirname(os.path.abspath(ass_path)) or "."
        ass_val = f"ass={os.path.basename(ass_path)}"
        if fonts_dir:
            rel = os.path.relpath(os.path.abspath(fonts_dir), cwd).replace("\\", "/")
            ass_val += f":fontsdir={rel}"
        stages.append(f"[{vlabel}]{ass_val}[vout]")
        vlabel = "vout"

    args += [
        "-filter_complex",
        ";".join(stages),
        "-map",
        f"[{vlabel}]",
        "-map",
        audio_map,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-r",
        str(FPS),
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-ar",
        "44100",
        "-ac",
        "2",
        "-shortest",
        "-movflags",
        "+faststart",
        os.path.abspath(out_path),
    ]
    await _run(args, cwd=cwd)


async def normalize_clip_to_canvas(
    in_path: str,
    out_path: str,
    width: int,
    height: int,
) -> None:
    """클립을 캔버스(WxH)로 cover 정규화 + 재인코딩. 오디오 없으면 무음 추가(concat a=1 요건).

    아웃트로(또는 프레임 없는 원천)를 메인과 같은 WxH/FPS/코덱/오디오로 맞춰 concat 이 매끄럽게 잇게 한다.
    """
    has_audio = await _has_audio(in_path)
    args = ["ffmpeg", "-y", "-i", in_path]
    if not has_audio:
        args += ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"]
    args += ["-vf", _cover(width, height), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", str(FPS)]
    if has_audio:
        # 첫 비디오/오디오 스트림만 명시로 취한다. 외부 mp4 는 썸네일(mjpeg)을 두 번째 비디오
        #   스트림으로 함께 담는 일이 있어, 스트림 선택을 ffmpeg 기본에 맡기면 무엇이 실릴지가
        #   입력에 따라 달라진다(fit_to_duration 이 같은 이유로 -map 0:v:0 을 쓴다).
        args += ["-map", "0:v:0", "-map", "0:a:0"]
    else:
        args += ["-map", "0:v:0", "-map", "1:a", "-shortest"]
    # 오디오 파라미터 통일(44.1k/스테레오): 메인과 동일하게 맞춰 concat 을 재인코딩 없이 복사한다.
    args += ["-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2", out_path]
    await _run(args)


async def concat_copy(clip_paths: list[str], out_path: str) -> None:
    """클립들을 재인코딩 없이 이어붙인다(concat 데뮤서 + `-c copy`).

    모든 클립이 동일 코덱/해상도/픽셀포맷/타임베이스/오디오 파라미터여야 한다. finalize 처럼 우리가
    같은 설정으로 인코딩한 클립들(composite_final / normalize_clip_to_canvas). 전체 길이 재인코딩을
    통째로 피해 concat_clips(재인코딩)보다 훨씬 빠르다. 파라미터가 어긋나면 실패하므로, 호출부가
    concat_clips 재인코딩으로 폴백할 수 있다. N개 클립(인트로/메인/아웃트로 등) 확장도 그대로.
    """
    list_path = f"{out_path}.concat.txt"
    with open(list_path, "w", encoding="utf-8") as f:
        for p in clip_paths:
            # concat 리스트 포맷: Windows 역슬래시는 정방향으로, 작은따옴표는 이스케이프.
            esc = p.replace("\\", "/").replace("'", "'\\''")
            f.write(f"file '{esc}'\n")
    try:
        await _run(
            [
                "ffmpeg",
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                list_path,
                "-c",
                "copy",
                "-movflags",
                "+faststart",
                out_path,
            ]
        )
    finally:
        try:
            os.remove(list_path)
        except OSError:
            pass
