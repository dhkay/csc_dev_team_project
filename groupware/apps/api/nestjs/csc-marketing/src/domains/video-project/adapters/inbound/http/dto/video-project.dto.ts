import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { RESOLUTION_KEYS, type VideoResolution } from '@csc/video-capabilities';

/**
 * 영상 프로젝트 생성 요청: 저장 기획안을 스냅샷해 프로젝트와 렌더 잡 등록
 * organizationId 와 ownerUserId 는 BFF 가 세션에서 도출해 전달
 */
export class CreateVideoProjectDto {
  @IsInt()
  organizationId: number;

  @IsInt()
  ownerUserId: number;

  // 소스 저장 기획안 id(개인)
  @IsInt()
  savedPlanId: number;

  // 원천 영상 화질. 어휘만 검증하고 모델의 실제 지원 여부는 서비스가 clamp(신뢰 경계)
  @IsOptional()
  @IsIn(RESOLUTION_KEYS)
  resolution?: VideoResolution;

  // 멱등키. 버튼을 누른 그 한 번을 식별해 더블클릭과 재시도의 중복 요금 방지
  // 같은 대상 재생성은 정상이라 대상 id 로 만들면 안 되고, 클릭 시점의 새 값을 재시도가 재사용
  @IsOptional()
  @IsString()
  @MaxLength(120)
  clientRequestId?: string;
}

/** 재렌더 요청: 저장된 조합 스펙으로 새 렌더 잡 등록. 스코프는 BFF 가 주입 */
export class RerenderVideoProjectDto {
  @IsInt()
  organizationId: number;

  @IsInt()
  ownerUserId: number;
}

/**
 * 작업 공간 배치 요청(생성 창의 마지막 단계). 스코프는 BFF 가 주입
 * 멱등키가 없음: 몇 번 배치하든 결과가 하나이고 되돌릴 유료 작업도 없음
 */
export class PlaceVideoProjectDto {
  @IsInt()
  organizationId: number;

  @IsInt()
  ownerUserId: number;

  // 함께 붙일 대표 썸네일 uploadId. 브라우저는 presign + PUT 까지만 하고 확정은 이 서버 담당
  // 없어도 배치는 됨(그림을 만들 수 없는 경우에 영상까지 못 배치하면 어느 목록에도 없게 됨)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  thumbnailUploadId?: string;
}

/**
 * 렌더 없이 완성 산출물을 만드는 요청(진행 화면 미리보기의 '영상 생성'). 개발 환경 전용
 * 씬도 저장본도 받지 않음: 렌더 스펙을 조립하지 않아 재료가 필요 없고 오해만 만듦
 */
export class CreatePreviewVideoProjectDto {
  @IsInt()
  organizationId: number;

  @IsInt()
  ownerUserId: number;

  // 이 산출물이 놓일 작업 공간의 채널(작업 공간은 작업자 x 채널로 갈림)
  @IsInt()
  channelId: number;

  @IsString()
  @MaxLength(300)
  title: string;

  // 미리보기의 생성 방식(카드 정보 팝오버에 그대로 노출). 없으면 빈 값
  @IsOptional()
  @IsString()
  @MaxLength(100)
  videoModel?: string;

  // 완성 영상 uploadId. 브라우저가 presign + PUT 까지 마쳤고 확정은 서버 담당
  @IsString()
  @MaxLength(200)
  resultUploadId: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  thumbnailUploadId?: string;

  // 멱등키. 같은 클릭의 재시도가 행을 두 개 만들지 않게 함
  @IsOptional()
  @IsString()
  @MaxLength(120)
  clientRequestId?: string;
}

/** 보관함으로 보내기 요청: 내 작업 공간 항목만 이동(ownerUserId 로 소유 검증) */
export class MoveVideoProjectDto {
  @IsInt()
  organizationId: number;

  @IsInt()
  ownerUserId: number;
}

/**
 * 보관함에서 꺼내기 요청. 보내기와 DTO 가 갈린 이유는 두 방향의 스코프가 다르기 때문
 * 보관함이 공용이라 소유 검증이 없고, 대신 어느 작업 공간으로 꺼낼지 정할 채널이 필요
 */
export class UnarchiveVideoProjectDto {
  @IsInt()
  organizationId: number;

  // 꺼내는 사람(= 꺼낸 뒤의 소유자)
  @IsInt()
  ownerUserId: number;

  // 꺼낸 항목이 들어갈 채널
  @IsInt()
  channelId: number;
}

/** 세그먼트 재생성 요청: 세그먼트 하나만 다시 만든다. 스코프는 BFF 가 주입 */
export class RerenderVideoProjectSegmentDto {
  @IsInt()
  organizationId: number;

  @IsInt()
  ownerUserId: number;

  // 새 화면 묘사. 없으면 원래 묘사 그대로 한 번 더 생성(같은 묘사라도 결과는 매번 다름)
  // 길이 상한 없음: 이 값이 영상 모델로 바로 나가고 렌더가 2400자에서 먼저 줄임
  @IsOptional()
  @IsString()
  visualPrompt?: string;
}
