/**
 * 사가 payload/context 에 담아도 되는 값인지 검사한다.
 *
 * 주석으로만 있던 두 규칙을 코드로 옮긴 것이다. 둘 다 어겨도 테스트는 통과하고, 사고는 나중에
 * 다른 곳에서 드러난다. 새 사가를 짤 사람이 규칙을 읽지 않았을 때 잡아주는 것이 이 함수의 목적이다.
 *
 * 1. 자격증명을 담지 않는다. 이 값은 jsonb 로 영구 저장된다. 렌더 스펙에는 조직 API 키가 들어
 *    있어서, 편의로 스펙을 컨텍스트에 넣으면 그 키가 DB 에 남는다(로그와 백업에도 따라간다)
 *    필요한 값은 저장하지 말고 실행 시점에 다시 조립한다.
 * 2. JSON 왕복이 안전한 값만 담는다. 재개는 저장된 jsonb 를 되살려 시작하므로, Date 를 담으면
 *    재개 후에는 문자열이 되어 `.getTime()` 이 터진다. 그것도 재개 경로에서만 터지므로 평소
 *    테스트로는 드러나지 않는다.
 */

/** 키 이름이 이것으로 끝나면 비밀값으로 본다. `apiKeyId`, `tokenCount` 처럼 식별자/개수는 통과한다. */
const SECRET_KEY_SUFFIX = /(apikey|secret|password|credential|token)$/i;

/** payload/context 로 저장할 수 없는 값이다. 사가 작성 실수이므로 메시지가 자리를 가리킨다. */
export class SagaContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SagaContextError';
  }
}

/**
 * 저장 직전 검사. 위반이면 던진다(그 단계가 실패하고 보상이 돈다)
 *
 * 던지는 쪽을 택한 이유: 조용히 지우면 다음 단계가 없는 값을 전제로 돌아 더 이상한 곳에서 깨진다.
 * 위반은 배포 전에 드러나는 종류다(키 이름은 사가마다 고정이라 한 번 통과하면 계속 통과한다)
 */
export function assertStorableSagaData(
  data: Record<string, unknown>,
  what: 'payload' | 'context',
): void {
  for (const [key, value] of Object.entries(data)) {
    if (SECRET_KEY_SUFFIX.test(key)) {
      throw new SagaContextError(
        `사가 ${what} 에 자격증명으로 보이는 키가 있습니다: ${key}. ` +
          '이 값은 jsonb 로 영구 저장되므로 담지 않고 실행 시점에 다시 조립하세요.',
      );
    }
    assertJsonSafe(value, `${what}.${key}`);
  }
}

/**
 * JSON 왕복에서 데이터를 잃는 값만 막는다.
 *
 * 기준이 "평범한 객체(prototype 이 Object)" 가 아닌 이유: 그러면 DTO 인스턴스가 걸린다. HTTP 어댑터가
 * 넘기는 값은 대개 검증 파이프가 만든 클래스 인스턴스이고, 그것은 왕복해도 필드가 그대로다(잃는 것은
 * 프로토타입이고 그건 데이터가 아니다). 실제로 이 규칙이 과해서 기획안 저장이 500 으로 막혔다.
 *
 * 그래서 형태 태그로 가른다. `[object Object]` 는 평범한 객체와 클래스 인스턴스를 함께 통과시키고,
 * Date/Map/Set/RegExp 처럼 자기만의 표현을 가진 것은 각자의 태그로 걸린다. 그것들이 진짜 사고다.
 * (Date 는 재개 뒤 문자열이 되어 `.getTime()` 이 그 경로에서만 터진다)
 */
function assertJsonSafe(value: unknown, path: string): void {
  if (value === null) return;
  // undefined 는 통과시킨다: JSON 에서 키가 사라지지만 읽으면 여전히 undefined 다(잃는 것이 없다)
  if (value === undefined) return;
  const type = typeof value;
  if (type === 'boolean' || type === 'string') return;
  if (type === 'number') {
    // NaN/Infinity 는 JSON 에서 null 이 된다: 되살리면 값이 바뀐다.
    if (!Number.isFinite(value)) {
      throw new SagaContextError(`사가 데이터에 JSON 으로 보존되지 않는 수가 있습니다: ${path}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertJsonSafe(item, `${path}[${i}]`));
    return;
  }
  if (type === 'object') {
    const tag = Object.prototype.toString.call(value);
    if (tag !== '[object Object]') {
      throw new SagaContextError(
        `사가 데이터에 JSON 왕복이 안전하지 않은 값이 있습니다: ${path} ` +
          `(${tag.slice(8, -1)}). 재개는 저장된 jsonb 를 되살려 시작하므로, 되살렸을 때 같은 값이 ` +
          '되는 것만 담아야 한다(스칼라, 배열, 객체).',
      );
    }
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_SUFFIX.test(k)) {
        throw new SagaContextError(
          `사가 데이터에 자격증명으로 보이는 키가 있습니다: ${path}.${k}. ` +
            '이 값은 jsonb 로 영구 저장되므로 담지 않고 실행 시점에 다시 조립하세요.',
        );
      }
      assertJsonSafe(v, `${path}.${k}`);
    }
    return;
  }
  throw new SagaContextError(
    `사가 데이터에 저장할 수 없는 값이 있습니다: ${path} (${type}).`,
  );
}
