import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * 사가 정의가 하나도 빠짐없이 복구 대상에 등록됐는지 소스에서 확인한다.
 *
 * 런타임이 아니라 소스를 보는 이유. 등록되지 않은 정의는 DI 컨테이너에 아예 나타나지 않는다. 그래서
 * 런타임에서는 "없는 것" 과 "잊은 것" 이 구분되지 않는다. 잊었다는 사실은 소스에만 있다.
 *
 * 이것이 막는 실수: 새 다단계 쓰기를 사가로 짜고 SagaRecoveryModule.forRoot 의 definitions 에 넣지 않는 것. 그러면
 * 그 사가만 중단됐을 때 아무도 이어 가지 않는다(경고 한 줄을 남기고 영구 방치). 화면에는 "만드는 중"
 * 으로 보이므로 사용자도 우리도 모른다. 조립 테스트는 이미 등록된 것들만 확인하므로 이 실수를 잡지 못한다.
 */
describe('사가 정의 등록', () => {
  const SRC = resolve(__dirname, '../../..');

  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (full.endsWith('.ts') && !full.endsWith('.spec.ts')) out.push(full);
    }
    return out;
  }

  /** `implements SagaDefinition<...>` 를 구현하는 클래스 이름. 정의의 유일한 표지다. */
  function definitionClasses(): string[] {
    const found: string[] = [];
    for (const file of walk(SRC)) {
      const text = readFileSync(file, 'utf-8');
      // 클래스 선언이 여러 줄로 나뉘는 경우(긴 제네릭)도 잡도록 줄바꿈을 지우고 훑는다.
      const flat = text.replace(/\s+/g, ' ');
      const re = /export class (\w+)\s+implements SagaDefinition</g;
      for (let m = re.exec(flat); m; m = re.exec(flat)) found.push(m[1]);
    }
    return found.sort();
  }

  it('모든 정의가 복구 러너의 목록에 들어 있다', () => {
    const wiring = readFileSync(join(SRC, 'shared/saga-recovery/saga-recovery.module.ts'), 'utf-8');
    const classes = definitionClasses();

    // 표지가 하나도 안 잡히면 검사가 조용히 무력해진 것이다(정의 작성 관용이 바뀐 경우)
    expect(classes.length).toBeGreaterThan(0);
    for (const name of classes) {
      // definitions 배열에 있어야 실제로 주입돼 목록에 담긴다(import 만으로는 등록되지 않는다)
      expect(wiring).toContain(name);
    }
  });
});
