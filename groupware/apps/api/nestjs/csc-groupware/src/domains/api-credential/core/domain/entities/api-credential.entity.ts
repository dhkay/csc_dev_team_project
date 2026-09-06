/**
 * UI 응답용 뷰: "어떤 필드가 설정됐는지"(configuredFields)와, 비밀이 아닌 필드의 값만 노출한다.
 * 시크릿 값은 절대 서버 밖으로 나가지 않는다.
 */
export interface ApiCredentialView {
  provider: string;
  enabled: boolean;
  configuredFields: string[];
  // 비시크릿 필드(`CredentialFieldSpec.secret === false`)의 값. 그 밖의 필드는 여기 담기지 않는다.
  //
  // 카탈로그가 비밀이 아니라고 선언한 것만 담기므로, 필드를 추가하며 플래그를 잘못 주지 않는 한
  // 시크릿이 샐 수 없다. 값을 되돌려주는 이유는 화면이 그 값을 보여주고 유지해야 하기 때문이다.
  // (안 그러면 API 키를 교체할 때마다 비밀도 아닌 값을 함께 다시 입력해야 한다)
  publicValues: Record<string, string>;
  // 마지막 저장 시각(ISO). 미등록이면 null.
  updatedAt: string | null;
}
