"""ComposeProcessing 실렌더 통합 테스트: 실제 ffmpeg 로 씬별 클립 + concat + 재개(체크포인트) 검증.

edge-tts(네트워크) 없이 Fake TTS(무음), Fake FileGateway 로 로컬 이미지/클립을 공급한다.
재개 테스트는 Fake 체크포인트/재개가능 비주얼로 "완료 씬 건너뛰기 / prompt_id 재사용"을 확인한다.
ffmpeg 미설치 환경에서는 skip.
"""

from __future__ import annotations

import asyncio
import os
import shutil

import pytest

from app.domains.video.adapters.outbound.checkpoint.redis_checkpoint import (
    NullSceneCheckpoint,
)
from app.domains.video.adapters.outbound.processing import ffmpeg_ops
from app.domains.video.adapters.outbound.processing.compose import ComposeProcessing
from app.domains.video.adapters.outbound.processing.slideshow import SlideshowProcessing
from app.domains.video.core.domain.errors import PermanentRenderError
from app.domains.video.core.domain.prompts import SCENE_MOTION_PROMPT
from app.domains.video.core.domain.types import ProcessedResult, VideoJobType

pytestmark = pytest.mark.skipif(
    shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None,
    reason="ffmpeg/ffprobe 미설치",
)


async def _make_png(path: str, color: str) -> None:
    """ffmpeg 로 단색 PNG 1장 생성(테스트 씬 이미지)."""
    proc = await asyncio.create_subprocess_exec(
        "ffmpeg", "-y", "-f", "lavfi", "-i", f"color=c={color}:s=720x1280",
        "-frames:v", "1", path,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    await proc.communicate()


async def _make_clip(path: str, seconds: float = 3.0) -> None:
    """ffmpeg 로 무음 v+a mp4 1개 생성(체크포인트 회수 테스트용 완성 클립)."""
    proc = await asyncio.create_subprocess_exec(
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", "color=c=gray:s=704x1280:r=30",
        "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
        "-t", f"{seconds}", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", path,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    await proc.communicate()


async def _make_tone(path: str, seconds: float, freq: int) -> None:
    """ffmpeg 로 사인톤 오디오(aac) 생성: BGM/효과음 대역(내용은 무관, 존재/길이만 검증)."""
    proc = await asyncio.create_subprocess_exec(
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", f"sine=frequency={freq}:duration={seconds}",
        "-c:a", "aac", "-b:a", "128k", path,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    await proc.communicate()


class _FakeFileGateway:
    """download_source 가 file_id→로컬 파일 매핑을 dest 로 복사. store_result 는 가짜 id 반환(호출 기록)."""

    def __init__(self, files: dict[str, str]) -> None:
        self._files = files
        self.downloaded: list[str] = []
        self.stored: list[str] = []

    async def download_source(self, file_id: str, dest_path: str) -> None:
        self.downloaded.append(file_id)
        shutil.copyfile(self._files[file_id], dest_path)

    async def store_result(self, job_id: str, file_name: str, mime_type: str, src_path: str, organization_id: int | None = None) -> str:
        self.stored.append(job_id)
        fid = f"stored:{job_id}"
        self._files[fid] = src_path  # 이후 download 로 회수 가능하게(같은 파일 참조는 아니지만 존재)
        return fid


class _FakeTts:
    """edge-tts 대신 무음(3초)."""

    def __init__(self) -> None:
        self.calls = 0

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
        self.calls += 1
        await ffmpeg_ops.make_silence(out_path, 3.0)


class _FakeCheckpoint:
    """인메모리 체크포인트: 미리 세팅한 진행(preset)을 load 로 주고 save 를 기록한다."""

    def __init__(self, preset: dict[int, dict[str, object]] | None = None) -> None:
        self.state = preset or {}
        self.dropped: list[int] = []
        self.saves: list[tuple[int, dict[str, object]]] = []
        self.cleared = False

    async def load(self, job_id: str) -> dict[int, dict[str, object]]:
        return dict(self.state)

    async def save_scene(
        self, job_id, order, *, prompt_id=None, clip_file_id=None, billed_seconds=None
    ) -> None:
        rec: dict[str, object] = {}
        if prompt_id is not None:
            rec["prompt_id"] = prompt_id
        if clip_file_id is not None:
            rec["clip_file_id"] = clip_file_id
        if billed_seconds is not None:
            rec["billed_seconds"] = billed_seconds
        self.saves.append((order, rec))

    async def drop_scene_handle(self, job_id, order) -> None:
        self.dropped.append(order)
        rec = self.state.get(order)
        if rec:
            rec.pop("prompt_id", None)

    async def clear(self, job_id: str) -> None:
        self.cleared = True


class _FakeResumableVisual:
    """submit/poll 재개가능 비주얼(ResumableVisualPort 형태): Wan 대역. poll 시 무음 클립 생성."""

    def __init__(self) -> None:
        self.submit_calls = 0
        self.polled: list[str] = []
        self.submitted: list[str] = []  # 제출된 소스 이미지 경로(업로드 파일명 충돌 회귀용).

    async def submit(self, params: dict, source_path: str | None) -> str:
        self.submit_calls += 1
        if source_path is not None:
            self.submitted.append(source_path)
        return "prompt-new"

    async def poll_to_file(self, handle: str, out_dir: str, params: dict | None = None) -> str:
        self.polled.append(handle)
        out = os.path.join(out_dir, "result.mp4")
        # Wan 처럼 이미지 없이도 클립 생성(무음 v). fit 이 뒤에서 길이 맞춤.
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=teal:s=704x1280:r=30",
            "-t", "5", "-c:v", "libx264", "-pix_fmt", "yuv420p", out,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        await proc.communicate()
        return out

    # 재개 불가 경로가 잘못 타면 티나게(테스트 방어).
    async def process(self, *a, **k) -> ProcessedResult:  # pragma: no cover
        raise AssertionError("재개가능 비주얼은 submit/poll 로만 호출돼야 한다")


async def test_compose_renders_multi_scene_mp4(tmp_path) -> None:
    img1, img2 = str(tmp_path / "s1.png"), str(tmp_path / "s2.png")
    await _make_png(img1, "red")
    await _make_png(img2, "blue")

    compose = ComposeProcessing(
        files=_FakeFileGateway({"f1": img1, "f2": img2}),
        tts=_FakeTts(),
        visual={"slideshow": SlideshowProcessing()},
        default_visual="slideshow",
        checkpoint=NullSceneCheckpoint(),
    )
    out_dir = str(tmp_path / "out")
    os.makedirs(out_dir, exist_ok=True)
    result = await compose.process(
        type=VideoJobType.COMPOSE,
        params={
            "aspect_ratio": "9:16",
            "scene_visual_provider": "slideshow",
            "tts": {"provider": "edge-tts", "voice": "ko-KR-SunHiNeural", "pitch": "+0Hz"},
            "scenes": [
                {"order": 1, "image_file_id": "f1", "narration": "첫 씬 나레이션", "subtitle": "자막1"},
                {"order": 2, "image_file_id": "f2", "narration": "", "subtitle": "자막2"},
            ],
        },
        source_path=None,
        out_dir=out_dir,
    )
    assert os.path.exists(result.path)
    assert result.mime_type == "video/mp4"
    total = await ffmpeg_ops.probe_duration(result.path)
    assert 5.0 < total < 9.0, f"예상 밖 길이: {total}"


async def test_compose_emits_caption_track(tmp_path) -> None:
    # 씬 subtitle + 실제 길이로 시간동기 자막 트랙(JSON)을 만들어 file-service 에 저장하고 id 를 돌려준다.
    import json

    img1, img2 = str(tmp_path / "a.png"), str(tmp_path / "b.png")
    await _make_png(img1, "red")
    await _make_png(img2, "blue")
    files = _FakeFileGateway({"f1": img1, "f2": img2})
    compose = ComposeProcessing(
        files=files,
        tts=_FakeTts(),
        visual={"slideshow": SlideshowProcessing()},
        default_visual="slideshow",
        checkpoint=NullSceneCheckpoint(),
    )
    out_dir = str(tmp_path / "out")
    os.makedirs(out_dir, exist_ok=True)
    result = await compose.process(
        type=VideoJobType.COMPOSE,
        params={
            "job_id": "job-cap",
            "aspect_ratio": "9:16",
            "scene_visual_provider": "slideshow",
            "tts": {"provider": "edge-tts", "voice": "v", "pitch": "+0Hz"},
            "scenes": [
                {"order": 1, "image_file_id": "f1", "narration": "n1", "subtitle": "자막1"},
                {"order": 2, "image_file_id": "f2", "narration": "", "subtitle": "자막2"},
            ],
        },
        source_path=None,
        out_dir=out_dir,
    )
    assert result.captions_file_id == "stored:job-cap-captions"
    assert "job-cap-captions" in files.stored
    with open(files._files["stored:job-cap-captions"], encoding="utf-8") as f:
        track = json.load(f)
    assert [c["text"] for c in track] == ["자막1", "자막2"]
    assert track[0]["start"] == 0.0
    assert track[1]["start"] == track[0]["end"]  # 순차 누적(앞 씬 끝 = 뒤 씬 시작)
    assert track[1]["end"] > track[1]["start"]


async def test_compose_no_captions_when_subtitles_empty(tmp_path) -> None:
    # 자막이 모두 비면 트랙을 만들지 않는다(captions_file_id=None).
    img = str(tmp_path / "s.png")
    await _make_png(img, "red")
    files = _FakeFileGateway({"f": img})
    compose = ComposeProcessing(
        files=files,
        tts=_FakeTts(),
        visual={"slideshow": SlideshowProcessing()},
        default_visual="slideshow",
        checkpoint=NullSceneCheckpoint(),
    )
    out_dir = str(tmp_path / "out")
    os.makedirs(out_dir, exist_ok=True)
    result = await compose.process(
        type=VideoJobType.COMPOSE,
        params={
            "job_id": "job-nocap",
            "aspect_ratio": "9:16",
            "scene_visual_provider": "slideshow",
            "tts": {},
            "scenes": [{"order": 1, "image_file_id": "f", "narration": "n", "subtitle": ""}],
        },
        source_path=None,
        out_dir=out_dir,
    )
    assert result.captions_file_id is None
    assert "job-nocap-captions" not in files.stored


async def test_compose_mixes_bgm_and_sfx(tmp_path) -> None:
    # BGM(전체) + 씬 효과음(offset)이 최종 오디오에 믹스되고, 영상 길이는 나레이션 기준으로 유지된다.
    img1, img2 = str(tmp_path / "s1.png"), str(tmp_path / "s2.png")
    await _make_png(img1, "red")
    await _make_png(img2, "blue")
    bgm, sfx = str(tmp_path / "bgm.m4a"), str(tmp_path / "sfx.m4a")
    await _make_tone(bgm, 2.0, 220)  # 2초: 6초 영상에 루프되어야 한다.
    await _make_tone(sfx, 0.4, 880)

    files = _FakeFileGateway({"f1": img1, "f2": img2, "bgm1": bgm, "sfx1": sfx})
    compose = ComposeProcessing(
        files=files,
        tts=_FakeTts(),
        visual={"slideshow": SlideshowProcessing()},
        default_visual="slideshow",
        checkpoint=NullSceneCheckpoint(),
    )
    out_dir = str(tmp_path / "out")
    os.makedirs(out_dir, exist_ok=True)
    result = await compose.process(
        type=VideoJobType.COMPOSE,
        params={
            "aspect_ratio": "9:16",
            "scene_visual_provider": "slideshow",
            "tts": {"provider": "edge-tts", "voice": "ko-KR-SunHiNeural", "pitch": "+0Hz"},
            "bgm": {"file_id": "bgm1"},
            "scenes": [
                {"order": 1, "image_file_id": "f1", "narration": "첫 씬", "subtitle": "자막1",
                 "sfx": [{"file_id": "sfx1", "offset_sec": 0.5}]},
                {"order": 2, "image_file_id": "f2", "narration": "둘째 씬", "subtitle": "자막2"},
            ],
        },
        source_path=None,
        out_dir=out_dir,
    )
    assert os.path.exists(result.path)
    assert "bgm1" in files.downloaded  # BGM fetch
    assert "sfx1" in files.downloaded  # 효과음 fetch
    total = await ffmpeg_ops.probe_duration(result.path)
    # 무음 TTS 2씬(각 3초) ≈ 6초: BGM(2초)이 duration=first 로 늘어나지 않고 영상 길이가 유지된다.
    assert 5.0 < total < 9.0, f"BGM 이 영상 길이를 바꾸면 안 된다: {total}"


async def test_compose_sfx_straddles_scene_cut(tmp_path) -> None:
    # 음수 offset 효과음(씬 2 앵커, -0.5초)은 씬 1→2 전환에 걸쳐 배치돼도 크래시 없이 렌더되고,
    # 영상 길이는 나레이션 기준(≈6초)으로 유지된다(씬 경계로 안 막고 [0,total] 로만 클램프).
    img1, img2 = str(tmp_path / "s1.png"), str(tmp_path / "s2.png")
    await _make_png(img1, "red")
    await _make_png(img2, "blue")
    sfx = str(tmp_path / "sfx.m4a")
    await _make_tone(sfx, 0.6, 880)

    files = _FakeFileGateway({"f1": img1, "f2": img2, "sfx1": sfx})
    compose = ComposeProcessing(
        files=files,
        tts=_FakeTts(),
        visual={"slideshow": SlideshowProcessing()},
        default_visual="slideshow",
        checkpoint=NullSceneCheckpoint(),
    )
    out_dir = str(tmp_path / "out")
    os.makedirs(out_dir, exist_ok=True)
    result = await compose.process(
        type=VideoJobType.COMPOSE,
        params={
            "aspect_ratio": "9:16",
            "scene_visual_provider": "slideshow",
            "scenes": [
                {"order": 1, "image_file_id": "f1", "narration": "첫 씬", "subtitle": "s1"},
                # 씬 2 앵커 + 음수 오프셋 → 씬 1→2 전환에 걸침.
                {"order": 2, "image_file_id": "f2", "narration": "둘째 씬", "subtitle": "s2",
                 "sfx": [{"file_id": "sfx1", "offset_sec": -0.5}]},
            ],
        },
        source_path=None,
        out_dir=out_dir,
    )
    assert os.path.exists(result.path)
    assert "sfx1" in files.downloaded
    total = await ffmpeg_ops.probe_duration(result.path)
    assert 5.0 < total < 9.0, f"전환 걸침이 영상 길이를 바꾸면 안 된다: {total}"


async def test_mix_final_audio_caps_bgm_to_video_length(tmp_path) -> None:
    # ffmpeg_ops.mix_final_audio 단위: 짧은 BGM 이 루프되고, 결과 길이가 영상 길이로 캡되며, 오디오가 생긴다.
    video, bgm, sfx, out = (
        str(tmp_path / "v.mp4"),
        str(tmp_path / "b.m4a"),
        str(tmp_path / "s.m4a"),
        str(tmp_path / "o.mp4"),
    )
    await _make_clip(video, 4.0)  # 4초 무음 v+a
    await _make_tone(bgm, 1.0, 220)  # 1초: 4초로 루프되어야 한다.
    await _make_tone(sfx, 0.3, 880)

    await ffmpeg_ops.mix_final_audio(video, bgm, [(sfx, 1.5)], out)

    assert os.path.exists(out)
    assert await ffmpeg_ops._has_audio(out)
    dur = await ffmpeg_ops.probe_duration(out)
    assert 3.6 < dur < 4.6, f"영상 길이 유지(무한 루프 BGM 캡): {dur}"


async def test_compose_single_scene_skips_concat(tmp_path) -> None:
    img = str(tmp_path / "only.png")
    await _make_png(img, "green")
    compose = ComposeProcessing(
        files=_FakeFileGateway({"f": img}),
        tts=_FakeTts(),
        visual={"slideshow": SlideshowProcessing()},
        default_visual="slideshow",
        checkpoint=NullSceneCheckpoint(),
    )
    out_dir = str(tmp_path / "out")
    os.makedirs(out_dir, exist_ok=True)
    result = await compose.process(
        type=VideoJobType.COMPOSE,
        params={"aspect_ratio": "9:16", "scenes": [{"order": 1, "image_file_id": "f", "narration": "단일 씬"}]},
        source_path=None,
        out_dir=out_dir,
    )
    assert os.path.exists(result.path)
    total = await ffmpeg_ops.probe_duration(result.path)
    assert 2.5 < total < 4.5, f"단일 씬 길이(나레이션 3s): {total}"


async def test_resume_skips_completed_scene(tmp_path) -> None:
    # 체크포인트에 완성 클립(clip_file_id)이 있으면 재렌더 없이 회수만 한다(TTS/비주얼 미호출).
    img = str(tmp_path / "s.png")
    done_clip = str(tmp_path / "done.mp4")
    await _make_png(img, "red")
    await _make_clip(done_clip, 3.0)

    files = _FakeFileGateway({"f": img, "clip1": done_clip})
    tts = _FakeTts()
    compose = ComposeProcessing(
        files=files, tts=tts,
        visual={"slideshow": SlideshowProcessing()}, default_visual="slideshow",
        checkpoint=_FakeCheckpoint({1: {"clip_file_id": "clip1"}}),
    )
    out_dir = str(tmp_path / "out")
    os.makedirs(out_dir, exist_ok=True)
    result = await compose.process(
        type=VideoJobType.COMPOSE,
        params={"job_id": "J1", "scenes": [{"order": 1, "image_file_id": "f", "narration": "x"}]},
        source_path=None, out_dir=out_dir,
    )
    assert os.path.exists(result.path)
    assert "clip1" in files.downloaded  # 완성 클립 회수
    assert "f" not in files.downloaded  # 원본 이미지 재fetch 안 함(재렌더 skip)
    assert tts.calls == 0  # TTS 도 안 함


async def test_resumable_visual_persists_prompt_id(tmp_path) -> None:
    # 재개가능 비주얼(Wan 대역): 제출 즉시 prompt_id 를 체크포인트에 남기고 폴링한다.
    img = str(tmp_path / "s.png")
    await _make_png(img, "red")
    ckpt = _FakeCheckpoint()
    visual = _FakeResumableVisual()
    compose = ComposeProcessing(
        files=_FakeFileGateway({"f": img}), tts=_FakeTts(),
        visual={"wan": visual}, default_visual="wan", checkpoint=ckpt,
    )
    out_dir = str(tmp_path / "out")
    os.makedirs(out_dir, exist_ok=True)
    result = await compose.process(
        type=VideoJobType.COMPOSE,
        params={"job_id": "J2", "scene_visual_provider": "wan",
                "scenes": [{"order": 1, "image_file_id": "f", "narration": "x"}]},
        source_path=None, out_dir=out_dir,
    )
    assert os.path.exists(result.path)
    assert visual.submit_calls == 1
    assert visual.polled == ["prompt-new"]
    # prompt_id 가 즉시 영속됐는지(재시작 시 재폴링 근거).
    assert any(rec.get("prompt_id") == "prompt-new" for _o, rec in ckpt.saves)


async def test_comfyui_image_name_unique_per_scene_and_job(tmp_path) -> None:
    # 공유 ComfyUI 충돌 회귀: 씬 이미지 업로드 파일명(basename)이 (job, scene)마다 유일해야
    # overwrite=true 로 다른 잡/씬의 입력을 덮어쓰지 않는다(동시 렌더 시 씬 뒤바뀜/누락 방지).
    img = str(tmp_path / "s.png")
    await _make_png(img, "red")

    async def upload_names(job_id: str, orders: list[int]) -> list[str]:
        visual = _FakeResumableVisual()
        compose = ComposeProcessing(
            files=_FakeFileGateway({"f": img}), tts=_FakeTts(),
            visual={"wan": visual}, default_visual="wan", checkpoint=_FakeCheckpoint(),
        )
        out_dir = str(tmp_path / f"out-{job_id}")
        os.makedirs(out_dir, exist_ok=True)
        await compose.process(
            type=VideoJobType.COMPOSE,
            params={
                "job_id": job_id,
                "scene_visual_provider": "wan",
                "scenes": [
                    {"order": o, "image_file_id": "f", "narration": "x"} for o in orders
                ],
            },
            source_path=None,
            out_dir=out_dir,
        )
        return [os.path.basename(p) for p in visual.submitted]

    a = await upload_names("JOB-A", [1, 2])
    b = await upload_names("JOB-B", [1, 2])
    assert len(set(a)) == len(a) == 2, f"한 잡 안에서 씬별 업로드 이름 충돌: {a}"
    assert set(a).isdisjoint(set(b)), f"잡 간 업로드 이름 충돌(동시 렌더 덮어쓰기 위험): {a} vs {b}"


async def test_resume_reuses_existing_prompt_id(tmp_path) -> None:
    # 이미 제출된 prompt_id 가 있으면 재제출 없이 그 handle 로 재폴링(GPU 재작업 0).
    img = str(tmp_path / "s.png")
    await _make_png(img, "red")
    visual = _FakeResumableVisual()
    compose = ComposeProcessing(
        files=_FakeFileGateway({"f": img}), tts=_FakeTts(),
        visual={"wan": visual}, default_visual="wan",
        checkpoint=_FakeCheckpoint({1: {"prompt_id": "prompt-existing"}}),
    )
    out_dir = str(tmp_path / "out")
    os.makedirs(out_dir, exist_ok=True)
    await compose.process(
        type=VideoJobType.COMPOSE,
        params={"job_id": "J3", "scene_visual_provider": "wan",
                "scenes": [{"order": 1, "image_file_id": "f", "narration": "x"}]},
        source_path=None, out_dir=out_dir,
    )
    assert visual.submit_calls == 0  # 재제출 안 함
    assert visual.polled == ["prompt-existing"]  # 기존 handle 재폴링
class _FakeBillableVisual(_FakeResumableVisual):
    """청구 초를 보고하는 재개가능 비주얼(Grok 대역): BillableVisualPort 형태.

    씬 나레이션 길이와 무관하게 벤더에 보낸 정수초를 돌려준다(그게 청구 단위다).
    """

    def __init__(self, seconds: int = 7) -> None:
        super().__init__()
        self.seconds = seconds

    def billable_seconds(self, params: dict) -> int:
        return self.seconds


async def test_free_visual_reports_no_usage(tmp_path) -> None:
    """사내 provider(slideshow)는 usage 가 None 이다. 0 이 아니다.

    0 을 채우면 '무료라서 0' 과 '사용량을 못 받아서 0' 을 화면이 구분할 수 없게 된다.
    """
    img = str(tmp_path / "s.png")
    await _make_png(img, "red")
    compose = ComposeProcessing(
        files=_FakeFileGateway({"f": img}), tts=_FakeTts(),
        visual={"slideshow": SlideshowProcessing()}, default_visual="slideshow",
        checkpoint=NullSceneCheckpoint(),
    )
    out_dir = str(tmp_path / "out")
    os.makedirs(out_dir, exist_ok=True)
    result = await compose.process(
        type=VideoJobType.COMPOSE,
        params={"scenes": [{"order": 1, "image_file_id": "f", "narration": "x"}]},
        source_path=None, out_dir=out_dir,
    )
    assert result.usage is None


async def test_billable_visual_accumulates_integer_seconds(tmp_path) -> None:
    # 유료 provider: 씬마다 provider 가 보고한 정수초를 합산하고 씬별 배열도 남긴다.
    img = str(tmp_path / "s.png")
    await _make_png(img, "red")
    visual = _FakeBillableVisual(seconds=7)
    compose = ComposeProcessing(
        files=_FakeFileGateway({"f": img}), tts=_FakeTts(),
        visual={"grok": visual, "slideshow": SlideshowProcessing()},
        default_visual="slideshow", checkpoint=_FakeCheckpoint(),
    )
    out_dir = str(tmp_path / "out")
    os.makedirs(out_dir, exist_ok=True)
    result = await compose.process(
        type=VideoJobType.COMPOSE,
        params={"job_id": "J-bill", "scene_visual_provider": "grok",
                "scenes": [
                    {"order": 1, "image_file_id": "f", "narration": "짧은 나레이션"},
                    {"order": 2, "image_file_id": "f", "narration": "조금 더 긴 나레이션입니다"},
                ]},
        source_path=None, out_dir=out_dir,
    )
    assert result.usage is not None
    assert result.usage.provider == "grok"        # **유효** provider(요청값이 아니라 실제로 돈 쪽)
    assert result.usage.scene_seconds == [7, 7]
    assert result.usage.output_video_seconds == 14
    assert result.usage.input_image_count == 2     # 씬 비주얼 1건당 입력 이미지 1장
    assert result.usage.scene_count == 2


async def test_billable_visual_falls_back_to_free_reports_no_usage(tmp_path) -> None:
    """요청 provider 가 미등록이면 slideshow 로 폴백 → usage 는 None(비용이 붙지 않는다).

    비용은 실제로 돈이 나간 쪽에만 붙어야 한다. 폴백된 무료 렌더에 요청 모델 단가가
    붙으면 청구서에 없는 금액이 원장에 생긴다.
    """
    img = str(tmp_path / "s.png")
    await _make_png(img, "red")
    compose = ComposeProcessing(
        files=_FakeFileGateway({"f": img}), tts=_FakeTts(),
        visual={"slideshow": SlideshowProcessing()}, default_visual="slideshow",
        checkpoint=NullSceneCheckpoint(),
    )
    out_dir = str(tmp_path / "out")
    os.makedirs(out_dir, exist_ok=True)
    result = await compose.process(
        type=VideoJobType.COMPOSE,
        params={"scene_visual_provider": "grok-imagine-video",   # 미등록 → 폴백
                "scenes": [{"order": 1, "image_file_id": "f", "narration": "x"}]},
        source_path=None, out_dir=out_dir,
    )
    assert result.usage is None


async def test_unregistered_provider_without_scene_images_fails_with_the_real_reason(
    tmp_path,
) -> None:
    """씬 이미지가 없는 잡은 폴백하지 않는다. 기본 비주얼은 이미지 한 장을 받아 만들기 때문이다.

    폴백하면 씬 렌더가 "슬라이드쇼: 씬 이미지가 필요합니다" 로 죽어, 실제 원인(그 provider 가 이
    워커에 없다)을 가린다. 실제로 그렇게 죽은 잡이 있었고, 화면에는 이미지가 필요하다는 메시지만
    떴다(텍스트→영상 버전이라 이미지가 있을 수 없는 잡이었다).

    메시지가 provider 이름과 등록 목록을 담는지도 함께 본다: 그 둘이 없으면 배포/재기동 중 어느
    문제인지 알 수 없다.
    """
    compose = ComposeProcessing(
        files=_FakeFileGateway({}), tts=_FakeTts(),
        visual={"slideshow": SlideshowProcessing()}, default_visual="slideshow",
        checkpoint=NullSceneCheckpoint(),
    )
    out_dir = str(tmp_path / "out")
    os.makedirs(out_dir, exist_ok=True)
    with pytest.raises(PermanentRenderError) as exc:
        await compose.process(
            type=VideoJobType.COMPOSE,
            params={"scene_visual_provider": "gemini",  # 미등록(워커가 옛 코드로 떠 있는 경우)
                    "scene_visual_model": "veo-3.1-fast-generate-preview",
                    "scenes": [{"order": 1, "visual_prompt": "a cat", "dialogue": "x"}]},
            source_path=None, out_dir=out_dir,
        )
    assert "gemini" in str(exc.value)
    assert "slideshow" in str(exc.value)


async def test_unregistered_provider_with_scene_images_still_falls_back(tmp_path) -> None:
    """이미지가 있는 잡은 예전처럼 폴백한다: 위 차단이 과해지면 이 테스트가 깨진다.

    그 잡은 기본 비주얼로 실제로 만들 수 있고(이미지가 있다), 씬 하나가 미배포 provider 때문에
    통째로 실패하는 것보다 모션 없는 클립이 낫다.
    """
    img = str(tmp_path / "s.png")
    await _make_png(img, "blue")
    compose = ComposeProcessing(
        files=_FakeFileGateway({"f": img}), tts=_FakeTts(),
        visual={"slideshow": SlideshowProcessing()}, default_visual="slideshow",
        checkpoint=NullSceneCheckpoint(),
    )
    out_dir = str(tmp_path / "out")
    os.makedirs(out_dir, exist_ok=True)
    result = await compose.process(
        type=VideoJobType.COMPOSE,
        params={"scene_visual_provider": "gemini",
                "scenes": [{"order": 1, "image_file_id": "f", "narration": "x"}]},
        source_path=None, out_dir=out_dir,
    )
    assert os.path.exists(result.path)


async def test_resumed_scene_keeps_billed_seconds_from_checkpoint(tmp_path) -> None:
    """재개: 회수한 씬은 이전 제출 시점의 청구 초를, 새로 렌더한 씬은 지금 값을 더한다.

    이게 깨지면 워커가 중간에 죽고 재개할 때마다 합계가 과소 계산돼 원장이 청구서보다 싸진다.
    """
    img = str(tmp_path / "s.png")
    done_clip = str(tmp_path / "done.mp4")
    await _make_png(img, "red")
    await _make_clip(done_clip, 3.0)

    visual = _FakeBillableVisual(seconds=5)
    compose = ComposeProcessing(
        files=_FakeFileGateway({"f": img, "clip1": done_clip}), tts=_FakeTts(),
        visual={"grok": visual, "slideshow": SlideshowProcessing()}, default_visual="slideshow",
        # 씬 1 = 이전 실행에서 완료(9초 청구됨), 씬 2 = 미완 → 새로 렌더(5초).
        checkpoint=_FakeCheckpoint({1: {"clip_file_id": "clip1", "billed_seconds": 9}}),
    )
    out_dir = str(tmp_path / "out")
    os.makedirs(out_dir, exist_ok=True)
    result = await compose.process(
        type=VideoJobType.COMPOSE,
        # aspect_ratio 를 명시하는 이유: 회수 클립(_make_clip=704x1280)과 새로 렌더한 씬의
        #   해상도가 같아야 concat 이 붙는다(운영에선 두 클립 모두 같은 잡 설정에서 나와 자동 일치).
        params={"job_id": "J-resume", "aspect_ratio": "9:16", "scene_visual_provider": "grok",
                "scenes": [
                    {"order": 1, "image_file_id": "f", "narration": "x"},
                    {"order": 2, "image_file_id": "f", "narration": "y"},
                ]},
        source_path=None, out_dir=out_dir,
    )
    assert visual.submit_calls == 1                  # 씬 2 만 새로 제출
    assert result.usage is not None
    assert result.usage.scene_seconds == [9, 5]      # 회수분 + 신규분
    assert result.usage.output_video_seconds == 14
class _DeadHandleVisual(_FakeResumableVisual):
    """제출은 되지만 폴링에서 벤더가 '확정 실패' 를 알리는 비주얼(xAI failed/expired 재현)."""

    async def poll_to_file(self, handle, out_dir, params=None):
        from app.domains.video.core.domain.errors import DeadVisualHandleError

        raise DeadVisualHandleError("xAI 영상 생성 실패(failed): Temporarily unable to store the generated file.")


async def test_dead_vendor_handle_is_dropped_so_next_attempt_resubmits(tmp_path) -> None:
    """벤더가 요청을 확정 실패로 못박으면 그 씬 handle 을 버려야 한다.

    버리지 않으면 다음 시도가 같은 죽은 request_id 를 재폴링해 영원히 같은 실패를 되풀이한다
    스위퍼 재큐잉 한도(10회)를 다 쓰는 동안 화면은 계속 '만드는중' 이다. 실제로 그렇게 렌더 하나가
    이틀을 소모했고, 이 테스트가 그 회귀를 막는다.
    """
    from app.domains.video.core.domain.errors import DeadVisualHandleError

    img = str(tmp_path / "s.png")
    await _make_png(img, "red")
    ckpt = _FakeCheckpoint({1: {"prompt_id": "req-dead"}})   # 이전 시도가 남긴 handle
    compose = ComposeProcessing(
        files=_FakeFileGateway({"f": img}), tts=_FakeTts(),
        visual={"grok": _DeadHandleVisual(), "slideshow": SlideshowProcessing()},
        default_visual="slideshow", checkpoint=ckpt,
    )
    out_dir = str(tmp_path / "out")
    os.makedirs(out_dir, exist_ok=True)

    with pytest.raises(DeadVisualHandleError):
        await compose.process(
            type=VideoJobType.COMPOSE,
            params={"job_id": "J-dead", "scene_visual_provider": "grok",
                    "scenes": [{"order": 1, "image_file_id": "f", "narration": "x"}]},
            source_path=None, out_dir=out_dir,
        )

    assert ckpt.dropped == [1], "죽은 handle 을 버리지 않으면 다음 시도가 또 재폴링한다"
    assert "prompt_id" not in ckpt.state[1], "handle 이 남아 있으면 재제출 대신 재폴링한다"


class _PromptRecordingVisual(_FakeResumableVisual):
    """비주얼에 실제로 전달된 프롬프트와 소스 경로를 기록한다."""

    def __init__(self) -> None:
        super().__init__()
        self.prompts: list[str] = []
        self.sources: list[str | None] = []

    async def submit(self, params: dict, source_path: str | None) -> str:
        self.prompts.append(str(params.get("prompt") or ""))
        self.sources.append(source_path)
        return await super().submit(params, source_path)


async def _compose_with(visual, scenes: list[dict], tmp_path, files=None) -> None:
    """씬 목록으로 한 번 렌더한다(프롬프트/소스 전달만 보는 테스트용)."""
    compose = ComposeProcessing(
        files=files or _FakeFileGateway({}),
        tts=_FakeTts(),
        visual={"v": visual},
        default_visual="v",
        checkpoint=NullSceneCheckpoint(),
    )
    out_dir = str(tmp_path / "out")
    os.makedirs(out_dir, exist_ok=True)
    await compose.process(
        type=VideoJobType.COMPOSE,
        params={
            # 재개 가능 비주얼(submit/poll)은 job_id 가 있어야 그 경로를 탄다.
            "job_id": "J-prompt",
            "aspect_ratio": "9:16",
            "scene_visual_provider": "v",
            "tts": {"provider": "edge-tts", "voice": "ko-KR-SunHiNeural", "pitch": "+0Hz"},
            "scenes": scenes,
        },
        source_path=None,
        out_dir=out_dir,
    )


async def test_scene_without_image_uses_its_own_visual_prompt(tmp_path) -> None:
    """텍스트→영상: 씬마다 자기 화면 묘사가 프롬프트가 된다.

    공통 모션 문구를 그대로 주면 모든 씬이 같은 영상이 된다(씬 이미지가 없어 구분할 근거가 그
    문장뿐이다). 이미지를 받으러 가지도 않는다: 그 버전에는 받을 이미지가 없다.
    """
    visual = _PromptRecordingVisual()
    await _compose_with(
        visual,
        [
            {"order": 1, "image_file_id": None, "narration": "", "subtitle": "",
             "visual_prompt": "a red car on a bridge"},
            {"order": 2, "image_file_id": None, "narration": "", "subtitle": "",
             "visual_prompt": "a blue boat at sunset"},
        ],
        tmp_path,
    )
    assert visual.prompts == ["a red car on a bridge", "a blue boat at sunset"]
    assert visual.sources == [None, None]


async def test_scene_with_image_keeps_motion_prompt(tmp_path) -> None:
    """이미지→영상: 화면은 이미지가 정했으므로 프롬프트는 움직임 지시로 남는다.

    회귀 가드다. 화면 묘사를 여기에 넣으면 이미 정해진 화면과 경쟁하는 지시가 되어 모션이 나빠지고,
    그 사실은 결과 영상에서만 드러난다.
    """
    img = str(tmp_path / "s.png")
    await _make_png(img, "red")
    visual = _PromptRecordingVisual()
    await _compose_with(
        visual,
        [{"order": 1, "image_file_id": "f1", "narration": "", "subtitle": "",
          "visual_prompt": "a red car on a bridge"}],
        tmp_path,
        files=_FakeFileGateway({"f1": img}),
    )
    assert visual.prompts == [SCENE_MOTION_PROMPT.content]
    assert visual.sources[0] is not None


class _OrderRecordingVisual(_FakeResumableVisual):
    """세그먼트가 실제로 겹쳐 돌았는지 보려고 동시 실행 수를 기록한다."""

    def __init__(self) -> None:
        super().__init__()
        self.running = 0
        self.peak = 0

    async def poll_to_file(self, handle: str, out_dir: str, params: dict | None = None) -> str:
        self.running += 1
        self.peak = max(self.peak, self.running)
        try:
            # 겹칠 기회를 만든다: 순차라면 이 대기 동안 다른 씬이 들어오지 못한다.
            await asyncio.sleep(0.05)
            return await super().poll_to_file(handle, out_dir, params)
        finally:
            self.running -= 1


async def _compose_segments(visual, mode: str | None, tmp_path, parallelism: int | None = None) -> None:
    """씬 셋으로 한 번 렌더한다(연결 방식만 보는 테스트용)."""
    compose = ComposeProcessing(
        files=_FakeFileGateway({}),
        tts=_FakeTts(),
        visual={"v": visual},
        default_visual="v",
        checkpoint=NullSceneCheckpoint(),
        **({"segment_parallelism": parallelism} if parallelism is not None else {}),
    )
    out_dir = str(tmp_path / "out")
    os.makedirs(out_dir, exist_ok=True)
    await compose.process(
        type=VideoJobType.COMPOSE,
        params={
            "job_id": "J-seg",
            "aspect_ratio": "9:16",
            "scene_visual_provider": "v",
            "tts": {"provider": "edge-tts", "voice": "ko-KR-SunHiNeural", "pitch": "+0Hz"},
            **({"segment_mode": mode} if mode is not None else {}),
            "scenes": [
                {"order": i, "image_file_id": None, "narration": "", "subtitle": "",
                 "visual_prompt": f"scene {i}"}
                for i in (1, 2, 3)
            ],
        },
        source_path=None,
        out_dir=out_dir,
    )


async def test_segments_run_one_at_a_time_by_default(tmp_path) -> None:
    """기본은 순차다. 값이 없는 잡(구 잡)이 갑자기 병렬로 돌면 부하가 한꺼번에 밀린다."""
    visual = _OrderRecordingVisual()
    await _compose_segments(visual, None, tmp_path)
    assert visual.peak == 1


async def test_unknown_segment_mode_falls_back_to_sequential(tmp_path) -> None:
    """모르는 값도 순차로 접는다. 오타 하나가 부하 폭증이 되지 않게."""
    visual = _OrderRecordingVisual()
    await _compose_segments(visual, "없는-방식", tmp_path)
    assert visual.peak == 1


async def test_parallel_mode_overlaps_segments(tmp_path) -> None:
    """'빠른 생성' 은 세그먼트를 겹쳐 만든다. 순서는 그대로여야 한다(이어붙이는 순서가 영상 순서다)."""
    visual = _OrderRecordingVisual()
    await _compose_segments(visual, "parallel", tmp_path)
    assert visual.peak > 1
    # 폴링은 겹쳐도 제출 순서는 씬 순서를 따른다(gather 가 입력 순서로 코루틴을 만든다).
    assert visual.submit_calls == 3


async def test_parallelism_setting_caps_overlap(tmp_path) -> None:
    """동시 씬 수는 설정이 정한다. 1 로 두면 병렬을 골라도 순차와 같다(공유 GPU 를 아껴야 하는 배포용)."""
    visual = _OrderRecordingVisual()
    await _compose_segments(visual, "parallel", tmp_path, parallelism=1)
    assert visual.peak == 1
    assert visual.submit_calls == 3


class _FailingSecondVisual(_FakeResumableVisual):
    """씬 2 제출이 곧바로 거절되고 나머지 씬은 오래 폴링하는 비주얼(한도 초과 재현)."""

    async def submit(self, params: dict, source_path: str | None) -> str:
        from app.domains.video.core.domain.errors import VendorTransientError
        from app.domains.video.core.domain.render_failure import RenderFailure

        self.submit_calls += 1
        if "scene 2" in str(params.get("prompt")):
            raise VendorTransientError("v 요청 한도 초과(429): quota", failure=RenderFailure.RATE_LIMITED)
        return f"handle-{self.submit_calls}"

    async def poll_to_file(self, handle: str, out_dir: str, params: dict | None = None) -> str:
        await asyncio.sleep(30)
        return await super().poll_to_file(handle, out_dir, params)


async def test_parallel_failure_cancels_sibling_segments(tmp_path) -> None:
    """병렬에서 씬 하나가 실패하면 나머지 폴링을 취소하고 올린다.

    gather 는 첫 예외를 올리면서 형제를 그대로 두므로, 그냥 쓰면 실패한 잡의 나머지 씬이 백그라운드에서
    벤더를 계속 폴링해 한도를 더 쓴다. 취소해도 잃는 것은 없다(handle 은 체크포인트에 남아 다음 시도가 회수).
    """
    from app.domains.video.core.domain.errors import VendorTransientError

    visual = _FailingSecondVisual()
    started = asyncio.get_running_loop().time()
    with pytest.raises(VendorTransientError):
        await _compose_segments(visual, "parallel", tmp_path)
    # 형제가 취소되지 않았으면 30초 폴링이 끝나기를 기다렸을 것이다.
    assert asyncio.get_running_loop().time() - started < 10


class _TalkingVisual(_FakeResumableVisual):
    """오디오를 가진 클립을 내는 비주얼(대사를 내는 영상 모델 대역)."""

    async def poll_to_file(self, handle: str, out_dir: str, params: dict | None = None) -> str:
        self.polled.append(handle)
        out = os.path.join(out_dir, "result.mp4")
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", "color=c=navy:s=704x1280:r=30",
            # 대사 대역: 들리는 소리가 있어야 '살아남았는지' 를 확인할 수 있다.
            "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100",
            "-t", "6", "-c:v", "libx264", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-shortest", out,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        await proc.communicate()
        return out


async def _compose_narration(visual, use_narration, tmp_path, scene=None, tts=None, synthesize=None):
    compose = ComposeProcessing(
        files=_FakeFileGateway({}),
        tts=tts or _FakeTts(),
        visual={"v": visual},
        default_visual="v",
        checkpoint=NullSceneCheckpoint(),
    )
    out_dir = str(tmp_path / "out")
    os.makedirs(out_dir, exist_ok=True)
    return await compose.process(
        type=VideoJobType.COMPOSE,
        params={
            "job_id": "J-nar",
            "aspect_ratio": "9:16",
            "scene_visual_provider": "v",
            "tts": {"provider": "edge-tts", "voice": "ko-KR-SunHiNeural", "pitch": "+0Hz"},
            **({} if use_narration is None else {"use_narration": use_narration}),
            **({} if synthesize is None else {"synthesize_speech": synthesize}),
            "scenes": [
                scene
                or {"order": 1, "image_file_id": None, "narration": "나레이션 문장",
                    "subtitle": "", "visual_prompt": "a scene"},
            ],
        },
        source_path=None,
        out_dir=out_dir,
    )


async def test_narration_off_keeps_clip_audio_and_length(tmp_path) -> None:
    """나레이션을 끄면 클립의 대사가 살아남고 길이도 클립이 정한다.

    자르면 문장이 잘린다: 대사는 클립 안에서 이미 발화가 끝나 있다. 그래서 목표 길이로 맞추지 않는다.
    """
    result = await _compose_narration(_TalkingVisual(), False, tmp_path)
    assert await ffmpeg_ops._has_audio(result.path)
    # 6초 클립을 그대로 쓴다(나레이션 길이로 자르지 않는다).
    assert 5.5 < await ffmpeg_ops.probe_duration(result.path) < 6.5


async def test_narration_on_replaces_clip_audio(tmp_path) -> None:
    """나레이션을 켜면 클립의 오디오를 버리고 나레이션만 남는다.

    둘 다 남기면 한 영상에서 두 사람이 동시에 말한다. 그래서 이 경로는 믹스가 아니라 교체다.
    """
    result = await _compose_narration(_TalkingVisual(), True, tmp_path)
    assert await ffmpeg_ops._has_audio(result.path)
    # 나레이션(_FakeTts 가 만드는 길이)이 길이를 정한다: 6초 클립이 그 길이로 맞춰진다.
    assert await ffmpeg_ops.probe_duration(result.path) < 5.5


async def test_narration_defaults_to_on(tmp_path) -> None:
    """값이 없는 잡(구 잡)은 지금까지 나레이션으로 만들어졌다. 갑자기 대사로 바뀌면 안 된다."""
    result = await _compose_narration(_TalkingVisual(), None, tmp_path)
    assert await ffmpeg_ops.probe_duration(result.path) < 5.5


# 대화내용(dialogue): 한 문장, 화자는 스위치가 정한다


class _PromptCapturingVisual(_FakeResumableVisual):
    """submit 에 실린 프롬프트를 기록하는 비주얼(벤더로 무엇이 나가는지 확인용)."""

    def __init__(self) -> None:
        super().__init__()
        self.prompts: list[str] = []

    async def submit(self, params: dict, source_path: str | None) -> str:
        self.prompts.append(str(params.get("prompt") or ""))
        return await super().submit(params, source_path)


class _TextCapturingTts(_FakeTts):
    """TTS 에 넘어간 문장을 기록한다(무엇으로 mp3 를 만들었는지)."""

    def __init__(self) -> None:
        super().__init__()
        self.texts: list[str] = []

    async def synthesize(self, text, voice, pitch, out_path, *, provider="", api_key="") -> None:
        self.texts.append(text)
        await super().synthesize(text, voice, pitch, out_path, provider=provider, api_key=api_key)


_DIALOGUE_SCENE = {
    "order": 1,
    "image_file_id": None,
    "narration": "",
    "dialogue": "이거 진짜 부드러워요",
    "subtitle": "",
    "visual_prompt": "젊은 엄마가 아기를 안고 창가에 서 있다",
}


async def test_dialogue_reaches_vendor_prompt_when_narration_off(tmp_path) -> None:
    """나레이션을 끄면 대화내용이 영상 프롬프트에 대사로 실린다.

    이 서버가 그 표기법의 주인인 이유는 벤더 계약이기 때문이다. 영상 모델은 대사를 별도 필드로 받지
    않아서, 프롬프트 안에 적지 않으면 인물이 입만 움직이는 영상이 나온다.
    """
    visual = _PromptCapturingVisual()
    tts = _TextCapturingTts()
    await _compose_narration(visual, False, tmp_path, scene=_DIALOGUE_SCENE, tts=tts)

    assert visual.prompts, "제출된 프롬프트가 없다"
    prompt = visual.prompts[0]
    assert "젊은 엄마가 아기를 안고 창가에 서 있다" in prompt  # 화면 묘사
    assert "이거 진짜 부드러워요" in prompt  # 대사
    # 이 경로에는 화면 밖 목소리가 없다. TTS 를 부르면 두 사람이 동시에 말한다.
    assert tts.calls == 0


async def test_dialogue_goes_to_tts_when_narration_on(tmp_path) -> None:
    """나레이션을 켜면 같은 문장이 mp3 로 가고 프롬프트에는 실리지 않는다.

    자리는 하나이고 스위치가 행선지를 정한다. 둘 다 가면 한 화면에서 두 사람이 말한다.
    """
    visual = _PromptCapturingVisual()
    tts = _TextCapturingTts()
    await _compose_narration(visual, True, tmp_path, scene=_DIALOGUE_SCENE, tts=tts)

    assert tts.texts == ["이거 진짜 부드러워요"]
    assert "이거 진짜 부드러워요" not in visual.prompts[0]
    assert "젊은 엄마가 아기를 안고 창가에 서 있다" in visual.prompts[0]


async def test_narration_length_decides_requested_video_length(tmp_path) -> None:
    """mp3 를 먼저 만들고 그 길이로 영상을 요청한다(순서가 이 파이프라인의 계약이다).

    반대로 하면 말이 잘리거나 뒤에 정적이 남는다. _FakeTts 는 3초 무음을 만든다.
    """
    visual = _PromptCapturingVisual()
    durations: list[float] = []

    async def capture(params: dict, source_path: str | None) -> str:
        durations.append(float(params["duration_sec"]))
        return await _PromptCapturingVisual.submit(visual, params, source_path)

    visual.submit = capture  # type: ignore[method-assign]
    await _compose_narration(visual, True, tmp_path, scene=_DIALOGUE_SCENE, tts=_FakeTts())

    assert durations == [3.0]


async def test_合성_경로는_두_문장을_모두_읽는다(tmp_path) -> None:
    """대사와 나레이션이 둘 다 있으면 둘 다 말해진다.

    둘은 한 씬에 함께 있을 수 있으므로 하나만 읽고 버리면 그 문장이 영상에서 통째로 사라진다.
    합성 경로는 목소리가 하나뿐이라 이어서 읽는다.
    """
    tts = _TextCapturingTts()
    scene = {**_DIALOGUE_SCENE, "narration": "밀착력이 다릅니다"}
    await _compose_narration(_PromptCapturingVisual(), True, tmp_path, scene=scene, tts=tts)
    assert tts.texts == ["이거 진짜 부드러워요 밀착력이 다릅니다"]


async def test_dialogue_directive_never_truncated_by_long_scene(tmp_path) -> None:
    """화면 묘사가 아무리 길어도 대사 절은 살아남는다.

    벤더가 프롬프트의 뒤를 자르므로, 긴 묘사 뒤에 대사를 그냥 붙이면 대사가 통째로 사라진다.
    그 사실은 결과물을 봐야 드러나므로 조립 시점에 묘사 쪽을 먼저 줄인다.
    """
    visual = _PromptCapturingVisual()
    scene = {**_DIALOGUE_SCENE, "visual_prompt": "가" * 5000}
    await _compose_narration(visual, False, tmp_path, scene=scene, tts=_FakeTts())

    prompt = visual.prompts[0]
    assert "이거 진짜 부드러워요" in prompt
    assert len(prompt) <= 2400


class _RecordingVisual:
    """요청 params 를 기록하는 비주얼. 씬에 무엇을 요청했는지(길이/프롬프트)를 보기 위한 것."""

    def __init__(self) -> None:
        self.params: list[dict] = []

    async def process(self, *, type, params, source_path, out_dir) -> ProcessedResult:
        self.params.append(dict(params))
        out = os.path.join(out_dir, "result.mp4")
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=teal:s=704x1280:r=30",
            "-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p", out,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        await proc.communicate()
        return ProcessedResult(path=out, file_name="result.mp4", mime_type="video/mp4")


async def _compose_dialogue_scene(tmp_path, dialogue: str) -> dict:
    """나레이션을 끄고 대사가 있는 씬 하나를 렌더하고, 비주얼에 넘어간 요청 params 를 돌려준다."""
    visual = _RecordingVisual()
    compose = ComposeProcessing(
        files=_FakeFileGateway({}),
        tts=_FakeTts(),
        visual={"rec": visual},
        default_visual="rec",
        checkpoint=NullSceneCheckpoint(),
    )
    out_dir = str(tmp_path / f"out-{len(dialogue)}")
    os.makedirs(out_dir, exist_ok=True)
    await compose.process(
        type=VideoJobType.COMPOSE,
        params={
            "aspect_ratio": "9:16",
            "scene_visual_provider": "rec",
            # 나레이션 끔: 화면 속 인물이 대사를 말한다. 길이의 주인이 대화내용이 된다.
            "use_narration": False,
            "tts": {"provider": "edge-tts", "voice": "ko-KR-SunHiNeural", "pitch": "+0Hz"},
            "scenes": [{"order": 1, "dialogue": dialogue, "subtitle": ""}],
        },
        source_path=None,
        out_dir=out_dir,
    )
    return visual.params[0]


async def test_dialogue_length_drives_requested_duration(tmp_path) -> None:
    """나레이션을 끈 씬은 대화내용이 요청 길이를 정한다.

    이 경로는 받아온 클립을 자르지도 늘리지도 않으므로(발화가 클립 안에서 끝나 있다) 요청 길이가
    결과에 닿는 유일한 손잡이다. 대화내용과 무관하게 고정 길이를 요청하면 벤더는 말이 끝나지
    않는 클립을 만든다.
    """
    short = await _compose_dialogue_scene(tmp_path, "가루가 날려요")
    long = await _compose_dialogue_scene(
        tmp_path, "파우더를 바를 때마다 날리는 가루, 고르게 밀착되지 않고 뭉치기도 하죠"
    )

    assert long["duration_sec"] > short["duration_sec"], "긴 대사에 더 긴 길이를 요청해야 한다"
    # 예전 고정값(4.0)에 머물지 않는다: 저 길이의 대사는 4초에 끝나지 않는다.
    assert long["duration_sec"] > 4.0


async def test_scene_duration_override_wins_over_estimate(tmp_path) -> None:
    """사람이 지정한 길이가 있으면 추정하지 않는다(켠 경로의 override 규칙과 같다)."""
    visual = _RecordingVisual()
    compose = ComposeProcessing(
        files=_FakeFileGateway({}),
        tts=_FakeTts(),
        visual={"rec": visual},
        default_visual="rec",
        checkpoint=NullSceneCheckpoint(),
    )
    out_dir = str(tmp_path / "out-override")
    os.makedirs(out_dir, exist_ok=True)
    await compose.process(
        type=VideoJobType.COMPOSE,
        params={
            "aspect_ratio": "9:16",
            "scene_visual_provider": "rec",
            "use_narration": False,
            "tts": {"provider": "edge-tts", "voice": "ko-KR-SunHiNeural", "pitch": "+0Hz"},
            "scenes": [
                {"order": 1, "dialogue": "아주 긴 대사를 여기에 적어 두어도 지정값이 이긴다", "duration_sec": 6, "subtitle": ""}
            ],
        },
        source_path=None,
        out_dir=out_dir,
    )
    assert visual.params[0]["duration_sec"] == 6


async def test_synthesize_speech_false_skips_tts_and_prompts_the_model(tmp_path) -> None:
    """합성하지 않는 잡은 TTS 를 부르지 않고 두 문장을 영상 프롬프트에 싣는다.

    이 갈림이 v1.5 의 전부다. 그 버전은 나레이션을 별도로 합성하지 않고 영상 모델이 말까지 만든다.
    TTS 를 부르면 목소리가 둘이 되고(모델이 낸 것 + 우리가 얹은 것), 프롬프트에 싣지 않으면
    인물이 입만 움직이는 무음 영상이 된다.
    """
    tts = _TextCapturingTts()
    visual = _PromptCapturingVisual()
    scene = {
        "order": 1,
        "image_file_id": None,
        "visual_prompt": "카페 창가",
        "dialogue": "이거 진짜 좋네요",
        "narration": "밀착력이 다릅니다",
        "subtitle": "",
    }
    await _compose_narration(visual, None, tmp_path, scene=scene, tts=tts, synthesize=False)

    assert tts.texts == [], "합성하지 않는 잡인데 TTS 를 불렀다"
    prompt = visual.prompts[0]
    assert "이거 진짜 좋네요" in prompt and "밀착력이 다릅니다" in prompt
    assert "겹치지 않게" in prompt


async def test_synthesize_speech_defaults_to_true_for_old_jobs(tmp_path) -> None:
    """값이 없는 구 잡은 지금까지처럼 합성한다.

    신호의 이름이 `use_narration` 에서 바뀌었다. 옛 이름만 실린 잡이 큐에 남아 있을 수 있고,
    그 잡이 조용히 무음이 되면 아무도 눈치채지 못한다.
    """
    tts = _TextCapturingTts()
    await _compose_narration(_PromptCapturingVisual(), None, tmp_path, tts=tts)
    assert tts.texts == ["나레이션 문장"]


async def test_old_use_narration_flag_still_means_synthesize(tmp_path) -> None:
    """옛 이름(`use_narration`)도 같은 것을 가리킨다. 큐에 남은 잡이 깨지지 않아야 한다."""
    tts = _TextCapturingTts()
    await _compose_narration(_PromptCapturingVisual(), False, tmp_path, tts=tts)
    assert tts.texts == [], "use_narration=False 인 구 잡이 합성으로 돌았다"


async def test_narration_lengthens_the_requested_clip(tmp_path) -> None:
    """나레이션이 붙으면 요청 길이가 길어진다(둘 다 말해지므로 시간도 둘의 합이다).

    하나만 재면 나레이션이 붙는 순간 클립이 짧아져, 뒤 문장이 잘린 채 끝난다.
    """
    durations: list[float] = []

    def capturing() -> _PromptCapturingVisual:
        visual = _PromptCapturingVisual()
        original = visual.submit

        async def capture(params: dict, source_path: str | None) -> str:
            durations.append(float(params["duration_sec"]))
            return await original(params, source_path)

        visual.submit = capture  # type: ignore[method-assign]
        return visual

    base = {"order": 1, "image_file_id": None, "visual_prompt": "장면", "subtitle": "",
            "dialogue": "이거 진짜 좋네요"}
    await _compose_narration(capturing(), None, tmp_path, scene=base, synthesize=False)
    await _compose_narration(
        capturing(), None, tmp_path,
        scene={**base, "narration": "밀착력이 달라서 하루 종일 뽀송합니다"},
        synthesize=False,
    )

    assert durations[1] > durations[0]
