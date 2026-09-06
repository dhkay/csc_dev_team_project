/**
 * 컨셉 한 축의 선택(저장되는 전부). 문구는 저장하지 않음
 * 사본을 두면 카탈로그를 고쳐도 저장분이 옛 문구를 계속 프롬프트로 보냄
 */
export interface ConceptChoice {
  // 축 식별자(style/mood/tone 등). 프롬프트 빌더의 라우팅 키
  axis: string;
  // 선택 옵션 key. 카탈로그 조회 키 + UI 하이라이트
  option: string;
}

/** 선택에 카탈로그 문구를 채운 형태. 조회 응답과 프롬프트용이고 이 형태로 저장되지는 않음 */
export interface ConceptSelection extends ConceptChoice {
  label: string;
  // 감독 노트(화면 표시 + 프롬프트)
  note: string;
  // 축의 표시 이름. 커스텀 축에만 채워짐(기본 축은 카탈로그가 앎)
  axisLabel?: string;
}
