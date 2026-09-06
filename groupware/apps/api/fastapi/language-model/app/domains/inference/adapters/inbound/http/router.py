"""Inbound Adapter: APIRouter (inference 도메인, 무상태 생성).

서버 간 재사용 진입점. 서비스토큰(require_services)으로 호출자를 인증하고, 신원(조직 id)은
body 로 받는다(신뢰 경계 = 서비스토큰 계층: X-User-Id 불필요). 비스트리밍 JSON 응답.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException

from csc_net_utils import require_services

from ....core.application.ports.inbound import (
    ImageGenerationInboundPort,
    InferenceGenerationInboundPort,
)
from ....core.domain.errors import (
    CredentialNotConfiguredError,
    ExternalInferenceError,
    ExternalQuotaExceededError,
    ExternalRateLimitedError,
    InferenceEngineTimeoutError,
    InferenceEngineUnavailableError,
)
from ....core.domain.image_failure import ImageGenerationFailedError
from ....core.domain.types import PromptMessageRecord
from .schemas import (
    GenerateRequest,
    GenerateResponse,
    ImageEngineLoadResponse,
    ImageItemSchema,
    ImageRequest,
    ImageResponse,
    ImageTokenUsageSchema,
    ModelCatalogItemResponse,
    TokenUsageSchema,
)

# 무상태 생성을 호출하는 백엔드(서비스토큰 신원). 새 호출 주체는 여기 + config.allowed_services 에 추가.
_CALLERS = require_services("csc-marketing")
# 모델 카탈로그(유니버스) 조회: AI 어시스턴트 허용/기본 모델 UI 후보.
#   control-tower(플랫폼 허용/기본) + csc-groupware(조직 기본 select: 허용 범위 내 후보).
_CATALOG_CALLERS = require_services("csc-control-tower", "csc-groupware")


def get_inference_generation_service() -> InferenceGenerationInboundPort:
    # 실제 provider 는 app/container.py 에서 오버라이드된다.
    raise NotImplementedError


def get_image_generation_service() -> ImageGenerationInboundPort:
    # 실제 provider 는 app/container.py 에서 오버라이드된다.
    raise NotImplementedError


router = APIRouter(prefix="/inference", tags=["inference"])


@router.get(
    "/models",
    response_model=list[ModelCatalogItemResponse],
    dependencies=[Depends(_CATALOG_CALLERS)],
)
async def list_catalog_models(
    service: InferenceGenerationInboundPort = Depends(get_inference_generation_service),
) -> list[ModelCatalogItemResponse]:
    # 전체 chat 모델 유니버스(org 무관): 플랫폼 관리자가 허용/기본 모델을 고를 후보 목록.
    return [
        ModelCatalogItemResponse(
            key=m.key,
            label=m.label or m.key,
            vendor=m.vendor,
            serving="api" if m.credential_provider else "self",
        )
        for m in service.list_chat_models()
    ]


@router.post("/generate", response_model=GenerateResponse, dependencies=[Depends(_CALLERS)])
async def generate(
    body: GenerateRequest,
    service: InferenceGenerationInboundPort = Depends(get_inference_generation_service),
) -> GenerateResponse:
    messages = [PromptMessageRecord(role=m.role, content=m.content) for m in body.messages]
    try:
        result = await service.generate(
            organization_id=body.organizationId,
            model=body.model,
            system=body.system,
            messages=messages,
            max_tokens=body.maxTokens,
            temperature=body.temperature,
        )
    except CredentialNotConfiguredError as exc:
        # 외부 모델(Claude 등) 조직 키 미등록: 원인 메시지를 그대로 전달(402).
        raise HTTPException(status_code=402, detail=str(exc)) from exc
    except InferenceEngineTimeoutError as exc:
        # 엔진은 살아 있고 느린 것. 연결 불가와 조치가 다르다(기다리기 vs 엔진 점검).
        #   공유 GPU(dev/staging/prod 공용)라 남의 부하로 지연될 수 있다.
        logging.getLogger(__name__).warning("추론 엔진 응답 지연: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI 추론 엔진(자체 LLM)이 시간 내에 응답하지 않았습니다(혼잡). 잠시 후 다시 시도해 주세요.",
        ) from exc
    except InferenceEngineUnavailableError as exc:
        # 자체 호스팅 추론 엔진(vLLM/Ollama) 미기동/네트워크(터널) 문제: 원인 구분(502).
        logging.getLogger(__name__).warning("추론 엔진 연결 실패: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI 추론 엔진(자체 LLM)에 연결할 수 없습니다. 엔진 상태를 확인해 주세요.",
        ) from exc
    except ExternalQuotaExceededError as exc:
        # 벤더 크레딧 부족: 402 = 사람이 결제를 채워야 풀리는 사유(키 미등록과 같은 상태). 소비자
        #   BFF 가 이 상태에 재시도 불가 코드를 실어 화면이 작업을 걷는다.
        logging.getLogger(__name__).warning("외부 모델 크레딧 부족: %s", exc)
        raise HTTPException(
            status_code=402,
            detail="외부 AI 모델의 크레딧이 부족합니다. 벤더 결제를 확인한 뒤 다시 시도해 주세요.",
        ) from exc
    except ExternalRateLimitedError as exc:
        # 벤더 분당 한도, 과부하: 잠시 뒤면 풀린다. 위 402 와 조치가 정반대라 상태를 갈라 내린다.
        logging.getLogger(__name__).warning("외부 모델 한도 초과: %s", exc)
        raise HTTPException(
            status_code=429,
            detail="외부 AI 모델 요청이 몰려 한도에 걸렸습니다. 잠시 후 다시 시도해 주세요.",
        ) from exc
    except ExternalInferenceError as exc:
        # 외부 벤더(Claude) API 가 요청을 거부/실패: 상세는 로그, 클라엔 일반 메시지(원문 유출 방지).
        logging.getLogger(__name__).warning("외부 모델 요청 거부: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI 모델 요청이 거부되었습니다. 잠시 후 다시 시도해 주세요.",
        ) from exc
    except Exception as exc:  # noqa: BLE001 - 클라에는 일반 메시지, 상세는 서버 로그.
        logging.getLogger(__name__).exception("inference generate 실패")
        raise HTTPException(status_code=500, detail="생성 중 오류가 발생했습니다.") from exc

    usage = (
        TokenUsageSchema(
            prompt=result.usage.prompt,
            completion=result.usage.completion,
            total=result.usage.total,
        )
        if result.usage
        else None
    )
    # model 은 서비스가 붙인 resolve 결과를 우선한다. 요청이 빈 값이면(채널 미선택) 그걸
    # 되돌려주면 호출자가 비용을 어느 모델에 붙일지 알 수 없다.
    return GenerateResponse(text=result.text, model=result.model or body.model or "", usage=usage)


@router.post("/images", response_model=ImageResponse, dependencies=[Depends(_CALLERS)])
async def images(
    body: ImageRequest,
    service: ImageGenerationInboundPort = Depends(get_image_generation_service),
) -> ImageResponse:
    try:
        result = await service.generate(
            organization_id=body.organizationId,
            model=body.model,
            prompt=body.prompt,
            size=body.size,
            quality=body.quality,
            seed=body.seed,
        )
    except ImageGenerationFailedError as exc:
        # 사유는 어댑터가 이미 분류했고, 문구/상태는 카탈로그가 소유한다. 여기선 옮기기만 한다(분기 없음).
        #   새 벤더/사유가 생겨도 이 라우터는 바뀌지 않는다.
        logging.getLogger(__name__).warning(
            "이미지 생성 실패 [%s/%s]: %s", exc.origin.value, exc.failure.value, exc.detail
        )
        raise HTTPException(status_code=exc.status, detail=exc.message) from exc
    except Exception as exc:  # noqa: BLE001 - 클라에는 일반 메시지, 상세는 서버 로그.
        logging.getLogger(__name__).exception("inference images 실패")
        raise HTTPException(status_code=500, detail="이미지 생성 중 오류가 발생했습니다.") from exc

    return ImageResponse(
        images=[ImageItemSchema(b64=img.b64, mime=img.mime) for img in result.images],
        model=result.model or body.model or "",
        usage=(
            ImageTokenUsageSchema(
                inputText=result.usage.input_text,
                inputImage=result.usage.input_image,
                outputImage=result.usage.output_image,
            )
            if result.usage
            else None
        ),
    )


@router.get(
    "/images/load",
    response_model=ImageEngineLoadResponse | None,
    dependencies=[Depends(_CALLERS)],
)
async def image_engine_load(
    model: str | None = None,
    service: ImageGenerationInboundPort = Depends(get_image_generation_service),
) -> ImageEngineLoadResponse | None:
    """이 모델을 그리는 엔진의 공유 큐 현황. 큐가 없는 벤더(외부 API)는 null.

    화면 표시용 보조 정보라 실패해도 null 로 답한다(에러 아님): 부하를 못 읽었다고 작업자에게
    빨간 메시지를 띄우면 정작 멀쩡한 생성 기능이 고장난 것처럼 보인다.
    """
    try:
        load = await service.load(model)
    except Exception:  # noqa: BLE001 - 보조 정보. 상세는 서버 로그, 화면은 조용히 미표시.
        logging.getLogger(__name__).warning("이미지 엔진 부하 조회 실패", exc_info=True)
        return None
    return ImageEngineLoadResponse(running=load.running, pending=load.pending) if load else None
