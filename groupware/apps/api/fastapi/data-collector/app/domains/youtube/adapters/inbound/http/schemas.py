"""요청/응답 Pydantic 스키마."""

from __future__ import annotations

from pydantic import BaseModel, Field

from .....collection.adapters.inbound.http.schemas import CollectionEnvelope


class VideoStatSchema(BaseModel):
    rank: int = Field(description="조회수 순위. 1 이 가장 많이 본 영상이다.")
    videoId: str = Field(description="영상 식별자. 주소는 `https://youtu.be/{videoId}` 다.")
    title: str = Field(description="영상 제목.")
    channelTitle: str = Field(description="채널 이름.")
    publishedAt: str = Field(description="업로드 시각(ISO 8601).")
    duration: str = Field(
        description="재생 시간. `PT3M34S` 형식(ISO 8601 기간)이며 초 단위 숫자가 아니다."
    )
    viewCount: int = Field(description="조회수.")
    likeCount: int | None = Field(
        default=None,
        description=(
            "좋아요 수. 채널이 숨긴 경우 null 이다. **0 과 다르다**(0 은 반응이 없다는 뜻이고"
            " null 은 알 수 없다는 뜻이다)."
        ),
    )
    commentCount: int | None = Field(
        default=None, description="댓글 수. 채널이 숨긴 경우 null 이다."
    )
    thumbnailUrl: str = Field(description="대표 이미지 주소.")


class VideoStatResponse(CollectionEnvelope):
    keyword: str = Field(description="조회한 검색어.")
    videos: list[VideoStatSchema] = Field(
        default=[], description="검색 상위 영상. 조회수가 많은 순서로 들어 있다."
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "keyword": "김치찌개",
                "status": "ok",
                "collectedAt": "2026-08-11T02:57:42.438190Z",
                "expectedItems": 10,
                "videos": [
                    {
                        "rank": 1,
                        "videoId": "iZyofxQlJ2k",
                        "title": "돼지고기 김치찌개",
                        "channelTitle": "다솔쿠",
                        "publishedAt": "2025-03-24T05:00:35Z",
                        "duration": "PT3M34S",
                        "viewCount": 1802537,
                        "likeCount": 19325,
                        "commentCount": None,
                        "thumbnailUrl": "https://i.ytimg.com/vi/iZyofxQlJ2k/hqdefault.jpg",
                    }
                ],
            }
        }
    }
