"""VideoProcessingPort 구현: 다중 씬 조합(COMPOSE 잡). 씬(세그먼트)별 클립을 이어붙인 쇼츠.

씬은 말할 문장 둘을 갖는다. `dialogue`(화면 속 인물)와 `narration`(화면 밖 목소리)이고 둘 다
선택이며 함께 있을 수 있다. 그 소리를 누가 만드는지는 잡의 `synthesize_speech` 가 정하고, 그
갈림이 씬을 만드는 순서까지 가른다.

    참(기본)        이 서버가 TTS 로 mp3 를 먼저 만들어 그 길이로 영상을 요청한다(길이의 주인이
                    말이기 때문이다) → 클립의 자체 오디오는 버리고(-an) 그 음성을 얹는다.
                    목소리가 하나뿐이라 두 문장을 이어 한 번에 읽는다.

    거짓            합성하지 않는다. 두 문장을 영상 프롬프트에 실어 모델이 말과 화면을 함께
                    만들게 한다 → 클립 오디오를 보존하고 길이는 클립이 정한다. 목표 길이로
                    자르면 클립 안에서 이미 끝난 발화의 문장이 잘린다.

버전이 아니라 값으로 가른다. 이 서버는 호출자가 어느 도구 버전인지 몰라도 된다. 구 잡은 같은
값을 `use_narration` 이라는 이름으로 실으므로 그 이름도 그대로 읽는다.

배경 프레임, 자막 번인, 아웃트로는 이 단계가 하지 않는다. 최종 영상(FINALIZE)이 처리한다.
자막이 없는 씬만 있으면 자막 트랙 자체가 만들어지지 않는다(자막을 쓰지 않는 호출자가 있다).

워커가 죽어도 이어서 한다. 씬을 완성하면 클립을 file-service 에 durable 저장하고 체크포인트에
clip_file_id 를 남겨, 다음 실행이 완료 씬을 재렌더 없이 회수한다. 재개 가능한 비주얼
(ResumableVisualPort)은 제출 직후 prompt_id 를 남겨 진행 중 렌더도 재폴링한다(GPU 재작업 0).
slideshow 는 렌더가 수 초라 그냥 다시 만들고, 체크포인트 저장소가 없으면 매번 새로 렌더한다.

씬 비주얼은 provider 라우팅이다(dev=slideshow, staging/prod=자체 wan 또는 외부 grok). 같은
"image→무음 클립" 계약이라 교체 가능하다.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any, Callable

from ....core.application.ports.outbound import (
    FileGatewayPort,
    BillableVisualPort,
    ResumableVisualPort,
    SceneCheckpointPort,
    TtsPort,
    VideoProcessingPort,
)
from ....core.domain.prompts import SCENE_MOTION_PROMPT, build_scene_speech_directive
from ....core.domain.errors import DeadVisualHandleError, PermanentRenderError
from ....core.domain.types import ProcessedResult, RenderUsage, SceneState, VideoJobType
from . import ffmpeg_ops
from .speech_duration import estimate_speech_seconds

_logger = logging.getLogger(__name__)

# 씬 길이 방어: TTS 길이를 이 범위로 클램프(너무 짧은 컷/과도한 정지 방지). 나레이션 없는 씬 기본 길이.
_MIN_SCENE_SEC = 2.0
_MAX_SCENE_SEC = 20.0
# 말이 없는 씬(대화내용이 빈 문자열)의 길이. 말이 있으면 이 값을 쓰지 않는다: 그때 길이는
#   대화내용이 정한다(켠 쪽은 TTS 측정, 끈 쪽은 speech_duration 추정).
_DEFAULT_NO_SPEECH_SEC = 4.0

# 씬 비주얼 모션 힌트: 원문 SSOT 는 core/domain/prompts.py (소비자 서술도 같은 값에서 파생된다).
_MOTION_PROMPT = SCENE_MOTION_PROMPT.content

# 벤더 프롬프트 상한(Higgsfield maxLength 2500). 대사가 먼저 자리를 잡는다.
#   어댑터는 프롬프트의 뒤를 자르므로, 화면 묘사 뒤에 대사를 그냥 붙이면 긴 묘사에서 대사가 통째로
#   잘려 나간다. 그러면 인물이 입만 움직이는 영상이 나오고, 그 사실은 결과물을 봐야 드러난다.
#   그래서 조립 시점에 화면 묘사 쪽을 먼저 줄여 대사 절이 항상 들어가게 한다.
_MAX_SCENE_PROMPT = 2400

# 세그먼트(씬) 연결 방식
# 씬 하나가 세그먼트 하나이고 최종 영상은 그것들을 이어붙여 만든다. 그 세그먼트들을 동시에 만들지
# 순서대로 만들지를 잡 params(`segment_mode`)가 정한다.
#
# 기본은 순차다. 값이 없는 잡(구 잡, 고르지 않은 경우)이 갑자기 병렬로 돌면, 지금까지 한 장씩
#   처리되던 부하가 한꺼번에 밀린다. 모르는 값도 순차로 접는다(오타 하나가 부하 폭증이 되지 않게).
_SEGMENT_MODE_PARALLEL = "parallel"

# 병렬일 때 동시에 도는 씬 수 상한.
#   무제한으로 두지 않는다. 씬은 8개까지 가능하고 그 전부가 동시에 외부 벤더를 치면 레이트리밋에
#   걸리며, 사내 GPU provider(Wan)라면 더 나쁘다(GPU 는 잡을 직렬로 처리해서, 8장을 한꺼번에 밀면
#   그 뒤에 선 다른 작업자가 8장을 다 기다린다). 그래서 "빠른 생성" 은 '전부 동시' 가 아니라
#   '몇 개씩 겹쳐서' 다. 체감 대기는 대부분 이 정도에서 이미 크게 줄어든다.
#   이 값은 "생성 중인 씬" 의 수다. 벤더가 재는 "제출 빈도" 는 어댑터가 따로 벌린다(vendor_http 의
#   VendorThrottle, 키별 제출 간격 조절). 그래서 셋이 동시에 여기 들어와도 제출은 간격을 두고 나간다.
#   워커는 설정값(config.compose_segment_parallelism)을 넘기고 이 값은 설정 없이 만든 경로의 기본이다.
_SEGMENT_PARALLELISM = 3


class ComposeProcessing:
    """VideoProcessingPort(Protocol) 구현: COMPOSE 잡을 조립해 최종 영상 1개를 만든다(재개 가능)."""

    def __init__(
        self,
        files: FileGatewayPort,
        tts: TtsPort,
        visual: dict[str, VideoProcessingPort],
        default_visual: str,
        checkpoint: SceneCheckpointPort,
        credential_decryptor: Callable[[str], str] | None = None,
        segment_parallelism: int = _SEGMENT_PARALLELISM,
    ) -> None:
        if default_visual not in visual:
            raise ValueError(
                f"default_visual {default_visual!r} 가 비주얼 레지스트리에 없습니다"
                f" (등록: {sorted(visual)})"
            )
        self._files = files
        self._tts = tts
        self._visual = visual
        self._default_visual = default_visual
        self._checkpoint = checkpoint
        # 잡 params 의 조직 크레덴셜(암호문)을 사용 직전 복호화: 외부 씬 비주얼(grok)용. 없으면 None(내부 전용).
        self._decrypt = credential_decryptor
        # 병렬(빠른 생성)에서 동시에 생성 중인 씬 수 상한. 1 이면 병렬을 골라도 순차와 같다.
        self._segment_parallelism = max(1, segment_parallelism)

    async def process(
        self,
        type: VideoJobType,
        params: dict[str, Any],
        source_path: str | None,
        out_dir: str,
    ) -> ProcessedResult:
        job_id = str(params.get("job_id") or "")  # worker_service 가 주입: 체크포인트 키.
        # 소유 귀속(있으면): 모든 산출물(최종/씬/자막)을 조직에 귀속(조직 삭제/아카이브 대상). csc-marketing 이 params 로 전달.
        org_id = params.get("organization_id")
        aspect = str(params.get("aspect_ratio") or ffmpeg_ops.DEFAULT_ASPECT)
        # 원천 영상 화질: 영상 만들기 시점의 선택을 csc-marketing 이 실어 보낸다(모델이 지원할 때만).
        #   여기서 정한 (width, height)가 씬 클립부터 concat 까지 전 구간의 캔버스라, 씬 비주얼이
        #   무엇이든(slideshow/Wan/Grok) 최종 산출물 화질은 이 한 값이 결정한다.
        resolution = str(params.get("resolution") or ffmpeg_ops.DEFAULT_RESOLUTION)
        width, height = ffmpeg_ops.dims_for(resolution, aspect)
        tts_cfg = params.get("tts") or {}
        voice = str(tts_cfg.get("voice") or "")
        pitch = str(tts_cfg.get("pitch") or "")
        tts_provider = str(tts_cfg.get("provider") or "")
        # 이 서버가 소리를 합성하는가. 거짓이면 말을 영상 프롬프트에 실어 모델이 내게 한다.
        #   구 잡 호환: 같은 값을 `use_narration` 이 말하므로 그 이름도 읽는다.
        #   둘 다 없으면 참이다. 값 없이 저장된 잡은 합성으로 만들어졌다.
        synthesize = params.get("synthesize_speech")
        if synthesize is None:
            synthesize = params.get("use_narration")
        synthesizes_speech = True if synthesize is None else bool(synthesize)
        # 외부 나레이션(ElevenLabs) 조직 키: 씬 비주얼과 같은 규칙으로 사용 직전 복호화한다.
        #   복호화가 실패해도 렌더는 계속한다. 그 provider 가 '키 없음' 으로 실패하면 라우터의
        #   기본 TTS 로 떨어지는 편이, 나레이션 없는 영상보다 낫다.
        tts_key = ""
        tts_cred = params.get("tts_credential")
        if tts_cred and self._decrypt:
            try:
                tts_key = self._decrypt(str(tts_cred))
            except Exception:  # noqa: BLE001
                _logger.warning("tts_credential 복호화 실패: 조직 키 없이 진행")

        # 씬 비주얼 공통 컨텍스트: aspect/resolution(외부 API 용) + (있으면) 복호화된 조직 키.
        #   잡당 1회 계산해 전 씬이 공유. 내부 provider(slideshow/wan)는 무시하고, grok 등 외부만 사용한다.
        #   resolution 을 함께 넘기는 이유: 외부가 720p 로 만들어 와도 480p 잡에서는 어차피 축소되므로,
        #   처음부터 목표 화질로 요청해 무의미한 다운스케일(생성 시간/전송량 낭비)을 없앤다.
        #   ※ 비용 절감은 아니다. xAI 는 해상도 구분 없이 초당 정액이라 요금은 길이에만 비례한다.
        visual_extra: dict[str, Any] = {"aspect_ratio": aspect, "resolution": resolution}
        # 라우트 provider 가 그 안에서 부를 모델(플랫폼 경유 Higgsfield, 운영사 직접 Gemini).
        #   라우트가 없는 provider(grok 등)는 provider key 자체가 모델이라 이 값을 무시한다.
        scene_visual_model = str(params.get("scene_visual_model") or "")
        if scene_visual_model:
            visual_extra["model_path"] = scene_visual_model
        # 그 키의 분당 제출 상한(조직이 키와 함께 등록). 없으면 어댑터가 서버 기본값으로 간격을 벌린다.
        submits_per_minute = params.get("scene_visual_submits_per_minute")
        if submits_per_minute:
            visual_extra["submits_per_minute"] = float(submits_per_minute)
        cred = params.get("scene_visual_credential")
        if cred and self._decrypt:
            try:
                visual_extra["api_key"] = self._decrypt(str(cred))
            except Exception:  # noqa: BLE001 - 복호화 실패 시 provider(grok)가 '키 없음'으로 명확히 실패시킨다.
                _logger.warning("scene_visual_credential 복호화 실패: 조직 키 없이 진행")

        scenes = sorted(params.get("scenes") or [], key=lambda s: int(s.get("order", 0)))
        if not scenes:
            raise ValueError("compose: 씬이 없습니다")

        # 씬 비주얼은 씬 목록을 읽은 뒤에 고른다: 기본 비주얼로 대신할 수 있는지가 씬에 이미지가
        #   있는지에 달려 있다(_pick_visual). 이미지가 하나라도 없으면 그 씬은 기본 비주얼로 만들 수 없다.
        visual, effective_provider = self._pick_visual(
            str(params.get("scene_visual_provider") or ""),
            has_scene_images=all(scene.get("image_file_id") for scene in scenes),
        )

        # 이전 진행 상태(재시도/재시작이면 채워져 있다): 완료 씬 건너뛰기 + 진행 중 렌더 재폴링에 쓴다.
        ckpt = await self._checkpoint.load(job_id) if job_id else {}

        # 세그먼트를 만든다. 순서대로(기본) 또는 몇 개씩 겹쳐서(빠른 생성).
        #   결과 순서는 두 경로가 같다(gather 가 입력 순서를 보존한다). 이어붙이는 순서가 곧
        #   영상의 순서라, 여기서 순서가 흔들리면 씬이 뒤바뀐 영상이 나온다.
        #   씬 하나를 만드는 일 자체는 서로 독립이다(각자 자기 디렉터리와 자기 체크포인트 항목을
        #   쓴다). 그래서 병렬로 돌려도 재개 규칙이 바뀌지 않는다.
        parallel = str(params.get("segment_mode") or "") == _SEGMENT_MODE_PARALLEL

        async def build(scene: dict[str, Any]) -> tuple[str, int | None]:
            order = int(scene.get("order", 0))
            scene_dir = os.path.join(out_dir, f"scene-{order}")
            os.makedirs(scene_dir, exist_ok=True)
            return await self._scene_clip(
                job_id, order, scene, scene_dir, width, height, visual, voice, pitch,
                ckpt.get(order, {}), visual_extra, org_id, tts_provider, tts_key,
                synthesizes_speech,
            )

        if parallel:
            sem = asyncio.Semaphore(self._segment_parallelism)

            async def bounded(scene: dict[str, Any]) -> tuple[str, int | None]:
                async with sem:
                    return await build(scene)

            # 하나가 실패하면 나머지를 취소하고 올린다. gather 는 첫 예외를 올리면서도 형제 코루틴을
            #   그대로 두므로, 그냥 쓰면 실패한 잡의 나머지 씬이 백그라운드에서 벤더를 계속 폴링해
            #   한도를 더 쓴다. 취소해도 잃는 것은 없다: 제출된 handle 은 체크포인트에 있어 다음 시도가
            #   재폴링으로 회수하고, 완료된 씬은 건너뛴다(실패를 삼켜 씬이 빠진 영상을 만들지 않는다).
            tasks = [asyncio.create_task(bounded(s)) for s in scenes]
            try:
                results = await asyncio.gather(*tasks)
            except BaseException:
                for task in tasks:
                    task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)
                raise
        else:
            results = [await build(s) for s in scenes]

        scene_clips: list[str] = [clip for clip, _ in results]
        # 청구 초: 씬마다 provider 가 보고한 값. 내부(무료) provider 는 None 이 온다.
        billed_seconds: list[int] = [b for _, b in results if b is not None]

        result_path = os.path.join(out_dir, "video.mp4")
        # 씬 클립 길이(BGM/효과음 배치의 누적 오프셋 계산용): concat/replace 전에 측정한다
        # (단일 클립은 replace 로 원본이 사라져 이후 probe 불가).
        scene_durations = [await ffmpeg_ops.probe_duration(c) for c in scene_clips]

        # 씬별 결과를 잡 행에 남길 준비. clip_file_id 는 _scene_clip 이 체크포인트에만 적었고
        #   아래 clear 로 곧 사라지므로, 여기서 한 번 더 읽어 결과에 실어 보낸다(types.SceneState 참고).
        latest_ckpt = await self._checkpoint.load(job_id) if job_id else {}
        scene_states = [
            SceneState(
                order=int(scene.get("order", 0)),
                clip_file_id=latest_ckpt.get(int(scene.get("order", 0)), {}).get("clip_file_id"),
                billed_seconds=results[i][1],
                duration_sec=scene_durations[i],
            )
            for i, scene in enumerate(scenes)
        ]

        if len(scene_clips) == 1:
            os.replace(scene_clips[0], result_path)
        else:
            await ffmpeg_ops.concat_clips(scene_clips, result_path, width, height)

        # BGM(전체) + 효과음(씬 시작 + offset)을 최종 오디오에 믹스(있을 때만, 비디오는 copy).
        await self._apply_audio(result_path, scenes, scene_durations, params, out_dir)

        # 시간동기 자막 트랙(씬 subtitle + 실제 길이) 산출, 저장 → 최종(FINALIZE)이 fetch 해 번인.
        captions_file_id = await self._store_captions(
            job_id, scenes, scene_durations, out_dir, org_id
        )

        if job_id:
            await self._checkpoint.clear(job_id)  # 성공: 체크포인트 정리.
        return ProcessedResult(
            path=result_path,
            file_name="video.mp4",
            mime_type="video/mp4",
            captions_file_id=captions_file_id,
            scene_states=scene_states,
            # 청구 초를 보고한 씬이 하나도 없으면(= 내부 provider) usage 는 None 이다.
            #   0 을 채우지 않는 이유: '무료라서 0' 과 '못 재서 0' 이 구분되어야 한다.
            usage=(
                RenderUsage(
                    provider=effective_provider,
                    scene_count=len(scenes),
                    output_video_seconds=sum(billed_seconds),
                    # 씬 비주얼 1건당 입력 이미지 1장(씬 이미지): 벤더가 별도 항목으로 청구한다.
                    input_image_count=len(billed_seconds),
                    scene_seconds=billed_seconds,
                )
                if billed_seconds
                else None
            ),
        )

    async def _store_captions(
        self,
        job_id: str,
        scenes: list[dict[str, Any]],
        scene_durations: list[float],
        out_dir: str,
        organization_id: int | None = None,
    ) -> str | None:
        """씬 순서 + 실제 길이로 시간동기 자막 트랙 [{text,start,end}] 을 만들어 file-service 에 JSON 저장.

        text = 씬 subtitle(빈 씬은 큐 생략). start/end = 누적 씬 시작/끝(_apply_audio 의 오프셋 계산과 동형).
        멱등 키 f"{job_id}-captions"(재시도 시 재저장 안전). 자막이 하나도 없거나 job_id 없으면 None.
        """
        if not job_id:
            return None
        track: list[dict[str, Any]] = []
        acc = 0.0
        for scene, dur in zip(scenes, scene_durations):
            text = str(scene.get("subtitle") or "").strip()
            start, acc = acc, acc + max(0.0, dur)
            if text:
                track.append({"text": text, "start": round(start, 3), "end": round(acc, 3)})
        if not track:
            return None
        path = os.path.join(out_dir, "captions.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(track, f, ensure_ascii=False)
        return await self._files.store_result(
            job_id=f"{job_id}-captions",
            file_name="captions.json",
            mime_type="application/json",
            src_path=path,
            organization_id=organization_id,
        )

    async def _apply_audio(
        self,
        result_path: str,
        scenes: list[dict[str, Any]],
        scene_durations: list[float],
        params: dict[str, Any],
        out_dir: str,
    ) -> None:
        """BGM 베드(전체) + 효과음(앵커 씬 시작 기준 부호 offset)을 result_path 오디오에 얹는다(둘 다 없으면 no-op).

        누적 씬 시작 오프셋 = 앞선 씬 길이 합. 효과음 절대 시각 = 앵커 씬 시작 + offset(부호). 씬 경계로
        클램프하지 않고 전체 길이 [0, total] 로만 묶어, 음수 offset 은 전환에 걸치고 꼬리는 다음 씬으로 넘어간다.
        BGM/효과음 파일은 file-service 에서 받아 ffmpeg_ops.mix_final_audio 로 합치고 결과로 교체한다.
        파일 fetch 실패는 삼켜 해당 오디오만 빠지고 렌더는 유효하게 유지한다(BGM 실패 시 원본 그대로).
        """
        bgm = params.get("bgm")
        bgm_file_id = str(bgm.get("file_id") or "") if isinstance(bgm, dict) else ""
        has_sfx = any(scene.get("sfx") for scene in scenes)
        if not bgm_file_id and not has_sfx:
            return  # 오디오 추가 없음(하위호환: 마케팅 경로는 항상 BGM 을 보낸다).

        # 누적 씬 시작 오프셋 + 전체 길이(total). 효과음은 앵커 씬 시작 기준으로 위치한다.
        starts: list[float] = []
        acc = 0.0
        for d in scene_durations:
            starts.append(acc)
            acc += max(0.0, d)
        total = acc

        # 효과음(씬당 0..N) fetch + 절대 시각(초) 계산.
        #   offset_sec 은 부호 있는 값(음수=전환에 걸침): 씬 경계로 클램프하지 않고 전체 길이 [0, total] 로만
        #   묶는다. 효과음 꼬리는 다음 씬으로 자연히 넘어간다(amix duration=first 가 영상 끝에서만 캡).
        sfx_specs: list[tuple[str, float]] = []
        seq = 0
        for i, scene in enumerate(scenes):
            items = scene.get("sfx")
            if not isinstance(items, list):
                continue
            for item in items:
                if not isinstance(item, dict):
                    continue
                file_id = str(item.get("file_id") or "")
                if not file_id:
                    continue
                try:
                    raw_offset = float(item.get("offset_sec") or 0.0)
                except (TypeError, ValueError):
                    raw_offset = 0.0
                start_at = max(0.0, min(starts[i] + raw_offset, total))
                sfx_path = os.path.join(out_dir, f"sfx-{seq}")
                seq += 1
                try:
                    await self._files.download_source(file_id, sfx_path)
                except Exception:  # noqa: BLE001 - 효과음 하나 실패는 치명적이지 않다(빼고 진행).
                    _logger.warning("효과음 fetch 실패(scene=%s file=%s): 건너뜀", i, file_id)
                    continue
                sfx_specs.append((sfx_path, start_at))

        # BGM fetch(있으면). 실패하면 BGM 없이 진행(효과음만). BGM 감쇠는 mix_final_audio 기본값(0.2).
        bgm_path: str | None = None
        if bgm_file_id:
            bgm_path = os.path.join(out_dir, "bgm")
            try:
                await self._files.download_source(bgm_file_id, bgm_path)
            except Exception:  # noqa: BLE001
                _logger.warning("BGM fetch 실패(file=%s): BGM 없이 진행", bgm_file_id)
                bgm_path = None

        if not bgm_path and not sfx_specs:
            return  # 받아온 오디오가 없다. 원본 유지.

        mixed = os.path.join(out_dir, "video-audio.mp4")
        await ffmpeg_ops.mix_final_audio(result_path, bgm_path, sfx_specs, mixed)
        os.replace(mixed, result_path)

    def _pick_visual(
        self, provider: str, has_scene_images: bool
    ) -> tuple[VideoProcessingPort, str]:
        """(비주얼, 유효 provider key): 폴백이 일어나면 요청값이 아니라 실제로 돈 쪽을 돌려준다.

        비용이 실제로 돈이 나간 provider 에만 붙어야 해서 key 를 함께 반환한다(요청 provider 를
        기록하면, 폴백으로 사내 slideshow 가 돌았는데 유료 grok 으로 청구된 것처럼 보인다).

        씬 이미지가 없는 잡은 폴백하지 않는다. 기본 비주얼(slideshow)은 이미지 한 장을 받아
        클립을 만들기 때문이다. 텍스트→영상 버전의 잡이 그렇고, 그대로 진행하면 씬 렌더가
        "슬라이드쇼: 씬 이미지가 필요합니다" 로 죽어 실제 원인을 가린다(그 provider 가 이 워커에
        없다는 사실). 실제로 그렇게 죽은 잡이 있었다: dev 워커가 어댑터 추가 이전에 떠 있었고,
        화면에는 이미지가 필요하다는 메시지만 떴다.
        """
        picked = self._visual.get(provider)
        if picked is not None:
            return picked, provider
        if not has_scene_images:
            raise PermanentRenderError(
                f"씬 비주얼 provider {provider!r} 가 이 워커에 없습니다"
                f"(등록: {sorted(self._visual)}). 이 잡은 씬 이미지가 없어 기본 비주얼"
                f"({self._default_visual!r})로 대신 만들 수 없습니다. 그 provider 를 배포했는지,"
                " 워커가 최신 코드로 떠 있는지 확인하세요(dev 는 워커를 리로드하지 않습니다)."
            )
        # 조용한 폴백은 "왜 AI 영상이 아니라 슬라이드쇼지?" 혼란을 부른다. 명시적으로 남긴다.
        _logger.warning(
            "씬 비주얼 provider %r 미배포/미등록 → %r 로 폴백(등록: %s). "
            "Wan 등 AI 모션을 쓰려면 그 엔진을 배포하고 COMFYUI_URL 을 설정하세요.",
            provider,
            self._default_visual,
            sorted(self._visual),
        )
        return self._visual[self._default_visual], self._default_visual

    async def _scene_clip(
        self,
        job_id: str,
        order: int,
        scene: dict[str, Any],
        scene_dir: str,
        width: int,
        height: int,
        visual: VideoProcessingPort,
        voice: str,
        pitch: str,
        st: dict[str, Any],
        visual_extra: dict[str, Any],
        organization_id: int | None = None,
        tts_provider: str = "",
        tts_key: str = "",
        synthesizes_speech: bool = True,
    ) -> tuple[str, int | None]:
        """(클립 경로, 이 씬의 청구 초). 청구 초는 유료 provider 만, 없으면 None.

        재개로 회수한 씬은 이전 실행의 제출 시점에 확정된 값을 체크포인트에서 읽는다
        그래야 워커가 중간에 죽어도 합계가 과소 계산되지 않는다.
        """
        clip = os.path.join(scene_dir, "scene.mp4")
        # 이전 실행이 제출할 때 남긴 청구 초(재개 케이스).
        prior_billed = st.get("billed_seconds")
        prior_billed = prior_billed if isinstance(prior_billed, int) else None

        # 1) 이미 완성된 씬(clip_file_id) → durable 저장분을 회수(재렌더 0). 회수 실패 시 재렌더로 폴백.
        clip_file_id = st.get("clip_file_id")
        if clip_file_id:
            try:
                await self._files.download_source(clip_file_id, clip)
                return clip, prior_billed
            except Exception:  # noqa: BLE001 - 회수 실패는 치명적이지 않다(재렌더).
                _logger.warning(
                    "체크포인트 클립 회수 실패(job=%s scene=%s): 재렌더", job_id, order
                )

        # 2) 이 씬에서 말해지는 문장 둘. 말은 두 종류이고 함께 있을 수 있다.
        #    dialogue  화면 속 인물이 하는 말
        #    narration 화면 밖에서 읽는 문장
        #    누가 이 소리를 만드는지는 아래 3) 이 잡의 TTS provider 유무로 정한다.
        dialogue_line = str(scene.get("dialogue") or "").strip()
        narration_line = str(scene.get("narration") or "").strip()

        # 3) 소리를 누가 만드는가: 이 잡에 TTS provider 가 실려 있으면 이 서버가 합성하고,
        #    없으면 영상 모델이 낸다(그때 말은 프롬프트로 들어간다).
        #
        #    버전이 아니라 값으로 가른다. 이 서버는 호출자가 어느 도구 버전인지 몰라도 된다.
        #    provider 를 싣지 않는 것이 곧 "이 잡의 소리는 영상 모델이 낸다" 는 뜻이고, 나중에 다른
        #    버전이 같은 방식으로 옮겨 와도 여기 코드가 아니라 스펙만 바뀐다.
        #
        #    합성하는 경로에서는 TTS 가 길이의 주인이다(만든 mp3 길이에 클립을 맞춘다).
        #    합성하지 않는 경로에서는 클립 자신이 주인이다: 발화가 클립 안에서 이미 끝나 있어
        #    목표 길이로 자르면 문장이 잘린다. 요청 길이만 정해 두고 결과를 그대로 쓴다.
        #
        # 합성하는 경로는 목소리가 하나뿐이라 두 문장을 이어 한 번에 읽는다(예전 동작과 같다:
        #   그 경로의 씬은 둘 중 하나만 채워져 있었다).
        speech = " ".join(p for p in (dialogue_line, narration_line) if p)
        audio_path = os.path.join(scene_dir, "audio.m4a")
        if synthesizes_speech:
            duration = await self._build_audio(
                speech, voice, pitch, audio_path, scene, tts_provider, tts_key
            )
        else:
            # 영상 모델이 말하는 경로: 발화가 클립 안에서 끝나야 하므로 요청 길이가 유일한
            #   손잡이다(받아온 클립은 자르지도 늘리지도 않는다. 아래 5' 참고). 그래서 말해질
            #   문장에서 시간을 추정해 그 길이를 요청한다. 합성 경로가 TTS 를 재는 것과 같은
            #   규칙이고 재는 방법만 다르다(측정 ↔ 추정).
            #   둘을 합쳐 잰다: 대사와 나레이션이 함께 있으면 둘 다 말해지므로 시간도 둘의 합이다.
            #   말이 없는 씬은 잴 것이 없어 기본값을 쓴다.
            estimated = estimate_speech_seconds(speech)
            duration = _clamp_duration(
                scene.get("duration_sec") or estimated or _DEFAULT_NO_SPEECH_SEC
            )

        # 4) 씬 비주얼(클립): 재개 가능(Wan/Grok/Higgsfield)이면 submit/poll(+handle 영속), 아니면 process.
        #    합성하지 않는 경로에서만 말이 프롬프트에 실린다(합성 경로에서는 이 서버가 소리를
        #    만들므로, 모델까지 말하게 하면 두 목소리가 겹친다).
        raw, billed = await self._render_visual(
            job_id, order, scene, scene_dir, width, height, visual, duration, st, visual_extra,
            ("", "") if synthesizes_speech else (dialogue_line, narration_line),
        )

        if synthesizes_speech:
            # 5) 비주얼 클립을 합성한 음성 길이에 정확히 맞춘다(provider 편차 흡수: Wan 5초 ↔ 나레이션).
            #    여기서 클립의 자체 오디오는 버려진다(-an). 그것이 이 경로의 의도다: 우리가 얹은
            #    목소리가 말하는 동안 인물까지 말하면 두 목소리가 겹친다.
            fitted = os.path.join(scene_dir, "fitted.mp4")
            await ffmpeg_ops.fit_to_duration(raw, fitted, duration, width, height)
            # 6) 비주얼 + 나레이션 mux → 씬 클립.
            await ffmpeg_ops.mux_audio(fitted, audio_path, clip)
        else:
            # 5') 대사를 살린다: 길이를 건드리지 않고 캔버스/코덱만 맞춘다(오디오 보존, 없으면 무음).
            #     자르지 않는 이유는 위와 같다. 이어붙이기가 요구하는 것은 같은 WxH/FPS/코덱이고
            #     길이가 같아야 하는 것은 아니다.
            await ffmpeg_ops.normalize_clip_to_canvas(raw, clip, width, height)

        # 7) 완성 클립 durable 저장 + 체크포인트 → 다음 실행이 이 씬을 건너뛴다(재개).
        if job_id:
            try:
                fid = await self._files.store_result(
                    job_id=f"{job_id}-scene-{order}",
                    file_name="scene.mp4",
                    mime_type="video/mp4",
                    src_path=clip,
                    organization_id=organization_id,
                )
                await self._checkpoint.save_scene(job_id, order, clip_file_id=fid)
            except Exception:  # noqa: BLE001 - 저장 실패해도 이번 렌더는 유효(재개만 불가).
                _logger.warning(
                    "씬 클립 durable 저장 실패(job=%s scene=%s): 재개는 불가하나 진행", job_id, order
                )
        return clip, billed

    async def _render_visual(
        self,
        job_id: str,
        order: int,
        scene: dict[str, Any],
        scene_dir: str,
        width: int,
        height: int,
        visual: VideoProcessingPort,
        duration: float,
        st: dict[str, Any],
        visual_extra: dict[str, Any],
        speech: tuple[str, str] = ("", ""),
    ) -> tuple[str, int | None]:
        """(비주얼 경로, 청구 초). 청구 초는 provider 가 보고한 값: 우리가 결과물을 재지 않는다.

        `speech` = (대사, 나레이션). 이 서버가 합성하지 않는 씬에서만 채워진다(그때 영상 모델이
        그 말을 낸다). 합성하는 씬에서는 빈 쌍이 온다: 모델까지 말하면 두 목소리가 겹친다.
        """
        # ComfyUI 업로드 파일명 = 이 basename. 공유 ComfyUI(worker_max_jobs 다중 잡 + 다중 씬)에서
        # 모두 "image" 를 overwrite 로 올리면 다른 잡/씬이 서로의 입력 이미지를 덮어써, 어떤 씬이
        # 남의 이미지로 렌더된다(배치 영상 만들기에서 씬이 뒤바뀌거나 누락된 것처럼 보이는 원인).
        # job_id+order 로 전역 유일하게 만들어 충돌을 없앤다. slideshow(로컬 파일)엔 이름이 무관.
        image_name = f"src-{(job_id or 'nojob').replace('/', '_')}-s{order}"
        image_path = os.path.join(scene_dir, image_name)
        # visual_extra = aspect_ratio + (있으면) 조직 키(api_key)/모델 경로/키의 분당 한도. 외부 provider 만 사용.
        #
        # 프롬프트 조립 규칙은 _build_visual_prompt 가 갖는다. 판정 근거를 provider 이름이 아니라
        #   데이터(씬 이미지 유무)에 두는 이유는 그래야 provider 가 늘어도 이 조건이 늘지 않기
        #   때문이다. 그리고 씬 이미지는 이미 그 갈림을 정확히 표현하고 있다.
        scene_prompt = str(scene.get("visual_prompt") or "").strip()
        has_image = bool(scene.get("image_file_id"))
        vparams = {
            "duration_sec": duration,
            "width": width,
            "height": height,
            "prompt": _build_visual_prompt(scene_prompt, has_image, speech),
            **visual_extra,
        }
        # 청구 단위는 provider 가 스스로 보고한다(BillableVisualPort): 벤더에 보내는 값과 같은 식이라
        #   합성 결과물을 측정하는 것보다 정확하다. 내부 provider 는 미구현이고 그 부재가 '무료' 다.
        billable = (
            visual.billable_seconds(vparams) if isinstance(visual, BillableVisualPort) else None
        )
        # 재개 가능한 비주얼(Wan/Grok): 제출 즉시 handle 을 영속 → 워커가 죽어도 재폴링으로 회수(재작업 0).
        if job_id and isinstance(visual, ResumableVisualPort):
            prompt_id = st.get("prompt_id")
            prior = st.get("billed_seconds")
            billed = prior if isinstance(prior, int) else billable
            if not prompt_id:
                source = await self._fetch_scene_source(scene, image_path)
                prompt_id = await visual.submit(vparams, source)
                # 청구 초를 prompt_id 와 같은 순간 남긴다. 그때가 벤더 과금이 발생하는 시점이고
                #   체크포인트 쓰기가 이미 여기서 일어나므로 새 실패 지점이 생기지 않는다.
                await self._checkpoint.save_scene(
                    job_id, order, prompt_id=prompt_id, billed_seconds=billable
                )
                billed = billable
            # handle 이 이미 있으면 이미지 재fetch 불필요(엔진이 보유): 바로 재폴링. vparams 재공급(폴링 인증용).
            try:
                return await visual.poll_to_file(prompt_id, scene_dir, vparams), billed
            except DeadVisualHandleError:
                # 벤더가 이 요청을 확정 실패로 못박았다. 재폴링은 영원히 같은 실패다.
                #   그 씬의 handle 만 버리고 재던진다: 다음 시도가 새로 제출해 실제로 복구된다.
                #   (완성된 다른 씬과 청구 초는 보존: 전체 clear 는 GPU/벤더 재작업을 부른다.)
                await self._checkpoint.drop_scene_handle(job_id, order)
                raise

        # 재개 불가(slideshow 등, 렌더 수 초): 이미지 fetch → process.
        source = await self._fetch_scene_source(scene, image_path)
        result = await visual.process(
            type=VideoJobType.GENERATE,
            params=vparams,
            source_path=source,
            out_dir=scene_dir,
        )
        # 재개 불가 경로는 내부 provider(무료)라 청구 초가 없다. 0 이 아니라 None 이다.
        return result.path, billable

    async def _fetch_scene_source(
        self, scene: dict[str, Any], image_path: str
    ) -> str | None:
        """씬 소스 이미지를 받아 경로를 준다. 이미지가 없는 씬이면 None.

        텍스트→영상 버전은 씬 이미지를 만들지 않으므로 받아 올 것이 없다(id 가 null 로 온다).
        이 값이 항상 있다고 보고 바로 받으러 가면 그 버전의 모든 씬이 존재하지 않는 자산을
        찾다가 실패한다. 이미지를 쓰는 provider 는 None 을 받으면 스스로 실패하므로
        (그쪽에는 필수 입력이다) 이 판정이 조용한 오작동을 만들지 않는다.
        """
        file_id = scene.get("image_file_id")
        if not file_id:
            return None
        await self._files.download_source(str(file_id), image_path)
        return image_path

    async def _build_audio(
        self,
        speech: str,
        voice: str,
        pitch: str,
        audio_path: str,
        scene: dict[str, Any],
        tts_provider: str = "",
        tts_key: str = "",
    ) -> float:
        """오디오 파일을 만들고 씬 길이(초)를 돌려준다. 말할 문장이 있으면 TTS, 없으면 무음.

        이 길이가 그 씬 영상의 길이가 된다: 호출부가 이 값을 벤더 요청(duration_sec)에 싣고,
        받아온 클립을 이 길이에 맞춘다(fit_to_duration). 즉 mp3 를 먼저 만들고 그 길이로 영상을
        만드는 순서다. 반대로 하면 말이 잘리거나 뒤에 정적이 남는다.
        """
        override = scene.get("duration_sec")
        if speech:
            await self._tts.synthesize(
                speech, voice, pitch, audio_path, provider=tts_provider, api_key=tts_key
            )
            measured = await ffmpeg_ops.probe_duration(audio_path)
            duration = _clamp_duration(override or measured)
            if measured <= 0:
                # TTS 산출 길이 불명(방어): 기본 길이 무음으로 대체해 렌더가 깨지지 않게.
                await ffmpeg_ops.make_silence(audio_path, duration)
            return duration
        duration = _clamp_duration(override or _DEFAULT_NO_SPEECH_SEC)
        await ffmpeg_ops.make_silence(audio_path, duration)
        return duration


def _build_visual_prompt(scene_prompt: str, has_image: bool, speech: tuple[str, str]) -> str:
    """씬 하나가 벤더에 보낼 프롬프트: 화면 묘사 + (있으면) 대사 지시.

    화면 묘사의 뜻이 씬 이미지 유무로 갈린다.
      이미지가 있으면: 그 이미지가 화면을 정했으므로 프롬프트는 움직임만 지시한다. 여기에 화면 묘사를
        넣으면 이미 정해진 화면과 경쟁하는 지시가 되어 모션이 나빠진다.
      이미지가 없으면: 프롬프트가 화면 자체를 만든다 → 씬마다 달라야 한다. 공통 모션 문구를 그대로
        주면 모든 씬이 같은 영상이 된다.

    말(대사/나레이션)은 그 뒤에 붙는다. 상한을 넘으면 화면 묘사 쪽을 줄인다: 어댑터가 뒤를
    자르므로 말을 뒤에 두고 그냥 넘기면 말이 통째로 사라지고, 그러면 인물이 입만 움직이는 영상이
    나온다. (말이 그것만으로 상한을 넘는 경우는 기획 프롬프트가 길이를 제한하므로 실제로 오지
    않는다. 와도 뒤에서 잘릴 뿐이라 지금과 같다.)
    """
    visual = _MOTION_PROMPT if has_image else (scene_prompt or _MOTION_PROMPT)
    directive = build_scene_speech_directive(*speech)
    if not directive:
        return visual[:_MAX_SCENE_PROMPT]
    room = _MAX_SCENE_PROMPT - len(directive) - 1  # 사이에 넣을 공백 한 칸.
    return f"{visual[:room]} {directive}".strip() if room > 0 else directive[:_MAX_SCENE_PROMPT]


def _clamp_duration(value: Any) -> float:
    try:
        d = float(value)
    except (TypeError, ValueError):
        d = _DEFAULT_NO_SPEECH_SEC
    return max(_MIN_SCENE_SEC, min(_MAX_SCENE_SEC, d))
