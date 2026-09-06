import { HttpStatus } from '@nestjs/common';
import { VideoProjectSpecBuilder } from '../video-project-spec-builder';
import type { VideoProjectEntity } from '../../../domain';

/**
 * 나레이션 자격증명 검사. 등록이 불완전하면 멈추고 진행하지 않음
 * 진행하면 라우터가 기본 무료 TTS 로 대체해 브랜드와 다른 소리가 붙은 영상이 조용히 만들어짐
 * 워커가 아니라 여기서 멈추는 이유는 돈(벤더 호출 전이라 되돌릴 요금이 없음)
 */
const PROJECT = {
  id: 1,
  organizationId: 12,
  ownerUserId: 12,
  version: 'v1.0',
  channelId: 5,
  savedPlanId: 11,
  title: '테스트',
  aspectRatio: '9:16',
  resolution: '720p',
  videoModel: '',
  videoMode: '',
  segmentMode: 'sequential',
  ttsModel: 'eleven_multilingual_v2',
  ttsVoice: '',
  ttsPitch: '',
  scenes: [{ order: 1, imageUploadId: '', narration: '안녕', subtitle: {} }],
  background: null,
  bgm: null,
  clientRequestId: null,
  renderJobId: null,
  renderStatus: 'PENDING',
} as unknown as VideoProjectEntity;

function build(creds: { apiKey?: string; voiceId?: string } | null) {
  return new VideoProjectSpecBuilder(
    { getAiModels: async () => ({ llm: '', video: '', videoMode: '', tts: '', ttsVoice: '', ttsPitch: '', image: '' }) } as never,
    { resolveCredentials: async () => creds } as never,
  );
}

describe('VideoProjectSpecBuilder: 나레이션 자격증명', () => {
  it('음성 ID 가 없으면 렌더를 시작하지 않고 설정을 고치라고 알린다', async () => {
    // 402 여야 사유 문구가 화면까지 그대로 감. 400 은 문구가 덮이고 500 은 재시도로 읽힘
    const builder = build({ apiKey: 'k', voiceId: '' });
    await expect(builder.buildSpecFromRow(PROJECT)).rejects.toMatchObject({
      status: HttpStatus.PAYMENT_REQUIRED,
    });
    await expect(builder.buildSpecFromRow(PROJECT)).rejects.toThrow(/음성 ID/);
  });

  it('API 키가 없어도 같은 방식으로 멈춘다', async () => {
    const builder = build({ apiKey: '', voiceId: 'v1' });
    await expect(builder.buildSpecFromRow(PROJECT)).rejects.toThrow(/API 키/);
  });

  it('등록이 완전하면 그 키와 음성을 스펙에 싣는다', async () => {
    const spec = await build({ apiKey: 'k1', voiceId: 'v1' }).buildSpecFromRow(PROJECT);
    expect(spec.tts.voice).toBe('v1');
    expect(spec.ttsApiKey).toBe('k1');
  });

  it('소리를 합성하지 않는 버전은 검사하지 않는다', async () => {
    // 쓰지 않는 자격증명 때문에 렌더가 막히면 안 됨
    // 영상 모델을 채우는 이유: 비면 기본 씬 비주얼 검사가 먼저 멈춰 나레이션 검사를 볼 수 없음
    const spec = await build({ apiKey: '', voiceId: '' }).buildSpecFromRow({
      ...PROJECT,
      version: 'v1.5',
      videoModel: 'wan2.2-ti2v-5b',
    } as VideoProjectEntity);
    expect(spec.synthesizeSpeech).toBe(false);
    expect(spec.ttsApiKey).toBeFalsy();
  });

  it('키가 필요 없는 나레이션 모델은 검사하지 않는다', async () => {
    // edge-tts 는 조직 키도 음성 id 도 요구하지 않아 막으면 v1.0 기본 경로가 통째로 멈춤
    const spec = await build(null).buildSpecFromRow({
      ...PROJECT,
      ttsModel: 'edge-tts',
    } as VideoProjectEntity);
    expect(spec).toBeDefined();
    expect(spec.ttsApiKey).toBeFalsy();
  });
});

/**
 * 씬 비주얼 자격증명 검사. 키가 없으면 기본 씬 비주얼로 폴백하는 것이 오래된 규칙
 * 씬 이미지를 만들지 않는 버전은 그 폴백이 성립하지 않아 워커까지 가서 내부 문구로 죽음
 */
describe('VideoProjectSpecBuilder: 씬 비주얼 자격증명', () => {
  const V15 = {
    ...PROJECT,
    version: 'v1.5',
    videoModel: 'higgsfield/veo3.1/text-to-video',
  } as VideoProjectEntity;

  it('폴백이 불가능한 버전은 키가 없으면 렌더를 시작하지 않는다', async () => {
    const builder = build(null);
    await expect(builder.buildSpecFromRow(V15)).rejects.toMatchObject({
      status: HttpStatus.PAYMENT_REQUIRED,
    });
    await expect(builder.buildSpecFromRow(V15)).rejects.toThrow(/API 키/);
  });

  it('키가 반쪽이어도 같은 방식으로 멈춘다', async () => {
    // Higgsfield 는 두 값을 합쳐야 헤더가 되어 한쪽만 있으면 등록된 것처럼 보이면서 호출이 실패
    await expect(
      build({ apiKey: 'id-only' } as never).buildSpecFromRow(V15),
    ).rejects.toThrow(/API 키/);
  });

  it('키가 있으면 그 벤더 provider 와 모델 경로를 스펙에 싣는다', async () => {
    const spec = await build({ apiKey: 'id', apiSecret: 'sec' } as never).buildSpecFromRow(V15);
    expect(spec.videoProvider).toBe('higgsfield');
    expect(spec.videoModelPath).toBe('veo3.1/text-to-video');
    expect(spec.sceneVisualApiKey).toBe('id:sec');
  });

  it('폴백이 가능한 버전은 키가 없어도 기본 씬 비주얼로 계속한다', async () => {
    // v1.0 은 씬 이미지가 있어 슬라이드쇼가 성립. 막으면 키 미등록 조직의 기존 경로가 멈춤
    const spec = await build(null).buildSpecFromRow({
      ...PROJECT,
      videoModel: 'grok-imagine-video',
      ttsModel: 'edge-tts',
    } as VideoProjectEntity);
    expect(spec.videoProvider).toBe('slideshow');
    expect(spec.sceneVisualApiKey).toBeFalsy();
  });

  it('키가 필요 없는 영상 모델은 검사하지 않는다', async () => {
    const spec = await build(null).buildSpecFromRow({
      ...PROJECT,
      videoModel: 'wan2.2-ti2v-5b',
      ttsModel: 'edge-tts',
    } as VideoProjectEntity);
    expect(spec.videoProvider).toBe('wan2.2-ti2v-5b');
  });
});

/**
 * 경유 라우트: 플랫폼 경유와 운영사 직접이 같은 규칙으로 갈림
 * 카탈로그 key 의 첫 조각이 곧 렌더 provider 이고 요구하는 조직 키를 정함
 * 라우트가 없는 구 key 를 함께 단정하는 이유: 개명할 수 없어 조용히 깨지면 저장된 선택이 고아가 됨
 */
describe('VideoProjectSpecBuilder: 경유 라우트', () => {
  const withModel = (videoModel: string) =>
    ({ ...PROJECT, version: 'v1.5', videoModel }) as VideoProjectEntity;

  it('운영사 직접 라우트는 그 회사 키를 찾고 모델 id 를 따로 싣는다', async () => {
    const spec = await build({ apiKey: 'gem-key' } as never).buildSpecFromRow(
      withModel('gemini/veo-3.1-generate-preview'),
    );
    // provider 는 어느 어댑터인지만 정하고 그 안에서 부를 모델은 따로 감
    expect(spec.videoProvider).toBe('gemini');
    expect(spec.videoModelPath).toBe('veo-3.1-generate-preview');
    // Gemini 는 값이 하나라 그대로 실림(Higgsfield 처럼 합치지 않음)
    expect(spec.sceneVisualApiKey).toBe('gem-key');
    // 한도를 등록하지 않은 키는 그 자리를 비워 워커 기본값에 맡긴다
    expect(spec.sceneVisualSubmitsPerMinute).toBeUndefined();
  });

  it('키에 등록된 분당 한도를 숫자로 싣는다', async () => {
    // 자격증명 맵은 문자열이라 여기서 숫자가 된다. 양수가 아니면 없는 것과 같다(워커 기본값).
    const withLimit = await build({ apiKey: 'gem-key', submitsPerMinute: '6' } as never).buildSpecFromRow(
      withModel('gemini/veo-3.1-generate-preview'),
    );
    expect(withLimit.sceneVisualSubmitsPerMinute).toBe(6);

    const invalid = await build({ apiKey: 'gem-key', submitsPerMinute: 'abc' } as never).buildSpecFromRow(
      withModel('gemini/veo-3.1-generate-preview'),
    );
    expect(invalid.sceneVisualSubmitsPerMinute).toBeUndefined();
  });

  it('같은 모델이라도 라우트가 다르면 다른 키를 요구한다', async () => {
    // 갈리지 않으면 한쪽 키를 등록한 조직이 다른 경로로 렌더를 시작해 인증 실패로 끝남
    const creds = build({ apiKey: 'only-one-value' } as never);
    // 플랫폼 경유는 두 값이 필요해 반쪽 등록으로 멈춤
    await expect(creds.buildSpecFromRow(withModel('higgsfield/veo3.1/text-to-video'))).rejects.toThrow(
      /API 키/,
    );
    // 운영사 직접은 그 한 값으로 성립
    const spec = await creds.buildSpecFromRow(withModel('gemini/veo-3.1-generate-preview'));
    expect(spec.videoProvider).toBe('gemini');
  });

  it('키가 없으면 라우트와 무관하게 렌더를 시작하지 않는다', async () => {
    await expect(
      build(null).buildSpecFromRow(withModel('gemini/veo-3.1-generate-preview')),
    ).rejects.toMatchObject({ status: HttpStatus.PAYMENT_REQUIRED });
  });

  it('라우트를 사칭하는 key 는 라우트로 읽지 않는다', async () => {
    // 라우트로 읽으면 미등록 provider 로 잡이 나가고 워커가 기본 비주얼로 대체해 다른 영상이 나옴
    await expect(
      build({ apiKey: 'k', apiSecret: 's' } as never).buildSpecFromRow(withModel('openai/sora')),
    ).rejects.toMatchObject({ status: HttpStatus.PAYMENT_REQUIRED });
  });
});

/**
 * 기본 씬 비주얼로 갈 수 없는 버전의 결과 검사
 * 영상 모델이 비거나 모르는 값이면 provider 판정이 내부 모델로 빠져 슬라이드쇼가 남음
 * 그래서 원인이 아니라 결과 하나를 막음
 */
describe('VideoProjectSpecBuilder: 기본 씬 비주얼로 갈 수 없는 버전', () => {
  it('영상 모델이 비어 있으면 렌더를 시작하지 않는다', async () => {
    // 키 검사는 이 경로를 못 잡음(모델이 없으면 자격증명 provider 자체가 정해지지 않음)
    const builder = build({ apiKey: 'id', apiSecret: 'sec' } as never);
    await expect(
      builder.buildSpecFromRow({ ...PROJECT, version: 'v1.5', videoModel: '' } as VideoProjectEntity),
    ).rejects.toMatchObject({ status: HttpStatus.PAYMENT_REQUIRED });
    await expect(
      builder.buildSpecFromRow({ ...PROJECT, version: 'v1.5', videoModel: '' } as VideoProjectEntity),
    ).rejects.toThrow(/영상 모델/);
  });

  it('모르는 영상 모델도 같은 방식으로 멈춘다', async () => {
    // 카탈로그에서 사라진 모델을 가리키는 옛 기획안이 여기로 옴. 조용히 만들면 반드시 실패
    await expect(
      build(null).buildSpecFromRow({
        ...PROJECT,
        version: 'v1.5',
        videoModel: 'retired-model',
      } as VideoProjectEntity),
    ).rejects.toThrow(/영상 모델/);
  });

  it('키 없이도 도는 내부 영상 모델은 막지 않는다', async () => {
    // provider 가 자기 이름으로 올라오므로 걸릴 이유가 없고, 막으면 내부 경로가 통째로 멈춤
    const spec = await build(null).buildSpecFromRow({
      ...PROJECT,
      version: 'v1.5',
      videoModel: 'wan2.2-ti2v-5b',
    } as VideoProjectEntity);
    expect(spec.videoProvider).toBe('wan2.2-ti2v-5b');
  });

  it('폴백이 성립하는 버전은 모델이 없어도 계속한다', async () => {
    // v1.0 은 씬 이미지가 있어 슬라이드쇼가 실제로 만들어지는 기본 경로
    const spec = await build(null).buildSpecFromRow({
      ...PROJECT,
      videoModel: '',
      ttsModel: 'edge-tts',
    } as VideoProjectEntity);
    expect(spec.videoProvider).toBe('slideshow');
  });
});
