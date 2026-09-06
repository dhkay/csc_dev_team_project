/**
 * 계약 버전과 클라이언트 신원 헤더
 *
 * 현장 PC 는 즉시 업데이트되지 않는다. 구버전 클라이언트가 존재하는 것은 장애가 아니라
 * 정상 상태이고, 이 파일은 그 전제 위에서 서버와 클라이언트가 서로의 나이를 알아보는 수단이다.
 * 상세 정책: docs/specs/mes-client-compatibility.md
 */

/**
 * 전송 계약(wire) 버전. 동기화 커서에 실려 나가고, 서버가 이 값을 올리면 클라이언트는
 * 로컬 미러를 비우고 재부트스트랩한다(outbox 는 비우지 않는다)
 *
 * 올리는 기준: 필드 추가는 올리지 않는다(additive 는 v1 안에서 허용). 필드 삭제, 타입 변경,
 * 의미 변경처럼 구버전 파서가 오해할 수 있는 변경에만 올린다.
 */
export const WIRE_VERSION = 1;

/**
 * 서버가 받아주는 최소 클라이언트 버전. 이 값 미만은 신규 쓰기가 409 로 거부된다.
 * 다만 동기화 push 는 어떤 상태에서도 수락된다(아래 SYNC_PUSH_ALWAYS_ACCEPTED 참고)
 */
export const MIN_SUPPORTED_CLIENT = '0.1.0';

/** 서버가 권장하는 클라이언트 버전. 이 값 미만은 배너로 업데이트를 안내한다. */
export const RECOMMENDED_CLIENT = '0.1.0';

/**
 * 절대 불변식: 동기화 push 는 hard-block 상태에서도 항상 수락한다.
 *
 * 구버전 PC 를 차단해 놓고 그 PC 의 outbox 에 어제 생산실적이 남아 있으면 영구 유실이다.
 * 오프라인 우선 앱의 최대 사고 유형이고, 대개 차단 로직을 넣은 그날 발생한다.
 * 이 상수는 문서가 아니라 코드에 박아두기 위한 것이다(게이트 구현이 이 값을 참조한다)
 */
export const SYNC_PUSH_ALWAYS_ACCEPTED = true;

/** 클라이언트 -> 서버 신원 헤더. 모든 요청에 싣는다. */
export const CLIENT_APP_HEADER = 'x-client-app';
export const CLIENT_VERSION_HEADER = 'x-client-version';
export const DEVICE_ID_HEADER = 'x-device-id';
export const LOCAL_SCHEMA_HEADER = 'x-local-schema';

/** 디바이스 자격 증명 헤더. 유저 JWT(Authorization) 와 함께 요구된다. */
export const DEVICE_TOKEN_HEADER = 'x-device-token';

/**
 * 서버 -> 클라이언트 정책 헤더. 모든 응답에 싣는다.
 * 별도 정책 조회 엔드포인트를 만들면 그 엔드포인트만 호출 안 하는 버그가 생긴다.
 */
export const MIN_SUPPORTED_CLIENT_HEADER = 'x-min-supported-client';
export const RECOMMENDED_CLIENT_HEADER = 'x-recommended-client';
export const CLIENT_STATUS_HEADER = 'x-client-status';

/** 이 데스크톱 앱의 클라이언트 식별자(X-Client-App 값) */
export const MES_DESKTOP_APP_ID = 'mes-desktop';

/** 클라이언트 버전 판정 결과. 서버가 X-Client-Status 로 내려준다. */
export enum ClientStatus {
  /** 정상 */
  Ok = 'ok',
  /** 동작하되 업데이트 권장. 앱이 상단 배너를 띄운다. */
  Deprecated = 'deprecated',
  /** 신규 쓰기만 409. 조회와 동기화 push 는 계속 허용 */
  SoftBlock = 'soft-block',
  /** 426 Upgrade Required. 단 동기화 push 는 여전히 수락된다. */
  HardBlock = 'hard-block',
}
