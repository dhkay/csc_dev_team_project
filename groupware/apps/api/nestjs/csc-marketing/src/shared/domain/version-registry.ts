import type { ToolVersion } from './tool-version';

/**
 * 버전별 구현 표. `Record<ToolVersion, T>` 가 exhaustive 라는 것이 이 타입의 전부
 * 버전을 늘릴 때 등록 누락을 컴파일러가 잡는다(맵이나 스위치는 런타임 undefined 로 조용히 터짐)
 * `Partial<>` 이나 `as` 우회 방지는 소스 검사(shared/__tests__/tool-version-guards.spec.ts)가 담당
 */
export type VersionRegistry<T> = Readonly<Record<ToolVersion, T>>;
