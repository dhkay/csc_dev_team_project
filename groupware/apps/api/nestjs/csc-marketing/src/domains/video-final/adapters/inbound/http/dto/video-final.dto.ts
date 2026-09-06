import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 최종 영상 생성 요청: 완성된 원천 영상 + 세트로 최종 합성 잡 등록
 * organizationId/ownerUserId 는 신뢰된 호출자(web-groupware BFF)가 세션에서 도출해 전달한다.
 */
export class CreateVideoFinalDto {
  @IsInt()
  organizationId: number;

  @IsInt()
  ownerUserId: number;

  // 원천 영상 프로젝트 id(완성 상태)
  @IsInt()
  sourceId: number;

  // 적용할 세트 id(배경프레임 + 아웃트로)
  @IsInt()
  setId: number;

  // 멱등키. 버튼을 누른 그 한 번을 식별해 더블클릭과 재시도의 중복 요금 방지
  // 같은 대상 재생성은 정상이라 대상 id 로 만들면 안 되고, 클릭 시점의 새 값을 재시도가 재사용
  @IsOptional()
  @IsString()
  @MaxLength(120)
  clientRequestId?: string;
}

/** 재렌더 요청: 저장된 세트 스냅샷 + 원천으로 새 FINALIZE 잡 등록. 스코프는 BFF 가 주입 */
export class RerenderVideoFinalDto {
  @IsInt()
  organizationId: number;

  @IsInt()
  ownerUserId: number;
}

/**
 * 보관함으로 보내기 요청. ownerUserId 로 소유를 검증하므로 내 작업 공간 항목만 보낼 수 있다.
 */
export class MoveVideoFinalDto {
  @IsInt()
  organizationId: number;

  @IsInt()
  ownerUserId: number;
}

/**
 * 보관함에서 꺼내기 요청. 보내기와 DTO 가 갈린 이유는 두 방향의 스코프가 다르기 때문이다.
 *
 * 보관함은 조직 공용이라 꺼내기에는 소유 검증이 없다(남이 만든 것도 꺼낼 수 있다). 대신 어느
 * 워크스페이스로 꺼낼지를 정해야 해서 채널이 필요하다: 워크스페이스는 작업자 × 채널로 갈리므로
 * 채널이 없으면 꺼낸 항목이 어느 목록에도 나타나지 않는다.
 */
export class UnarchiveVideoFinalDto {
  @IsInt()
  organizationId: number;

  // 꺼내는 사람(= 꺼낸 뒤의 소유자)
  @IsInt()
  ownerUserId: number;

  // 꺼낸 항목이 들어갈 채널(꺼내는 사람의 채널)
  @IsInt()
  channelId: number;
}
