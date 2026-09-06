"""아직 수집 구현이 없는 소스의 서술자.

구현이 없어도 서술자를 두는 이유: AI 도구의 소스 목록 화면이 "앞으로 무엇이 붙는가"를 보여줘야 하고,
그 목록을 프론트가 직접 들고 있으면 다시 수집 지식이 AI 도구로 새기 때문이다. 구현이 생기면
그 소스의 도메인으로 서술자를 옮기고 status 를 available 로 바꾼다.

차단 사유(봇 방어, 레이트리밋, 폐기된 라이브러리 등)는 여기 적지 않는다. 그건 수집 운영 지식이고,
소비자가 그것으로 할 수 있는 일이 없다. 판단 결과인 status 만 내보낸다.
"""

from __future__ import annotations

from .core.domain.entities import SourceDescriptor
from .core.domain.types import SourceStatus

PLANNED_SOURCES: tuple[SourceDescriptor, ...] = (
    SourceDescriptor(
        id="NAVER_SHOPPING_REVIEW",
        label="네이버 쇼핑 리뷰",
        description="상품 리뷰 텍스트, 평점",
        status=SourceStatus.PLANNED,
    ),
    SourceDescriptor(
        id="META_AD_LIBRARY",
        label="Meta 광고 라이브러리",
        description="집행 중 광고 크리에이티브",
        status=SourceStatus.PLANNED,
    ),
    SourceDescriptor(
        id="COUPANG_REVIEW",
        label="쿠팡 상품 리뷰",
        description="상품 리뷰 텍스트, 평점",
        status=SourceStatus.PLANNED,
    ),
    SourceDescriptor(
        id="TIKTOK_TRENDS",
        label="TikTok Creative Center + 틱톡/릴스 트렌드",
        description="인기 해시태그, 영상 트렌드",
        status=SourceStatus.PLANNED,
    ),
)
