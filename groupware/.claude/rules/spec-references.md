# 기획문서 참조 가이드

개발 전 관련 스펙 문서를 반드시 확인한다.

| 도메인 | 스펙 문서 | 참조 시점 |
|--------|----------|----------|
| 인증 (로그인/회원가입/토큰/비밀번호) | [auth-specification.md](../../docs/specs/auth-specification.md) | 인증 관련 기능 개발, 수정 시 |
| 마케팅 영상 도구 쓰기(생성/저장/삭제) | [marketing-write-consistency.md](../../docs/specs/marketing-write-consistency.md) | 원격 부수효과(자산/렌더 잡)가 있는 쓰기를 추가, 수정할 때. 단계가 둘을 넘으면 사가 정의로 짠다(그 문서 4.5) |
| 마케팅 영상 도구 버전 축(v1.0 / v1.5) | [marketing-tool-versions.md](../../docs/specs/marketing-tool-versions.md) | 이 도구에 엔드포인트, 산출물, 쿼리 키, 화면 섹션을 추가할 때. 두 버전은 제품으로 별개다 |
