import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { TOOL_VERSIONS } from '../domain/tool-version';

/**
 * 버전 축이 새는 자리를 소스에서 차단
 * 런타임이 아니라 소스인 이유: 이 실수들은 200 을 주고 틀린 것은 어느 워크스페이스의 데이터인가뿐
 */
describe('도구 버전 축', () => {
  const SRC = resolve(__dirname, '../..');

  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name === '__tests__' || name === '__mocks__') continue;
        walk(full, out);
      } else if (full.endsWith('.ts') && !full.endsWith('.spec.ts')) {
        out.push(full);
      }
    }
    return out;
  }

  const rel = (file: string) => file.slice(SRC.length + 1).replace(/\\/g, '/');

  /** 주석을 지운 소스. 리터럴 검사가 설명문을 잡으면 규칙이 과해지고 과한 규칙은 우회를 부름 */
  const codeOnly = (file: string) =>
    readFileSync(file, 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

  // 막는 실수: 컨트롤러나 서비스가 스코프 대신 버전을 손으로 적어 늘 한 버전으로 동작하는 것
  it('버전 문자열 리터럴이 어휘 모듈과 레지스트리 배선 밖에 없다', () => {
    const pattern = new RegExp(`['"\`](${TOOL_VERSIONS.join('|').replace(/\./g, '\\.')})['"\`]`);
    const offenders = walk(SRC)
      // 어휘 모듈: 값 공간의 유일한 정의처
      .filter((f) => rel(f) !== 'shared/domain/tool-version.ts')
      // 레지스트리 배선: 리터럴이 맵의 키인 자리. VersionRegistry<T> 가 exhaustive 를 컴파일로 강제
      .filter((f) => !codeOnly(f).includes('VersionRegistry<'))
      .filter((f) => pattern.test(codeOnly(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  // 막는 실수: 새 엔드포인트에서 버전 접두사를 빠뜨려 서버가 워크스페이스를 유추하게 되는 것
  it('버전 스코프 컨트롤러 전부가 TOOL_VERSION_ROUTE 접두사를 쓴다', () => {
    // 버전 소유 산출물 + 그 버전의 파이프라인과 슬롯을 다루는 표면
    const versioned = [
      'domains/saved-plan/adapters/inbound/http/controllers/saved-plan.controller.ts',
      'domains/video-project/adapters/inbound/http/controllers/video-project.controller.ts',
      'domains/video-final/adapters/inbound/http/controllers/video-final.controller.ts',
      'domains/plan-generation/adapters/inbound/http/controllers/plan-generation.controller.ts',
      'domains/plan-generation/adapters/inbound/http/controllers/image-engine-load.controller.ts',
      'domains/channel-settings/adapters/inbound/http/controllers/user-tool-settings.controller.ts',
    ];
    for (const path of versioned) {
      const text = readFileSync(join(SRC, path), 'utf-8');
      expect({ path, hasPrefix: text.includes('${TOOL_VERSION_ROUTE}') }).toEqual({
        path,
        hasPrefix: true,
      });
    }
  });

  // 위 검사만 두면 목록에 없는 새 컨트롤러가 통과하므로 미분류 컨트롤러를 실패로 만듦
  it('모든 컨트롤러가 버전 스코프 목록과 버전 무관 목록 중 정확히 한 쪽에 있다', () => {
    const versioned = new Set([
      'domains/saved-plan/adapters/inbound/http/controllers/saved-plan.controller.ts',
      'domains/video-project/adapters/inbound/http/controllers/video-project.controller.ts',
      'domains/video-final/adapters/inbound/http/controllers/video-final.controller.ts',
      'domains/plan-generation/adapters/inbound/http/controllers/plan-generation.controller.ts',
      'domains/plan-generation/adapters/inbound/http/controllers/image-engine-load.controller.ts',
      'domains/channel-settings/adapters/inbound/http/controllers/user-tool-settings.controller.ts',
    ]);
    // 공유 자원(조직/개인 스코프)과 버전의 메타. 버전을 받으면 의미가 꼬이는 표면
    const versionFree = new Set([
      'domains/channel/adapters/inbound/http/controllers/channel.controller.ts',
      'domains/channel-settings/adapters/inbound/http/controllers/entry-preferences.controller.ts',
      'domains/channel-settings/adapters/inbound/http/controllers/brand-concept-catalog.controller.ts',
      'domains/asset-catalog/adapters/inbound/http/controllers/asset-catalog.controller.ts',
      'domains/asset-set/adapters/inbound/http/controllers/asset-set.controller.ts',
      'domains/common-asset/adapters/inbound/http/controllers/common-asset.controller.ts',
      'shared/saga-recovery/saga-recovery.controller.ts',
    ]);
    const found = walk(SRC)
      .map(rel)
      .filter((p) => p.endsWith('.controller.ts'))
      .sort();
    const unclassified = found.filter((p) => !versioned.has(p) && !versionFree.has(p));
    expect(unclassified).toEqual([]);
    // 목록이 없는 파일을 가리키면(개명이나 삭제) 검사가 조용히 무력해짐
    const stale = [...versioned, ...versionFree].filter((p) => !found.includes(p));
    expect(stale).toEqual([]);
  });

  // 버전 소유 산출물의 레포지토리 포트. 조회를 인자 나열로 추가하면 버전을 빠뜨릴 자리가 생김
  const PRODUCT_PORTS = [
    'domains/saved-plan/core/application/ports/outbound/saved-plan-repository.port.ts',
    'domains/video-project/core/application/ports/outbound/video-project-repository.port.ts',
    'domains/video-final/core/application/ports/outbound/video-final-repository.port.ts',
  ];

  // 두 버전이 함께 쓰는 자원. 스코프를 받으면 같은 값이 버전마다 갈려 오히려 틀림
  const SHARED_PORTS = [
    'domains/channel/core/application/ports/outbound/channel-repository.port.ts',
    'domains/channel-settings/core/application/ports/outbound/channel-settings-repository.port.ts',
    'domains/channel-settings/core/application/ports/outbound/user-tool-settings-repository.port.ts',
    'domains/asset-catalog/core/application/ports/outbound/asset-catalog-repository.port.ts',
    'domains/asset-set/core/application/ports/outbound/asset-set-repository.port.ts',
    'domains/common-asset/core/application/ports/outbound/common-asset-repository.port.ts',
  ];

  it('산출물 레포지토리 포트의 find* 는 스코프를 첫 인자로 받는다', () => {
    const offenders: string[] = [];
    for (const path of PRODUCT_PORTS) {
      const flat = readFileSync(join(SRC, path), 'utf-8').replace(/\s+/g, ' ');
      const re = /(find\w+)\(\s*([A-Za-z]+)[:)]/g;
      for (let m = re.exec(flat); m; m = re.exec(flat)) {
        if (m[2] !== 'scope') offenders.push(`${path}: ${m[1]}(${m[2]}…)`);
      }
    }
    expect(offenders).toEqual([]);
  });

  // 위 목록만 두면 검사가 자기가 아는 포트만 보므로 포트 파일을 디스크에서 세어 두 목록과 대조
  it('모든 레포지토리 포트가 산출물/공유 중 정확히 한 쪽에 있다', () => {
    const found = walk(SRC)
      .map(rel)
      .filter((p) => p.endsWith('-repository.port.ts'))
      .sort();
    const classified = new Set([...PRODUCT_PORTS, ...SHARED_PORTS]);
    expect(found.filter((p) => !classified.has(p))).toEqual([]);
    // 목록이 없는 파일을 가리키면(개명이나 삭제) 검사가 조용히 무력해짐
    expect([...classified].filter((p) => !found.includes(p)).sort()).toEqual([]);
  });
});
