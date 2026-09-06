"""요청/응답 스키마: 무상태 생성(/inference/generate)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class GenerateMessage(BaseModel):
    role: str  # "user" | "assistant" | "system"
    content: str


class ModelCatalogItemResponse(BaseModel):
    """플랫폼 모델 유니버스 항목: control-tower 허용/기본 모델 UI 용(org 무관 전체 카탈로그)."""

    key: str
    label: str
    vendor: str | None = None
    # 자체(self)/외부(api) 호스팅 구분: 외부는 조직 API 키가 필요함을 UI 가 안내할 수 있게.
    serving: str  # "self" | "api"


class GenerateRequest(BaseModel):
    # 조직 id: 외부 벤더(Claude 등) 조직 키 해석용. 서비스토큰 신뢰 경계라 body 로 받는다.
    organizationId: str
    # 모델 ref: 카탈로그 키 또는 served 이름(프론트 저장 id). 미지정/미지 시 기본 chat 모델.
    model: str | None = None
    # 시스템 프롬프트(선택): 있으면 messages 앞에 붙인다.
    system: str | None = None
    messages: list[GenerateMessage] = Field(default_factory=list)
    maxTokens: int | None = None
    temperature: float = 0.7


class TokenUsageSchema(BaseModel):
    prompt: int
    completion: int
    total: int


class GenerateResponse(BaseModel):
    text: str
    model: str
    usage: TokenUsageSchema | None = None


class ImageRequest(BaseModel):
    # 조직 id: 외부 벤더(OpenAI) 조직 키 해석용. 서비스토큰 신뢰 경계라 body 로 받는다.
    organizationId: str
    # 이미지 모델 ref: 카탈로그 키 또는 프론트 저장 id('gpt-image-2'). 미지정/미지 시 기본 이미지 모델.
    model: str | None = None
    prompt: str
    # 미지정 시 서버 기본값(config). gpt-image-1: size∈{1024x1024,1024x1536,1536x1024}, quality∈{low,medium,high}.
    size: str | None = None
    quality: str | None = None
    # 생성 seed: 내장(FLUX)은 같은 기획안 씬끼리 동일 seed 로 일관성 확보. 외장(OpenAI)은 무시.
    seed: int | None = None


class ImageItemSchema(BaseModel):
    b64: str
    mime: str


class ImageTokenUsageSchema(BaseModel):
    """이미지 토큰 사용량: 단가가 셋 다 달라(텍스트입력/이미지입력/이미지출력) 합치지 않는다."""

    inputText: int
    inputImage: int
    outputImage: int


class ImageResponse(BaseModel):
    images: list[ImageItemSchema]
    model: str
    #: 벤더가 보고한 토큰 사용량. 자체 호스팅(FLUX)은 null: 무료라 과금 단위가 없다.
    #:  null 은 '0원' 이 아니라 '모름/해당없음' 이고, 호출자가 모델 key 로 둘을 구분한다.
    usage: ImageTokenUsageSchema | None = None


class ImageEngineLoadResponse(BaseModel):
    """자체 호스팅 이미지 엔진의 공유 큐 현황.

    작업자에게 "지금 앞에 몇 건"을 알리기 위한 값이다. 이 엔진은 조직 전체(실은 dev/staging/prod
    전체)가 함께 쓰는 GPU 1장이라, 내 대기 시간은 내 화면이 아니라 이 큐가 정한다.
    큐 개념이 없는 벤더(외부 API)는 이 응답 자체가 null 이다.
    """

    running: int
    pending: int
