import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { ApiProviderKey } from '@csc/api-providers';
import { resolveVideoResolution } from '@csc/video-capabilities';
import { SavedPlanEntity } from '../../../../saved-plan/core/domain';
import {
  AiModelSelection,
  ChannelSettingsPort,
  CHANNEL_SETTINGS_PORT,
} from '../../../../channel-settings/core/application/ports/inbound';
import {
  assertAssetsUploaded,
  FileUploadStoragePort,
} from '../../../../../shared/domain/storage';
import { pipelineFor } from '../../../../../shared/domain/version-pipeline';
import type { ToolVersion } from '../../../../../shared/domain/tool-version';
import type { OwnerVersionScope } from '../../../../../shared/domain/workspace-scope';
import { VideoProjectEntity, VideoProjectScene } from '../../domain';
import {
  ApiCredentialResolverPort,
  API_CREDENTIAL_RESOLVER_PORT,
  PreparedProjectSpec,
  VideoRenderSpec,
  VideoRenderSpecBuilder,
} from '../ports/outbound';

/** 씬 비주얼 provider 라우팅: 모델 id → video-model provider key. 미등록 모델은 기본(slideshow) */
export const VIDEO_PROVIDER_BY_MODEL: Record<string, string> = {
  'wan2.2-ti2v-5b': 'wan2.2-ti2v-5b',
};
export const DEFAULT_VIDEO_PROVIDER = 'slideshow';

// 라우트가 없는 외부 씬 비주얼 모델 → 자격증명 provider. 라우트가 있는 key 는 VIDEO_ROUTES 가 답함
// 값이 카탈로그 key 라 개명과 오타가 컴파일에서 잡힘
export const CREDENTIAL_PROVIDER_BY_MODEL: Record<string, ApiProviderKey> = {
  'grok-imagine-video': 'XAI',
};

/**
 * 경유 라우트. 카탈로그 key 의 첫 조각이 곧 video-model provider key 이고 값은 요구하는 조직 키
 * 모델을 표에 한 줄씩 적지 않는 이유: 라우트 규칙이면 카탈로그 한 줄로 라우팅과 자격증명이 따라옴
 * 플랫폼 경유와 운영사 직접이 함께 있고, 어느 부류인지는 자격증명 카탈로그의 kind 가 소유
 */
export const VIDEO_ROUTES = {
  higgsfield: 'HIGGSFIELD',
  gemini: 'GEMINI',
} satisfies Record<string, ApiProviderKey>;

type VideoRoute = keyof typeof VIDEO_ROUTES;

/**
 * 카탈로그 key 를 라우트와 그 안의 모델로 분리. 라우트 접두사가 없으면 null
 * null 은 라우트 이전의 단일 모델 key. 저장된 선택과 단가표가 그 문자열이라 개명하지 않음
 */
function parseRoute(model: string): { route: VideoRoute; path: string } | null {
  const slash = model.indexOf('/');
  if (slash <= 0) return null;
  const head = model.slice(0, slash);
  if (!(head in VIDEO_ROUTES)) return null;
  const path = model.slice(slash + 1);
  return path ? { route: head as VideoRoute, path } : null;
}

/**
 * 키가 확인된 외부 씬 비주얼 모델을 처리할 video-model provider key
 * VIDEO_PROVIDER_BY_MODEL 은 키 확인 전의 기본값을 정하는 다른 판정이라 보지 않음
 */
function videoProviderForModel(model: string): string {
  return parseRoute(model)?.route ?? model;
}

/**
 * 이 모델이 요구하는 조직 자격증명 provider(내부 모델이면 undefined)
 * "이 모델이 외부 벤더를 부르는가"의 유일한 답이고 비용 귀속도 이 판정을 사용
 */
export function credentialProviderForModel(model: string): ApiProviderKey | undefined {
  const routed = parseRoute(model);
  return routed ? VIDEO_ROUTES[routed.route] : CREDENTIAL_PROVIDER_BY_MODEL[model];
}

/** 그 provider 안에서 부를 모델(라우트가 없으면 null: provider key 자체가 모델) */
function videoModelPathForModel(model: string): string | null {
  return parseRoute(model)?.path ?? null;
}

// 나레이션 모델 → 조직 자격증명 provider. 여기 없는 모델은 키 불필요(edge-tts)
// 씬 비주얼과 표를 나눈 이유: 나레이션은 키에 딸린 음성 id 까지 있어야 호출이 성립
const CREDENTIAL_PROVIDER_BY_TTS_MODEL: Record<string, ApiProviderKey> = {
  eleven_v3: 'ELEVENLABS',
  eleven_multilingual_v2: 'ELEVENLABS',
  eleven_flash_v2_5: 'ELEVENLABS',
};

const DEFAULT_TTS_PROVIDER = 'edge-tts';
const DEFAULT_TTS_VOICE = 'ko-KR-SunHiNeural';
const DEFAULT_TTS_PITCH = '+0Hz';

const EMPTY_AI_MODELS: AiModelSelection = {
  llm: '',
  video: '',
  videoMode: '',
  tts: '',
  ttsVoice: '',
  ttsPitch: '',
  image: '',
};

/**
 * 렌더 스펙 조립 규칙의 소유자(애플리케이션 계층 협력자)
 *
 * 생성 사가와 재렌더가 같은 규칙을 쓰게 하려고 서비스에서 분리(서비스에 두면 사가가 복제하게 됨)
 * 포트로 두지 않음: 외부 경계가 아니라 같은 계층의 협력자이고 교체 대상이 아님
 * 스펙은 저장하지 않음: sceneVisualApiKey 가 실려 사가 컨텍스트에 담으면 평문 키가 DB 에 남음
 */
@Injectable()
export class VideoProjectSpecBuilder implements VideoRenderSpecBuilder {
  private readonly logger = new Logger(VideoProjectSpecBuilder.name);

  constructor(
    @Inject(CHANNEL_SETTINGS_PORT)
    private readonly channelSettings: ChannelSettingsPort,
    @Inject(API_CREDENTIAL_RESOLVER_PORT)
    private readonly credentials: ApiCredentialResolverPort,
  ) {}

  async prepareFromPlan(
    scope: OwnerVersionScope,
    plan: SavedPlanEntity,
    requestedResolution: string | null,
  ): Promise<PreparedProjectSpec> {
    const settings = await this.resolveAiModels(scope);
    // 기획안이 자기 영상 모델을 들고 있으면 그것이 이긴다. 생성 모달의 선택은 설정에 남지 않으므로
    // 설정을 먼저 보면 고른 것과 다른 모델로 렌더됨. 빈 문자열이면 미선택이라 설정을 봄
    const aiModels: AiModelSelection = plan.videoModel
      ? { ...settings, video: plan.videoModel }
      : settings;
    const scenes = buildProjectScenes(plan, pipelineFor(scope.version).usesSceneImages);
    // 화질 clamp: 요청값을 선택된 영상모델이 지원하는 값으로만 확정(클라이언트 불신)
    const resolution = resolveVideoResolution(aiModels.video, requestedResolution);
    // 화면비는 버전이 정하고 프로젝트 행에 굳으므로 기존 영상은 자기 행의 값으로 계속 렌더됨
    const aspectRatio = pipelineFor(scope.version).aspectRatio;
    const spec = buildRenderSpec(
      scope.organizationId,
      scenes,
      aiModels,
      aspectRatio,
      resolution,
      plan.bgm,
    );
    // 자격증명은 미부착. 이 스펙은 예약 행 재료와 사전검증에만 쓰여 붙이면 원격 키 조회가 헛돔
    return { aiModels, scenes, aspectRatio, resolution, spec };
  }

  async buildSpecFromRow(project: VideoProjectEntity): Promise<VideoRenderSpec> {
    // 행에 굳은 모델 스냅샷으로 복원(재렌더도 원본과 같은 설정으로 돌아야 함)
    const aiModels: AiModelSelection = {
      ...EMPTY_AI_MODELS,
      video: project.videoModel,
      videoMode: project.videoMode,
      tts: project.ttsModel,
      ttsVoice: project.ttsVoice,
      ttsPitch: project.ttsPitch,
    };
    const spec = buildRenderSpec(
      project.organizationId,
      project.scenes,
      aiModels,
      project.aspectRatio,
      project.resolution,
      project.bgm,
    );
    // 세그먼트 연결 방식: 행에 굳은 생성 시점 선택. 없으면 비워 렌더 기본(순차)
    spec.segmentMode = project.segmentMode || null;
    // 소리를 렌더가 만드는가. 행에 굳은 버전으로 정함(요청 버전이 아니라 만든 규칙 그대로)
    spec.synthesizeSpeech = pipelineFor(project.version).synthesizesSpeech;
    await this.applySceneVisualCredential(
      spec,
      project.organizationId,
      project.videoModel,
      project.version,
    );
    // 나레이션 자격증명은 합성하는 렌더만 검사. 아니면 소리를 안 만드는 렌더가 402 로 막힘
    if (spec.synthesizeSpeech) {
      await this.applyTtsCredential(spec, project.organizationId, project.ttsModel);
    }
    this.assertVisualProviderRenderable(spec, project.version);
    return spec;
  }

  /**
   * 씬 이미지를 만들지 않는 버전은 기본 씬 비주얼로 렌더 불가
   *
   * slideshow 는 씬 이미지 한 장이 필요해 그 버전에서는 워커까지 가서 내부 문구로 죽는다.
   * 원인(키 미등록, 빈 모델, 모르는 값)을 나열하지 않고 결과 하나를 막는다.
   * 402 인 이유: 그 상태코드만 사유 문구를 화면까지 전달하고 재시도 대신 설정을 고치라고 알림
   */
  private assertVisualProviderRenderable(spec: VideoRenderSpec, version: ToolVersion): void {
    if (pipelineFor(version).usesSceneImages) return;
    if (spec.videoProvider !== DEFAULT_VIDEO_PROVIDER) return;
    this.logger.warn(
      `${version} 은 기본 씬 비주얼(${DEFAULT_VIDEO_PROVIDER})로 렌더할 수 없습니다(씬 이미지 없음).` +
        ' 영상 모델이 정해지지 않아 렌더를 시작하지 않습니다.',
    );
    throw new HttpException(
      '영상 모델이 정해지지 않아 영상을 만들 수 없습니다. 설정에서 영상 모델을 확인하세요.',
      HttpStatus.PAYMENT_REQUIRED,
    );
  }

  async assertSpecAssetsUploaded(
    storage: FileUploadStoragePort,
    spec: VideoRenderSpec,
  ): Promise<void> {
    await assertAssetsUploaded(storage, collectSpecAssetIds(spec));
  }

  /**
   * 만드는 사람의 그 버전 AI 모델 선택 해석. 인프라 실패만 기본값으로 폴백
   * 잘못된 요청(400)은 삼키지 않음. 전부 삼키면 스코프 검증 실패까지 기본값 렌더로 조용히 떨어짐
   */
  private async resolveAiModels(scope: OwnerVersionScope): Promise<AiModelSelection> {
    try {
      return await this.channelSettings.getAiModels(scope);
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      // 설정을 읽지 못하면 기본(slideshow/edge-tts)으로 렌더해 생성이 막히지 않게
      return EMPTY_AI_MODELS;
    }
  }

  /**
   * 외부 씬 비주얼 모델 라우팅. 조직이 그 provider 키를 등록했을 때만 실제 외부 모델로 렌더(서버 권위)
   * 키 미등록이면 spec 을 그대로 둬 기본 씬 비주얼로 폴백(프런트 게이팅의 서버측 강제)
   * 단 씬 이미지를 만들지 않는 버전은 그 폴백이 구조적으로 불가능해 402 로 여기서 멈춤
   */
  private async applySceneVisualCredential(
    spec: VideoRenderSpec,
    organizationId: number,
    videoModel: string,
    version: ToolVersion,
  ): Promise<void> {
    const provider = credentialProviderForModel(videoModel);
    if (!provider) return; // 내부(키 불필요) 모델은 크레덴셜과 무관
    const creds = await this.credentials.resolveCredentials(organizationId, provider);
    const apiKey = joinVendorKey(provider, creds);
    if (!apiKey) {
      if (!pipelineFor(version).usesSceneImages) {
        this.logger.warn(
          `조직 ${organizationId} 에 ${provider} 키 미등록: ${version} 은 기본 씬 비주얼로 떨어질 수` +
            ` 없어(씬 이미지 없음) ${videoModel} 렌더를 시작하지 않습니다.`,
        );
        throw new HttpException(
          `${provider} API 키가 등록되지 않아 영상을 만들 수 없습니다.` +
            ' 조직 설정의 API 키 등록을 확인하세요.',
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
      this.logger.log(
        `조직 ${organizationId} 에 ${provider} 키 미등록: ${videoModel} 대신 기본 씬 비주얼로 폴백합니다.`,
      );
      return;
    }
    spec.videoProvider = videoProviderForModel(videoModel);
    spec.videoModelPath = videoModelPathForModel(videoModel);
    spec.sceneVisualApiKey = apiKey; // 평문(메모리). 어댑터가 암호문으로 변환해 전송
    // 키에 딸린 한도(선택 필드). 저장 시 양수만 통과하지만 옛 행에 무엇이 남았든 여기서 다시 거른다.
    const submitsPerMinute = Number(creds?.submitsPerMinute);
    if (submitsPerMinute > 0) spec.sceneVisualSubmitsPerMinute = submitsPerMinute;
  }

  /**
   * 나레이션 provider 의 조직 키와 음성을 스펙에 부착
   *
   * 등록이 불완전하면 멈춘다. 진행하면 라우터가 기본 무료 TTS 로 대체해 다른 목소리 영상이 나옴
   * 라우터가 아니라 여기서 멈추는 이유는 돈(벤더 호출 전이라 되돌릴 요금이 없음)
   * 402 로 던지는 이유: 클라이언트가 MODEL_SETUP_REQUIRED 로 읽어 설정을 고치라고 알림
   * 음성은 조직 자격증명이 진실원이고, 벤더 계정에 실제로 있는지는 합성 시점에 판정됨
   */
  private async applyTtsCredential(
    spec: VideoRenderSpec,
    organizationId: number,
    ttsModel: string,
  ): Promise<void> {
    const provider = CREDENTIAL_PROVIDER_BY_TTS_MODEL[ttsModel];
    if (!provider) return; // edge-tts 등 키가 필요 없는 provider
    const creds = await this.credentials.resolveCredentials(organizationId, provider);
    const apiKey = creds?.apiKey?.trim();
    const voiceId = creds?.voiceId?.trim();
    if (!apiKey || !voiceId) {
      const missing = !apiKey ? 'API 키' : '음성 ID';
      this.logger.warn(
        `조직 ${organizationId} 의 ${provider} 등록이 불완전(키=${!!apiKey} 음성=${!!voiceId}):` +
          ` ${ttsModel} 렌더를 시작하지 않습니다.`,
      );
      throw new HttpException(
        `${provider} ${missing}가 등록되지 않아 나레이션을 만들 수 없습니다.` +
          ' 조직 설정의 API 키 등록을 확인하세요.',
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    spec.tts.voice = voiceId;
    spec.ttsApiKey = apiKey;
  }
}

/**
 * 자격증명 맵을 벤더 인증에 쓸 단일 문자열로 변환
 * 대부분 apiKey 하나지만 Higgsfield 는 `{id}:{secret}` 으로 합쳐야 헤더가 됨
 * 합치는 규칙이 벤더 계약이라 여기 두고, 어댑터는 완성된 자격 문자열만 받음
 */
function joinVendorKey(
  provider: ApiProviderKey,
  creds: Record<string, string> | null,
): string | null {
  if (!creds) return null;
  const apiKey = creds.apiKey?.trim();
  if (!apiKey) return null;
  if (provider !== 'HIGGSFIELD') return apiKey;
  const secret = creds.apiSecret?.trim();
  return secret ? `${apiKey}:${secret}` : null;
}

/**
 * 저장 기획안을 영상 프로젝트 씬으로 변환
 * 씬 순서(index)로 정렬 후 1..N 로 재부여해 렌더 순서를 확정
 */
function buildProjectScenes(plan: SavedPlanEntity, usesSceneImages: boolean): VideoProjectScene[] {
  const imageByIndex = new Map(plan.sceneImages.map((img) => [img.index, img.uploadId]));
  // 이미지를 쓰는 버전에서만 이미지 없는 씬을 제거. 텍스트→영상에 같은 필터를 걸면 씬이 전부 사라짐
  const usable = usesSceneImages
    ? plan.scenes.filter((s) => imageByIndex.has(s.index))
    : plan.scenes;
  return usable
    .sort((a, b) => a.index - b.index)
    .map((s, i) => ({
      order: i + 1,
      // 텍스트→영상은 씬 이미지가 없고 빈 문자열이 그 사실. 사전검증과 워커 fetch 가 둘 다 건너뜀
      imageUploadId: imageByIndex.get(s.index) ?? '',
      narration: s.narration,
      // 자막은 이미지→영상 버전의 것. 빈 문자열이면 렌더가 자막 트랙을 만들지 않음
      subtitle: { text: s.subtitle ?? '' },
      // 화면 묘사: 장면 구성이 있으면 그것, 없으면 씬 이미지 프롬프트로 폴백(옛 저장본 대비)
      ...(s.sceneComposition || s.imagePrompt
        ? { visualPrompt: s.sceneComposition || s.imagePrompt }
        : {}),
      // 대화내용: 누가 말하는지는 소리를 누가 만드는가가 정하고 여기서는 문장만 나름
      ...(s.dialogue ? { dialogue: s.dialogue } : {}),
      // 효과음 목록은 이미지 필터와 재정렬에도 씬 단위로 동반
      ...(s.sfx && s.sfx.length > 0 ? { sfx: s.sfx } : {}),
    }));
}

/**
 * 조합 스펙 조립: 씬 비주얼 provider + TTS 설정 + 전체 BGM + 씬별 효과음을 렌더 잡 params 로 변환
 * bgm 은 호출자가 필수로 전달하고 효과음은 씬 스냅샷의 uploadId 와 offsetSec
 */
function buildRenderSpec(
  organizationId: number,
  scenes: VideoProjectScene[],
  aiModels: AiModelSelection,
  aspectRatio: string,
  resolution: string,
  bgm: VideoProjectEntity['bgm'],
): VideoRenderSpec {
  // 음성과 피치 기본값은 edge-tts 의 것. 제공자를 가리지 않고 채우면 ElevenLabs 경로에 그 값이 박힘
  // ElevenLabs 음성은 개인 설정이 아니라 조직 자격증명에 있어 어댑터가 키와 함께 resolve
  const ttsProvider = aiModels.tts || DEFAULT_TTS_PROVIDER;
  const ttsDefaults = ttsProvider === DEFAULT_TTS_PROVIDER;
  return {
    organizationId,
    aspectRatio,
    resolution,
    // 키가 붙기 전 기본값. 조직 키가 확인되면 applySceneVisualCredential 이 실제 provider 로 올림
    videoProvider: VIDEO_PROVIDER_BY_MODEL[aiModels.video] ?? DEFAULT_VIDEO_PROVIDER,
    tts: {
      provider: ttsProvider,
      voice: aiModels.ttsVoice || (ttsDefaults ? DEFAULT_TTS_VOICE : ''),
      pitch: aiModels.ttsPitch || (ttsDefaults ? DEFAULT_TTS_PITCH : ''),
    },
    bgm: bgm ? { fileId: bgm.uploadId } : null,
    scenes: scenes.map((s) => ({
      order: s.order,
      imageUploadId: s.imageUploadId,
      narration: s.narration,
      subtitle: s.subtitle.text,
      ...(s.visualPrompt ? { visualPrompt: s.visualPrompt } : {}),
      ...(s.dialogue ? { dialogue: s.dialogue } : {}),
      ...(s.durationSec != null ? { durationSec: s.durationSec } : {}),
      ...(s.sfx && s.sfx.length > 0
        ? { sfx: s.sfx.map((x) => ({ fileId: x.uploadId, offsetSec: x.offsetSec })) }
        : {}),
    })),
  };
}

/** 렌더 스펙이 참조하는 모든 file-upload uploadId 수집(사전검증 대상) */
function collectSpecAssetIds(spec: VideoRenderSpec): string[] {
  const ids: string[] = [];
  if (spec.bgm) ids.push(spec.bgm.fileId);
  for (const scene of spec.scenes) {
    // 씬 이미지가 없는 버전은 빈 문자열. 목록에 넣으면 없는 자산을 찾다가 잡이 시작도 못 함
    if (scene.imageUploadId) ids.push(scene.imageUploadId);
    for (const sfx of scene.sfx ?? []) ids.push(sfx.fileId);
  }
  return ids;
}
