import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type { SavedPlanInfographic, SavedPlanScene } from '../../../../core/domain';
import type { AudioAssetRef } from '../../../../../../shared/domain/audio';
import { ConceptChoiceDto } from '../../../../../../shared/adapters/inbound/http/dto';

/** 오디오 스냅샷(BGM) 저장 DTO. 생성 시 AI 가 고른 assetId 와 uploadId, name */
class SavePlanBgmDto {
  @IsInt()
  assetId: number;

  @IsString()
  @MaxLength(200)
  uploadId: string;

  @IsString()
  @MaxLength(300)
  name: string;
}

/** 씬 효과음 저장 DTO. 오디오 스냅샷 + 씬 시작 기준 부호 있는 offsetSec(음수는 전환에 걸침) */
class SavePlanSfxDto extends SavePlanBgmDto {
  @IsNumber()
  offsetSec: number;
}

/**
 * 인포그래픽(다형) 저장 DTO. 형태별 필드를 optional 로 평탄 선언
 * whitelist:true 가 선언된 프로퍼티만 남기므로 여기 선언된 필드는 그대로 영속
 * 엄격 검증은 생성 경계(어댑터 toInfographic) 담당이고 새 형태는 필드를 optional 로 추가
 */
class SavePlanInfographicDto {
  @IsString()
  @MaxLength(40)
  type: string; // list|table|bar|comparison|steps|stat|timeline

  @IsString()
  @MaxLength(300)
  title: string;

  @IsOptional()
  @IsArray()
  items?: string[]; // list 전용. steps 는 아래 별도 필드

  @IsOptional()
  @IsArray()
  steps?: string[];

  @IsOptional()
  @IsArray()
  columns?: string[];

  @IsOptional()
  @IsArray()
  rows?: string[][];

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @IsOptional()
  @IsArray()
  bars?: { label: string; value: number }[];

  @IsOptional()
  @IsObject()
  left?: { heading: string; points: string[] };

  @IsOptional()
  @IsObject()
  right?: { heading: string; points: string[] };

  @IsOptional()
  @IsArray()
  stats?: { value: string; label: string }[];

  @IsOptional()
  @IsArray()
  events?: { time: string; label: string }[];
}

class SavePlanSceneDto {
  @IsInt()
  index: number;

  // 소스 방향과 하단 자막은 이미지→영상 버전만 전송
  // 필수로 두면 텍스트→영상 저장이 400 이고, 억지로 채운 빈 문자열이 "없다"를 위장해 오독을 만듦
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  sourceDirection?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  subtitle?: string;

  // 나레이션은 두 버전 다 채우는 화면 밖 문장이라 이것만 필수
  @IsString()
  @MaxLength(2000)
  narration: string;

  // 씬 이미지 프롬프트(영어). 이미지 모델 전용이고 구 저장분 호환을 위해 선택
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  imagePrompt?: string;

  // 장면 구성: 영상 모델이 그대로 읽는 문장(텍스트→영상 버전만)
  // 벤더 프롬프트 상한을 대사와 나눠 쓰므로 넘치면 렌더가 이쪽을 먼저 줄임
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  sceneComposition?: string;

  // 대화내용: 이 동영상에서 말하는 문장. 상한은 narration 과 같음
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  dialogue?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SavePlanInfographicDto)
  infographic?: SavePlanInfographicDto;

  // 씬 효과음 목록(0..N). 생성 시 AI 가 고른 스냅샷 + offsetSec
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SavePlanSfxDto)
  sfx?: SavePlanSfxDto[];
}

class SavePlanSceneImageDto {
  @IsInt()
  index: number;

  @IsString()
  @MaxLength(200)
  uploadId: string;

  // 이 이미지를 만든 최종 프롬프트(생성 시점). 외부 이미지엔 없어 선택
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  prompt?: string;
}

/**
 * 기획안 저장 요청(개인 워크스페이스)
 * organizationId 와 ownerUserId 는 BFF 가 세션에서 도출해 전달
 */
export class SavePlanDto {
  @IsInt()
  organizationId: number;

  @IsInt()
  ownerUserId: number;

  @IsOptional()
  @IsInt()
  channelId?: number;

  @IsString()
  @MaxLength(200)
  brandName: string;

  // 멱등키. 자동 저장은 기획안 하나당 한 번이라 클라이언트가 결정적 값(배치:기획안)을 만듦
  @IsOptional()
  @IsString()
  @MaxLength(120)
  clientRequestId?: string;

  // 이 기획안을 만들 때 실제로 쓴 연출 축 조합. 생략하면 세트 조합 그대로 만든 것으로 봄
  // 세트가 나중에 바뀌어도 같은 연출로 씬 이미지를 다시 만들 수 있게 하는 값
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(16)
  @ValidateNested({ each: true })
  @Type(() => ConceptChoiceDto)
  brandConcepts?: ConceptChoiceDto[];

  // 이 기획안을 실제로 쓴 기획 LLM. 생성 응답이 돌려준 값을 그대로 전송
  //
  // 선택이 아님. 빠지면 400 이고, 선택으로 두면 원장이 그 기획안을 "모델 모름"으로 말하는데
  // 그 값은 생성 순간에만 알 수 있어 되메울 수 없다.
  // 빈 문자열은 막지 않음(@IsNotEmpty 금지). 생성 응답이 실제로 빈 값을 주는 설정이 있음
  @IsString()
  @MaxLength(100)
  llmModel: string;

  // 이 기획안을 만들 때 고른 영상 모델(생성 시점 스냅샷). 없으면 영상 만들 때 그때의 설정을 봄
  @IsOptional()
  @IsString()
  @MaxLength(100)
  videoModel?: string;

  // 세그먼트 연결 방식(생성 시점 스냅샷). 값 공간은 렌더 소유라 여기서는 길이만 검증
  @IsOptional()
  @IsString()
  @MaxLength(32)
  segmentMode?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title: string;

  @IsString()
  @MaxLength(5000)
  summary: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SavePlanSceneDto)
  scenes: SavePlanSceneDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SavePlanSceneImageDto)
  sceneImages: SavePlanSceneImageDto[];

  // 기획안 전체 BGM(선택 시점 스냅샷). 후보 풀이 비어 미배정이면 생략
  @IsOptional()
  @ValidateNested()
  @Type(() => SavePlanBgmDto)
  bgm?: SavePlanBgmDto;
}

/** 인포그래픽 저장 DTO 를 도메인 유니온으로 변환. 누락 필드는 빈 값, 미지 type 은 제거 */
function toSavedInfographic(d: SavePlanInfographicDto): SavedPlanInfographic | undefined {
  const title = d.title ?? '';
  switch (d.type) {
    case 'list':
      return { type: 'list', title, items: d.items ?? [] };
    case 'table':
      return { type: 'table', title, columns: d.columns ?? [], rows: d.rows ?? [] };
    case 'bar':
      return { type: 'bar', title, bars: d.bars ?? [], ...(d.unit ? { unit: d.unit } : {}) };
    case 'comparison':
      return {
        type: 'comparison',
        title,
        left: d.left ?? { heading: '', points: [] },
        right: d.right ?? { heading: '', points: [] },
      };
    case 'steps':
      return { type: 'steps', title, steps: d.steps ?? [] };
    case 'stat':
      return { type: 'stat', title, stats: d.stats ?? [] };
    case 'timeline':
      return { type: 'timeline', title, events: d.events ?? [] };
    default:
      return undefined;
  }
}

/** 저장 요청 씬을 도메인 씬으로 변환. 인포그래픽만 유니온으로 좁히고 효과음은 스냅샷 그대로 */
export function toSavedPlanScenes(scenes: SavePlanSceneDto[]): SavedPlanScene[] {
  return scenes.map((s) => {
    const info = s.infographic ? toSavedInfographic(s.infographic) : undefined;
    return {
      index: s.index,
      narration: s.narration,
      // 빈 값은 싣지 않음. 그 부재가 곧 "이 버전은 이 필드를 쓰지 않는다"이고 읽는 쪽이 형식을 가름
      ...(s.sourceDirection ? { sourceDirection: s.sourceDirection } : {}),
      ...(s.subtitle ? { subtitle: s.subtitle } : {}),
      ...(s.imagePrompt ? { imagePrompt: s.imagePrompt } : {}),
      ...(s.sceneComposition ? { sceneComposition: s.sceneComposition } : {}),
      ...(s.dialogue ? { dialogue: s.dialogue } : {}),
      ...(info ? { infographic: info } : {}),
      ...(s.sfx && s.sfx.length > 0
        ? {
            sfx: s.sfx.map((x) => ({
              assetId: x.assetId,
              uploadId: x.uploadId,
              name: x.name,
              offsetSec: x.offsetSec,
            })),
          }
        : {}),
    };
  });
}

/** 저장 요청 BGM 을 도메인 스냅샷으로 변환. 없으면 null 이고 렌더에서 강제 */
export function toSavedPlanBgm(bgm?: SavePlanBgmDto): AudioAssetRef | null {
  return bgm ? { assetId: bgm.assetId, uploadId: bgm.uploadId, name: bgm.name } : null;
}

/**
 * 저장본 한 씬 편집 요청. 이미지 교체와 조립 프롬프트, 브리프 중 준 것만 반영
 * organizationId 와 ownerUserId 는 BFF 가 세션에서 도출해 전달
 */
export class UpdateSceneDto {
  @IsInt()
  organizationId: number;

  @IsInt()
  ownerUserId: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  uploadId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  prompt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  imagePrompt?: string;
}
