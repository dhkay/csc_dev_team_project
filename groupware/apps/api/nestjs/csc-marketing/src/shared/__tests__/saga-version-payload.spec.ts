import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { SavePlanSaga } from '../../domains/saved-plan/core/application/sagas';
import {
  CreateVideoProjectSaga,
  RerenderVideoProjectSaga,
  RerenderVideoProjectSegmentSaga,
} from '../../domains/video-project/core/application/sagas';
import {
  CreateVideoFinalSaga,
  RerenderVideoFinalSaga,
} from '../../domains/video-final/core/application/sagas';

/**
 * 사가 재개가 요청과 같은 버전으로 이어 가는지
 *
 * 복구 러너는 HTTP 요청 밖에서 중단분을 이어 간다. 그때 버전을 개인 설정에서 다시 읽으면, 그 사이
 * 사람이 바꿔 둔 값으로 재개해 만들다 만 산출물이 다른 버전 것이 된다. 그래서 버전은 payload
 * (불변)에 실린다. 이 테스트는 hydrate 가 그 값을 쓴다는 것과, 모르는 값이면 조용히 진행하지 않고
 * 멈춘다는 것을 못박는다.
 *
 * 협력자를 주입하지 않는 이유: hydrate 는 payload/context 만 보는 순수 변환이다(단계는 돌지 않는다)
 */
/** hydrate 만 부르는 최소 인터페이스: 단계는 돌지 않으므로 협력자는 필요 없다. */
interface HydratableSaga {
  hydrate(
    payload: Record<string, unknown>,
    context: Record<string, unknown>,
  ): { scope: unknown };
}

describe('사가 payload 의 버전', () => {
  /**
   * 협력자 없이 인스턴스만 만든다.
   *
   * 협력자를 하나하나 넣지 않는 이유: 그러면 이 테스트가 각 사가의 생성자 인자 개수에 묶인다.
   * 협력자를 하나 추가할 때마다 버전과 무관한 이 파일이 깨지고, 그 깨짐은 아무것도 알려주지 않는다.
   * hydrate 는 payload/context 만 보는 순수 변환이라 협력자를 건드리지 않는다.
   */
  const bare = (Saga: new (...args: never[]) => unknown): HydratableSaga =>
    new (Saga as new () => HydratableSaga)();

  const sagas: {
    name: string;
    // 정의 파일(src 상대). 아래 "빠짐없이" 검사가 이 목록을 디스크와 맞춰 본다.
    file: string;
    Saga: new (...args: never[]) => unknown;
    payload: Record<string, unknown>;
  }[] = [
    {
      name: 'saved_plan.save',
      file: 'domains/saved-plan/core/application/sagas/save-plan.saga.ts',
      Saga: SavePlanSaga,
      payload: { organizationId: 10, ownerUserId: 7, input: {} },
    },
    {
      name: 'video_project.create',
      file: 'domains/video-project/core/application/sagas/create-video-project.saga.ts',
      Saga: CreateVideoProjectSaga,
      payload: { organizationId: 10, ownerUserId: 7, savedPlanId: 5 },
    },
    {
      name: 'video_project.rerender',
      file: 'domains/video-project/core/application/sagas/rerender-video-project.saga.ts',
      Saga: RerenderVideoProjectSaga,
      payload: { organizationId: 10, ownerUserId: 7, projectId: 100 },
    },
    {
      name: 'video_project.rerender_segment',
      file: 'domains/video-project/core/application/sagas/rerender-video-project-segment.saga.ts',
      Saga: RerenderVideoProjectSegmentSaga,
      payload: { organizationId: 10, ownerUserId: 7, projectId: 100, order: 2 },
    },
    {
      name: 'video_final.create',
      file: 'domains/video-final/core/application/sagas/create-video-final.saga.ts',
      Saga: CreateVideoFinalSaga,
      payload: { organizationId: 10, ownerUserId: 7, sourceId: 100, setId: 20 },
    },
    {
      name: 'video_final.rerender',
      file: 'domains/video-final/core/application/sagas/rerender-video-final.saga.ts',
      Saga: RerenderVideoFinalSaga,
      payload: { organizationId: 10, ownerUserId: 7, finalId: 200 },
    },
  ];

  /**
   * 새 사가가 이 검사를 그냥 지나가지 못하게 한다.
   *
   * 위 목록만 두면 검사가 자기가 아는 사가만 본다. 나중에 추가된 사가는 payload 에 버전을 안 실어도
   * 아무도 잡지 않고, 그 사가만 재개할 때 버전을 잃는다(중단됐다 이어진 산출물이 다른 버전 것이 된다)
   * 그래서 정의 파일을 디스크에서 세어 목록과 맞춘다: 새 사가는 여기 올라야 통과한다.
   */
  it('사가 정의가 빠짐없이 이 검사에 올라 있다', () => {
    const SRC = resolve(__dirname, '../..');
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (full.endsWith('.saga.ts')) out.push(full.slice(SRC.length + 1).replace(/\\/g, '/'));
      }
      return out;
    };
    expect(walk(SRC).sort()).toEqual(sagas.map((s) => s.file).sort());
  });

  for (const { name, Saga, payload } of sagas) {
    it(`${name}: payload 의 버전으로 컨텍스트를 되살린다`, () => {
      const ctx = bare(Saga).hydrate({ ...payload, version: 'v1.0' }, {});
      expect(ctx.scope).toEqual({ organizationId: 10, ownerUserId: 7, version: 'v1.0' });
    });

    it(`${name}: 모르는 버전이면 재개하지 않고 던진다`, () => {
      // 기본값으로 접으면 v1.0 으로 만들던 산출물이 v1.5 규칙으로 완성된다(결과물을 보고서야 안다)
      expect(() => bare(Saga).hydrate({ ...payload, version: 'v9.9' }, {})).toThrow(
        BadRequestException,
      );
      expect(() => bare(Saga).hydrate(payload, {})).toThrow(BadRequestException);
    });
  }
});
