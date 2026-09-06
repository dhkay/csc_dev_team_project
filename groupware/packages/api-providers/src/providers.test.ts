// 프로바이더 카탈로그 계약. 여기가 깨지면 등록 화면이 보여주는 프로바이더와 서버가 받아들이는
// provider 가 갈리고, 그 어긋남은 "저장은 되는데 아무 모델도 못 쓰는 키" 로만 드러난다.
import { describe, it, expect } from 'vitest';
import {
  API_PROVIDER_CATALOG,
  API_PROVIDER_KEYS,
  API_PROVIDER_KIND_META,
  API_PROVIDER_KINDS,
  apiProvidersByKind,
  findApiProvider,
  hasRequiredCredentials,
  isApiProviderKey,
  requiredCredentialFields,
} from './providers';

describe('카탈로그 무결성', () => {
  it('key 목록과 카탈로그가 정확히 같은 집합이다', () => {
    // 한쪽에만 있으면 화면에 안 뜨거나(카탈로그 누락) 저장이 거부된다(key 목록 누락)
    expect([...API_PROVIDER_CATALOG].map((m) => m.key).sort()).toEqual([...API_PROVIDER_KEYS].sort());
  });

  it('key 가 중복되지 않는다', () => {
    const keys = API_PROVIDER_CATALOG.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('모든 프로바이더가 자격증명 필드를 최소 하나 갖는다', () => {
    // 필드가 없으면 빈 저장이 등록 완료로 통과한다.
    for (const meta of API_PROVIDER_CATALOG) {
      expect(meta.credentialFields.length).toBeGreaterThan(0);
    }
  });

  it('한 프로바이더 안에서 필드 key 가 중복되지 않는다', () => {
    for (const meta of API_PROVIDER_CATALOG) {
      const keys = meta.credentialFields.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('모든 구분에 표시 메타가 있다', () => {
    for (const kind of API_PROVIDER_KINDS) {
      expect(API_PROVIDER_KIND_META[kind].label).not.toBe('');
    }
  });

  it('모든 프로바이더가 알려진 구분에 속한다(어느 섹션에도 안 뜨는 행이 없다)', () => {
    const grouped = API_PROVIDER_KINDS.flatMap((kind) => apiProvidersByKind(kind));
    expect(grouped.length).toBe(API_PROVIDER_CATALOG.length);
  });
});

describe('비시크릿 필드는 명시적으로만 늘어난다', () => {
  /**
   * 값이 서버 밖으로 나가도 되는 필드 전부(`provider.fieldKey`)
   *
   * 이 목록에 없으면 시크릿이다. 플래그 하나(`secret: false`)로 값이 뷰 응답에 실리는데,
   * 새 프로바이더를 넣으며 그 플래그를 잘못 주면 API 키가 브라우저까지 나간다. 검토에서 놓치기
   * 쉬운 종류의 실수라(한 단어다) 늘리는 행위 자체를 여기 적게 만든다. 이름 규칙으로 거르지 않는
   * 이유는 그것이 판단을 흉내 낼 뿐이기 때문이다. 비밀 여부는 벤더가 정하지 필드명이 정하지 않는다.
   */
  const PUBLIC_FIELDS = [
    'ELEVENLABS.voiceId',
    // 분당 제출 상한은 비밀이 아니고, 등록한 값을 다시 보여야 고칠 수 있다.
    'GEMINI.submitsPerMinute',
    'XAI.submitsPerMinute',
    'HIGGSFIELD.submitsPerMinute',
  ];

  it('허용 목록에 적힌 필드만 비시크릿이다', () => {
    const actual = API_PROVIDER_CATALOG.flatMap((meta) =>
      meta.credentialFields.filter((f) => f.secret === false).map((f) => `${meta.key}.${f.key}`),
    );
    expect(actual.sort()).toEqual([...PUBLIC_FIELDS].sort());
  });

  it('허용 목록의 필드가 실제로 카탈로그에 있다', () => {
    // 필드를 지우고 목록만 남으면 이 검사가 헐거워진다(무엇이든 비시크릿으로 통과시키지는 않지만,
    // 다음 사람이 목록을 근거로 "이미 허용된 값" 이라고 오해한다)
    for (const entry of PUBLIC_FIELDS) {
      const [provider, field] = entry.split('.');
      const meta = findApiProvider(provider);
      expect(meta?.credentialFields.find((f) => f.key === field)?.secret, entry).toBe(false);
    }
  });
});

describe('선택 필드', () => {
  it('선택 필드는 등록 완료 판정에 들지 않는다', () => {
    // 한도를 적지 않은 조직도 키만 있으면 그 벤더를 쓸 수 있어야 한다.
    const gemini = findApiProvider('GEMINI')!;
    expect(hasRequiredCredentials(gemini, ['apiKey'])).toBe(true);
    expect(requiredCredentialFields(gemini).map((f) => f.key)).toEqual(['apiKey']);
  });

  it('숫자 필드는 전부 선택이고 비시크릿이다', () => {
    // 숫자 필드는 지금 한도 하나뿐이고, 그 성격(비밀 아님, 없어도 됨)이 필드 종류에 붙어 다닌다.
    for (const meta of API_PROVIDER_CATALOG) {
      for (const f of meta.credentialFields.filter((f) => f.kind === 'number')) {
        expect(f.optional, `${meta.key}.${f.key}`).toBe(true);
        expect(f.secret, `${meta.key}.${f.key}`).toBe(false);
      }
    }
  });
});

describe('findApiProvider / isApiProviderKey', () => {
  it('카탈로그에 있는 key 를 찾는다', () => {
    // 표시명을 단정하지 않는다. 라벨은 언제든 다시 쓸 수 있는 문구이고, 여기서 지켜야 하는 것은
    // "그 key 로 카탈로그 행을 찾을 수 있는가" 다
    expect(findApiProvider('ANTHROPIC')?.key).toBe('ANTHROPIC');
    expect(isApiProviderKey('HIGGSFIELD')).toBe(true);
  });

  it('모르는 key 는 거부한다', () => {
    expect(findApiProvider('ANTHROPICC')).toBeUndefined();
    expect(isApiProviderKey('ANTHROPICC')).toBe(false);
    expect(isApiProviderKey('')).toBe(false);
  });
});

describe('hasRequiredCredentials', () => {
  const vendor = findApiProvider('ANTHROPIC')!;
  const platform = findApiProvider('HIGGSFIELD')!;

  it('필수 필드가 모두 설정돼야 등록 완료다', () => {
    expect(hasRequiredCredentials(vendor, ['apiKey'])).toBe(true);
    expect(hasRequiredCredentials(vendor, [])).toBe(false);
  });

  it('필드가 둘인 플랫폼은 한쪽만 채워지면 등록 완료가 아니다', () => {
    expect(hasRequiredCredentials(platform, ['apiKey'])).toBe(false);
    expect(hasRequiredCredentials(platform, ['apiKey', 'apiSecret'])).toBe(true);
  });

  it('선언되지 않은 필드가 더 있어도 판정에 영향을 주지 않는다', () => {
    // 구 프로바이더 시절 저장된 필드가 남아 있어도 지금 필요한 것만 보고 판정한다.
    expect(hasRequiredCredentials(vendor, ['apiKey', 'legacyToken'])).toBe(true);
  });
});
