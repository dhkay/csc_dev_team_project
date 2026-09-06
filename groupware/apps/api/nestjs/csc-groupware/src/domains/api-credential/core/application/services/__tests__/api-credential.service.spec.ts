import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ApiCredentialService } from '..';
import {
  ApiCredentialRecord,
  ApiCredentialRepositoryPort,
  ApiKeyValidatorPort,
  API_CREDENTIAL_REPOSITORY_PORT,
  API_KEY_VALIDATOR_PORT,
  SecretCipherPort,
  SECRET_CIPHER_PORT,
} from '../../ports/outbound';
import {
  createApiCredentialRepositoryMock,
  createApiKeyValidatorMock,
  createSecretCipherMock,
} from '../../../../__mocks__';

describe('ApiCredentialService', () => {
  let service: ApiCredentialService;
  let repository: jest.Mocked<ApiCredentialRepositoryPort>;
  let cipher: jest.Mocked<SecretCipherPort>;
  let validator: jest.Mocked<ApiKeyValidatorPort>;

  const ORG = 1;

  /** 저장 레코드 팩토리. cipher Mock 이 통과라 credentialsCipher 에 평문 JSON 을 넣는다. */
  const makeRecord = (
    provider: string,
    credentials: Record<string, string>,
  ): ApiCredentialRecord => ({
    provider,
    enabled: true,
    credentialsCipher: JSON.stringify(credentials),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  });

  beforeEach(async () => {
    repository = createApiCredentialRepositoryMock();
    cipher = createSecretCipherMock();
    validator = createApiKeyValidatorMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiCredentialService,
        { provide: API_CREDENTIAL_REPOSITORY_PORT, useValue: repository },
        { provide: SECRET_CIPHER_PORT, useValue: cipher },
        { provide: API_KEY_VALIDATOR_PORT, useValue: validator },
      ],
    }).compile();

    service = module.get(ApiCredentialService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('saveCredential', () => {
    it('카탈로그에 있는 프로바이더는 검증 후 암호화 저장한다', async () => {
      repository.upsertRecord.mockResolvedValueOnce(makeRecord('ANTHROPIC', { apiKey: 'sk-ant-x' }));

      const view = await service.saveCredential(ORG, 'ANTHROPIC', { apiKey: '  sk-ant-x  ' });

      // 앞뒤 공백은 저장 전에 잘린다(붙여넣기로 딸려 온 공백이 키를 무효로 만들지 않게)
      expect(validator.validate).toHaveBeenCalledWith('ANTHROPIC', { apiKey: 'sk-ant-x' });
      expect(cipher.encrypt).toHaveBeenCalledWith(JSON.stringify({ apiKey: 'sk-ant-x' }));
      expect(view.configuredFields).toEqual(['apiKey']);
    });

    it('카탈로그에 없는 필드는 버린다(아무도 읽지 않는 값이 암호문에 남지 않게)', async () => {
      repository.upsertRecord.mockResolvedValueOnce(makeRecord('OPENAI', { apiKey: 'sk-x' }));

      await service.saveCredential(ORG, 'OPENAI', { apiKey: 'sk-x', junk: 'ignored' });

      expect(cipher.encrypt).toHaveBeenCalledWith(JSON.stringify({ apiKey: 'sk-x' }));
    });

    it('카탈로그에 없는 프로바이더는 거부한다(오타 난 키가 저장되지 않게)', async () => {
      await expect(
        service.saveCredential(ORG, 'ANTHROPICC', { apiKey: 'sk-ant-x' }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(validator.validate).not.toHaveBeenCalled();
      expect(repository.upsertRecord).not.toHaveBeenCalled();
    });

    it('필수 필드가 비면 거부하고 누락 항목을 알린다', async () => {
      // 플랫폼 키는 필드가 둘이다. 한쪽만 보내면 저장되면 안 된다(프론트를 우회한 요청)
      await expect(
        service.saveCredential(ORG, 'HIGGSFIELD', { apiKey: 'key-only' }),
      ).rejects.toThrow('API 시크릿');

      expect(repository.upsertRecord).not.toHaveBeenCalled();
    });

    it('필수 필드가 다 차면 저장한다', async () => {
      repository.upsertRecord.mockResolvedValueOnce(
        makeRecord('HIGGSFIELD', { apiKey: 'k', apiSecret: 's' }),
      );

      const view = await service.saveCredential(ORG, 'HIGGSFIELD', { apiKey: 'k', apiSecret: 's' });

      expect(view.configuredFields).toEqual(['apiKey', 'apiSecret']);
    });

    it('선택 필드(분당 한도)는 비워도 저장된다', async () => {
      // 한도를 모르는 조직도 키만으로 그 벤더를 써야 한다. 빈 값은 미입력으로 버린다.
      repository.upsertRecord.mockResolvedValueOnce(makeRecord('GEMINI', { apiKey: 'g' }));

      await service.saveCredential(ORG, 'GEMINI', { apiKey: 'g', submitsPerMinute: '' });

      expect(cipher.encrypt).toHaveBeenCalledWith(JSON.stringify({ apiKey: 'g' }));
    });

    it('숫자 필드는 양수만 받는다', async () => {
      repository.upsertRecord.mockResolvedValueOnce(
        makeRecord('GEMINI', { apiKey: 'g', submitsPerMinute: '6' }),
      );

      await service.saveCredential(ORG, 'GEMINI', { apiKey: 'g', submitsPerMinute: ' 6 ' });
      expect(cipher.encrypt).toHaveBeenCalledWith(
        JSON.stringify({ apiKey: 'g', submitsPerMinute: '6' }),
      );

      // 0 이나 문자가 저장되면 워커가 그 값을 읽어 간격을 접거나 무시하는데 등록한 사람은 먹은 줄 안다
      await expect(
        service.saveCredential(ORG, 'GEMINI', { apiKey: 'g', submitsPerMinute: '0' }),
      ).rejects.toThrow('분당 영상 생성 요청 상한');
      await expect(
        service.saveCredential(ORG, 'GEMINI', { apiKey: 'g', submitsPerMinute: 'abc' }),
      ).rejects.toThrow('분당 영상 생성 요청 상한');
    });

    it('실검증에 실패하면 그 사유로 거부한다', async () => {
      validator.validate.mockResolvedValueOnce({ valid: false, message: '유효하지 않은 키' });

      await expect(service.saveCredential(ORG, 'OPENAI', { apiKey: 'sk-bad' })).rejects.toThrow(
        '유효하지 않은 키',
      );
      expect(repository.upsertRecord).not.toHaveBeenCalled();
    });
  });

  describe('비시크릿 필드', () => {
    // 벤더가 요구하는 값 중에는 비밀이 아닌 것도 있다(ElevenLabs 음성 id). 그런 값은 저장 뒤
    // 무엇이 등록됐는지 보여야 하고, 다른 필드만 바꿔 저장할 때 유지돼야 한다. 시크릿과 같은
    // 취급을 하면 키를 교체할 때마다 비밀도 아닌 값을 함께 다시 입력하게 된다.
    it('비밀이 아닌 필드의 값만 뷰에 실린다', async () => {
      repository.upsertRecord.mockResolvedValueOnce(
        makeRecord('ELEVENLABS', { apiKey: 'sk_x', voiceId: 'voice-1' }),
      );

      const view = await service.saveCredential(ORG, 'ELEVENLABS', {
        apiKey: 'sk_x',
        voiceId: 'voice-1',
      });

      expect(view.publicValues).toEqual({ voiceId: 'voice-1' });
      // 키는 저장됐다고만 알린다. 값은 어떤 경로로도 서버 밖으로 나가지 않는다.
      expect(view.configuredFields).toEqual(['apiKey', 'voiceId']);
      expect(JSON.stringify(view)).not.toContain('sk_x');
    });

    it('음성 id 가 없으면 등록으로 보지 않는다', async () => {
      // 음성은 요청 경로로 들어가(POST /v1/text-to-speech/{voice_id}) 없으면 한 번도 호출할 수
      // 없다. 그래서 "키는 있는데 음성이 없다" 는 사용 가능한 상태가 아니다.
      await expect(
        service.saveCredential(ORG, 'ELEVENLABS', { apiKey: 'sk_x' }),
      ).rejects.toThrow('나레이션 음성 ID');

      repository.findManyRecordsByOrg.mockResolvedValueOnce([
        makeRecord('ELEVENLABS', { apiKey: 'sk_x' }),
      ]);
      expect(await service.listConfiguredProviders(ORG)).toEqual([]);
    });

    it('카탈로그에 없는 프로바이더의 값은 내보내지 않는다', async () => {
      // 내려간 프로바이더의 잔여 행은 어느 필드가 비밀인지 아무도 선언하지 않은 상태다.
      // 판단할 근거가 없으면 내보내지 않는 쪽이 맞다.
      repository.findManyRecordsByOrg.mockResolvedValueOnce([
        makeRecord('RETIRED_VENDOR', { apiKey: 'x', voiceId: 'v' }),
      ]);

      const [view] = await service.listViewsForOrg(ORG);
      expect(view.publicValues).toEqual({});
    });
  });

  describe('listConfiguredProviders', () => {
    it('필수 필드가 다 찬 프로바이더만 사용 가능으로 본다', async () => {
      repository.findManyRecordsByOrg.mockResolvedValueOnce([
        makeRecord('ANTHROPIC', { apiKey: 'sk-ant-x' }),
        // 플랫폼 키가 한쪽만 채워진 상태: 호출은 실패하므로 사용 가능이라고 하면 안 된다.
        makeRecord('HIGGSFIELD', { apiKey: 'k' }),
      ]);

      expect(await service.listConfiguredProviders(ORG)).toEqual(['ANTHROPIC']);
    });

    it('카탈로그에서 내린 프로바이더의 잔여 행은 제외한다', async () => {
      repository.findManyRecordsByOrg.mockResolvedValueOnce([
        makeRecord('RETIRED_VENDOR', { apiKey: 'x' }),
      ]);

      expect(await service.listConfiguredProviders(ORG)).toEqual([]);
    });
  });
});
