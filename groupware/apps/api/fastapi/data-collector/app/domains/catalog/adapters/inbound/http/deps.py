"""카탈로그 의존성 키.

라우터 파일이 아니라 여기 두는 이유: 카탈로그를 쓰는 라우트가 둘 이상이다(카탈로그 자신 +
소스 라우트의 분야 검증). 각자 스텁을 선언하면 같은 의존성에 키가 두 개 생겨 app 조립에서
오버라이드를 두 번 해야 하고, 하나를 빠뜨리면 그 라우트만 NotImplementedError 로 죽는다.

module.py 에 두지 않는 이유는 순환이다: module.py 가 router 를 재노출하므로 router 가 module 을
import 하면 사이클이 된다.
"""

from __future__ import annotations

from .....catalog.core.application.ports.inbound import SourceCatalogPort


def get_source_catalog() -> SourceCatalogPort:
    """실제 provider 는 app/main.py 에서 오버라이드된다."""
    raise NotImplementedError
