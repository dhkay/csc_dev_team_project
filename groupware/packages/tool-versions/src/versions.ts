/**
 * 도구 버전의 값 공간: 마케팅 영상 도구의 v1.0 과 v1.5 는 별개 워크스페이스다.
 *
 * 이 값은 개인 설정 한 칸이 아니라 주소의 축이다(`/{org}/{tool}/{version}/{channel}`)
 * 산출물(기획안/영상/최종)이 어느 버전 소유인지, 개인 설정의 어느 슬롯을 읽는지, 어느 파이프라인
 * 구현으로 만드는지가 전부 이 값으로 갈린다.
 *
 * 공유 커널인 이유: 서버와 화면이 각자 선언하면 컴파일러가 볼 수 없는 짝이 되어 한쪽만 고쳤을 때
 * 조용히 어긋난다(서버에만 있으면 도달할 화면이 없고 화면에만 있으면 400)
 * 한 곳에서 나오면 그 어긋남 자체가 존재할 수 없다.
 */
export type ToolVersion = 'v1.0' | 'v1.5';

/**
 * 허용 값 목록. 앞이 진입 기본값이자 표시 순서의 첫 항목이다.
 *
 * 서버가 목록을 갖는 이유는 모르는 값이 설정 슬롯을 하나 더 만들지 못하게 막기 위해서다(그 슬롯은
 * 어느 화면에서도 도달할 수 없어 "저장했는데 반영이 안 된다" 로 나타난다)
 */
export const TOOL_VERSIONS: readonly ToolVersion[] = ['v1.5', 'v1.0'];

/** 아직 고른 적 없는 사람이 처음 들어가는 버전 */
export const DEFAULT_TOOL_VERSION: ToolVersion = 'v1.5';

/**
 * 값 공간 판정(좁히기 전용): 목록에 없으면 null.
 *
 * 요청 검증은 반드시 이쪽을 쓴다. 기본값으로 접는 함수로 검증하면 버전을 빠뜨린 요청이 조용히
 * 기본 버전으로 처리되어, 화면이 말한 버전과 다른 워크스페이스의 데이터가 오간다. 요청을 거절하는
 * 일(400 을 던지는 일)은 프레임워크의 것이라 이 커널에 두지 않는다: 소비자가 자기 예외로 감싼다.
 */
export function asToolVersion(raw: unknown): ToolVersion | null {
  return (TOOL_VERSIONS as readonly unknown[]).includes(raw) ? (raw as ToolVersion) : null;
}

/**
 * 저장분/낡은 값 정규화: 모르는 값은 기본으로 좁힌다.
 *
 * 쓰는 자리는 하나다. 진입 기본 버전(그 사람이 다음에 어디로 들어갈지). 폐기된 버전이 저장돼
 * 있어도 도구에 못 들어가는 일은 없어야 한다. 요청의 버전에는 쓰지 않는다(위 주석 참고)
 */
export function toolVersionOrDefault(raw: unknown): ToolVersion {
  return asToolVersion(raw) ?? DEFAULT_TOOL_VERSION;
}

/**
 * 버전마다 하나씩 채우는 표. 버전을 늘리면 이 표를 쓰는 모든 자리가 컴파일 에러가 된다.
 *
 * 그것이 이 타입의 목적이다: 새 버전이 답하지 않은 질문을 남긴 채 배포되지 않게 한다.
 */
export type ToolVersionRecord<T> = Record<ToolVersion, T>;
