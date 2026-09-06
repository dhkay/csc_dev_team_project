import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  CREATE_MODE_META,
  hasSection,
  versionProfile,
} from '$lib/pages/tools/marketing-video/versionProfile';
import { VERSION_MODES } from '$lib/shared/lib/versionMode/versionMode';
import {
  TABS,
  sectionFromPath,
  type WorkspaceSection,
} from '$lib/pages/tools/marketing-video/workspaceUrl';

/**
 * 버전별 화면 구성. 삼항 연산자가 여러 파일에 흩어져 있으면 한 곳을 빠뜨렸을 때 그 자리만 다른
 * 버전처럼 보인다. 프로필로 모으면 그 빠짐이 여기서 잡힌다.
 */
describe('버전 화면 구성', () => {
  it('모든 버전에 프로필이 있다', () => {
    // Record<VersionMode, …> 라 컴파일도 잡지만, 값 공간을 런타임으로도 한 번 훑는다.
    for (const v of VERSION_MODES) {
      expect(versionProfile(v)).toBeDefined();
    }
  });

  it('v1.0 에만 에셋 섹션이 있다', () => {
    // v1.5 가 감추는 것은 에셋 하나다. 이 값이 nav 가시성과 서버 게이트 양쪽의 출처다.
    expect(hasSection('v1.0', 'assets')).toBe(true);
    expect(hasSection('v1.5', 'assets')).toBe(false);
  });

  it('워크스페이스와 보관함은 두 버전에 다 있다', () => {
    for (const v of VERSION_MODES) {
      expect(hasSection(v, 'workspace')).toBe(true);
      expect(hasSection(v, 'archive')).toBe(true);
    }
  });

  it('모든 버전이 모든 탭의 라벨을 갖는다', () => {
    // 탭 key 는 두 버전이 같다(?tab= 링크가 버전을 옮겨도 깨지지 않게). 라벨만 갈린다.
    for (const v of VERSION_MODES) {
      const { tabLabels } = versionProfile(v);
      for (const tab of TABS) {
        expect(tabLabels[tab]).toBeTruthy();
      }
    }
  });

  it('생성 버튼 라벨이 버전마다 다르다', () => {
    expect(versionProfile('v1.5').createLabel).toBe('영상 생성');
    expect(versionProfile('v1.0').createLabel).toBe('기획서 생성');
  });

  /**
   * 라우트 폴더와 섹션 판정이 어긋나지 않는가
   *
   * 서버 게이트는 `[channelSlug]` 레이아웃 한 곳에 있고, 주소가 어느 섹션인지는 `sectionFromPath` 가
   * 정한다. 그래서 그 함수가 모르는 폴더는 'workspace' 로 떨어져 게이트를 그냥 통과한다. 새 섹션을
   * 만들고 판정에 넣지 않으면 다른 버전에서도 그 주소가 열리는데, 그 빠짐은 주소를 직접 쳐 봐야 드러난다.
   * (v1.5 의 에셋이 정확히 그 사고였다). 폴더를 디스크에서 세어 판정 결과와 맞춘다.
   */
  it('채널 하위 라우트 폴더가 전부 섹션으로 판정된다', () => {
    // 섹션이 아닌 폴더: 워크스페이스에 속한 하위 경로. 'workspace' 로 떨어지는 것이 맞다.
    const NOT_A_SECTION: Record<string, WorkspaceSection> = {
      plans: 'workspace', // plans/[planId]: 기획안 상세(워크스페이스의 일부)
      prompt: 'process', // 레거시 경로. /process 로 리다이렉트되며 그 사이 nav 하이라이트를 유지한다
    };
    const dir = resolve(
      __dirname,
      '../../../../src/routes/[orgSlug]/[toolSlug]/[version=version]/[channelSlug]',
    );
    const folders = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    const base = '/acme/marketing-video/v1.0/main';
    const mismatched = folders.filter(
      (f) => sectionFromPath(`${base}/${f}`, base) !== (NOT_A_SECTION[f] ?? f),
    );
    expect(mismatched).toEqual([]);
  });

  describe('생성 모달 입력 방식', () => {
    it('v1.5 는 컨셉입력과 프롬프트 둘, v1.0 은 컨셉입력 하나다', () => {
      // 방식이 하나뿐인 버전에서는 탭을 그리지 않는다(고를 것이 없는 탭은 자리만 차지한다)
      // 그 판정이 개수라서, 개수 자체를 고정한다.
      expect(versionProfile('v1.5').createModes).toEqual(['concept', 'prompt']);
      expect(versionProfile('v1.0').createModes).toEqual(['concept']);
    });

    it('첫 항목이 기본 방식이고 두 버전 다 컨셉입력이다', () => {
      // 모달이 열릴 때마다 첫 항목으로 되돌린다. 버전을 옮겨도 처음 보는 폼이 같아야 한다.
      for (const v of VERSION_MODES) {
        expect(versionProfile(v).createModes[0]).toBe('concept');
      }
    });

    it('모든 방식에 탭 이름과 제목, 설명이 있다', () => {
      // 하나라도 비면 탭이 빈 칸이거나 머리글에 빈 줄이 생기고, 그 상태는 화면을 봐야만 드러난다.
      for (const v of VERSION_MODES) {
        for (const mode of versionProfile(v).createModes) {
          const meta = CREATE_MODE_META[mode];
          expect(meta.label, `${mode}.label`).toBeTruthy();
          expect(meta.title, `${mode}.title`).toBeTruthy();
          expect(meta.description, `${mode}.description`).toBeTruthy();
        }
      }
    });

    it('기획서 구성은 v1.0 에만 있다', () => {
      // v1.5 는 영상 한 편이 목적지라 개수를 고르지 않고, 몇 씬으로 만들지는 씬/사용자 입력사항이
      // 정한다. 두 곳에서 정하면 값이 어긋나 모델이 무엇을 따를지 알 수 없다.
      expect(versionProfile('v1.0').hasPlanCompose).toBe(true);
      expect(versionProfile('v1.5').hasPlanCompose).toBe(false);
    });

    it('직접 적는 지시 칸은 기획서 구성과 서로 배타적이다', () => {
      // 같은 것(무엇을 몇 씬으로 담을지)을 두 자리에서 정하지 않는다는 규칙 자체를 고정한다.
      // 개수를 고르는 버전에는 지시 칸이 없고, 지시 칸이 있는 버전에는 개수 선택이 없다.
      for (const v of VERSION_MODES) {
        const p = versionProfile(v);
        expect(p.hasDirectBriefs, v).toBe(!p.hasPlanCompose);
      }
    });

    it('제작 단계 토글은 단계를 순서대로 밟는 버전에만 있다', () => {
      // v1.5 는 만들면 바로 영상이 나오므로 단계를 오가는 조작이 하는 일 없이 한 번 더 눌러야 하는
      // 자리가 된다. 대신 세 구역이 한 화면에 쌓인다.
      expect(versionProfile('v1.0').hasStageTabs).toBe(true);
      expect(versionProfile('v1.5').hasStageTabs).toBe(false);
    });

    it('완성본이 바로 나오는 버전은 구역이 하나다', () => {
      // 누른 한 번이 최종 영상까지 만드는 구성에서는 나눌 것이 없다. 기획안은 도중에 저장되는
      // 중간 산출물이라 골라서 다음으로 넘길 물건이 아니고, 세트를 입힌 배포본이라는 별도 산출물도
      // 없다. 그 둘을 구역으로 두면 완성본만 보면 되는 화면에 빈 칸이 둘 생긴다.
      expect(versionProfile('v1.0').workspaceStages).toEqual(['plan', 'source', 'final']);
      expect(versionProfile('v1.5').workspaceStages).toEqual(['source']);
    });

    it('모든 버전에 구역이 최소 하나는 있다', () => {
      // 첫 구역이 생성 중인 것이 서는 자리다. 목록이 비면 그 자리가 없어져 만드는 중인 것이
      // 화면 어디에도 뜨지 않는다.
      for (const v of VERSION_MODES) {
        expect(versionProfile(v).workspaceStages.length, v).toBeGreaterThan(0);
      }
    });

    it('최종 구역은 에셋이 있는 버전에만 있다', () => {
      // 둘의 관계가 규칙이다. 세트를 만드는 화면이 없으면 세트를 입힌 결과물도 생길 수 없다.
      // 한쪽만 켜면 만들 수 없는 것을 기다리는 빈 구역이나, 담길 데 없는 세트가 생긴다.
      for (const v of VERSION_MODES) {
        expect(versionProfile(v).workspaceStages.includes('final'), v).toBe(hasSection(v, 'assets'));
      }
    });

    it('보관물은 그 버전의 마지막 구역에서 온다', () => {
      // 배포본이 있는 구역이 보관 대상이다. 최종 구역이 있으면 세트를 입힌 결과가, 없으면 그
      // 하나뿐인 영상 구역의 완성본이 담긴다. 이 값이 서버가 어느 표에 쓰는지를 정하므로
      // (archiveTarget) 틀리면 조용히 다른 표를 고친다. 그래서 구역 목록과의 관계를 잠근다.
      for (const v of VERSION_MODES) {
        const p = versionProfile(v);
        expect(p.archiveSource, v).toBe(p.workspaceStages[p.workspaceStages.length - 1]);
      }
    });

    it('보관물이 오는 구역은 그 버전이 실제로 보여주는 구역이다', () => {
      // 없는 구역을 가리키면 보관함을 채울 길이 화면에 없다(빈 안내도 그 구역을 가리켜 버린다)
      for (const v of VERSION_MODES) {
        const p = versionProfile(v);
        expect(p.workspaceStages.includes(p.archiveSource), v).toBe(true);
      }
    });

    it('조각의 이름이 그 버전이 개수를 세는 단위와 같다', () => {
      // 가격표의 호출 횟수가 이 단위마다 늘어난다. 이름이 그 버전의 화면과 다르면 무엇을 늘리면
      //   비용이 느는지 읽는 사람이 알 수 없다.
      //   개수를 폼에서 고르는 버전은 그 자리의 이름이 '씬' 이고, 적은 만큼 만들어지는 버전은
      //   입력칸 예시가 '동영상' 이다(SCENE_BRIEF_PLACEHOLDER)
      expect(versionProfile('v1.0').segmentUnitLabel).toBe('씬');
      expect(versionProfile('v1.5').segmentUnitLabel).toBe('동영상');
    });

    it('모든 버전에 조각의 이름이 있다', () => {
      // 비면 가격표가 "  1개짜리 영상" 처럼 단위 없이 그려진다.
      for (const v of VERSION_MODES) {
        expect(versionProfile(v).segmentUnitLabel, v).toBeTruthy();
      }
    });

    it('기획안 구역이 없는 버전은 생성 폼에서 개수를 고르지 않는다', () => {
      // 기획안 구역이 없다 = 기획안이 고를 물건이 아니다. 그런데 여러 벌을 뽑게 두면 고를 수 없는
      // 것을 여러 벌 만들게 된다. 두 축이 같은 이야기를 하고 있으므로 함께 잠근다.
      for (const v of VERSION_MODES) {
        const p = versionProfile(v);
        if (!p.workspaceStages.includes('plan')) expect(p.hasPlanCompose, v).toBe(false);
      }
    });

    it('보여주는 구역에는 라벨이 있다', () => {
      // 비면 무슨 그리드인지 알 방법이 없다(토글이 있는 버전은 토글이 그 일을 한다)
      for (const v of VERSION_MODES) {
        const p = versionProfile(v);
        for (const tab of p.workspaceStages) {
          expect(p.tabLabels[tab], `${v}/${tab}`).toBeTruthy();
        }
      }
    });

    it('영상 설정 묶음은 v1.5 에만 있다', () => {
      // 그 버전은 생성 시점에 어느 모델로 어떻게 이어붙일지가 선택이고, 그 값이 예약 행에 남아
      // 렌더까지 간다. v1.0 은 모델이 하나뿐이고 이어붙이는 방식도 파이프라인이 정한다.
      expect(versionProfile('v1.5').hasVideoSettings).toBe(true);
      expect(versionProfile('v1.0').hasVideoSettings).toBe(false);
    });

    it('기획서 생성 프롬프트 바로가기는 기획서가 산출물인 버전에만 있다', () => {
      // v1.5 의 모달은 '영상 생성' 이고 기획안은 중간 산출물이라, 헤더가 만드는 것과 다른 이야기를
      // 하게 된다. 같은 편집기는 프로세스 섹션이 사슬 문맥 안에서 열어 준다(경로가 사라지지 않는다)
      expect(versionProfile('v1.0').hasPlanPromptShortcut).toBe(true);
      expect(versionProfile('v1.5').hasPlanPromptShortcut).toBe(false);
    });

    it('진행 화면은 한 번 눌러 영상까지 가는 버전에만 있다', () => {
      // 그 화면이 말하는 단계(세그먼트 생성, 병합, 업로드)는 그 버전의 파이프라인 이름이다.
      // v1.0 에 띄우면 일어나지도 않을 병합과 업로드를 기다리게 된다.
      expect(versionProfile('v1.5').hasGenerationProgress).toBe(true);
      expect(versionProfile('v1.0').hasGenerationProgress).toBe(false);
    });

    it('하단 탭은 돌아갈 진행 화면이 있는 버전에만 켠다', () => {
      // 탭의 쓸모는 되돌아갈 자리다. 진행 화면이 없는 버전에서 켜면 눌러도 갈 곳이 없다.
      // 반대 방향은 강제하지 않는다: 진행 화면을 두면서 탭은 두지 않는 구성도 가능하다.
      for (const v of VERSION_MODES) {
        const p = versionProfile(v);
        if (p.hasWorkContinuity) expect(p.hasGenerationProgress, v).toBe(true);
      }
      expect(versionProfile('v1.5').hasWorkContinuity).toBe(true);
      expect(versionProfile('v1.0').hasWorkContinuity).toBe(false);
    });

    it('진행 화면이 있는 버전에는 영상 설정 묶음도 있다', () => {
      // 진행 화면은 영상을 만드는 흐름의 것이다. 영상 설정조차 고르지 않는 버전에 그 화면이
      // 붙어 있다면 둘 중 하나가 잘못 켜진 것이다.
      for (const v of VERSION_MODES) {
        const p = versionProfile(v);
        if (p.hasGenerationProgress) expect(p.hasVideoSettings, v).toBe(true);
      }
    });

    it('바로가기가 없는 버전에도 프로세스 섹션은 있다', () => {
      // 바로가기를 걷은 근거가 "프로세스에서 고칠 수 있다" 라서, 그 섹션이 빠지면 근거가 무너진다.
      // 그때는 편집 경로가 아예 없어지는데 그 상태는 화면을 뒤져 봐야 드러난다.
      for (const v of VERSION_MODES) {
        if (!versionProfile(v).hasPlanPromptShortcut) expect(hasSection(v, 'process'), v).toBe(true);
      }
    });

    it('모든 버전에 무엇을 만드는지 알리는 윗줄이 있다', () => {
      // 방식이 여럿이면 제목이 방식 이름으로 바뀐다. 그때 무엇을 만드는 중인지 말해 주는 줄이
      // 비어 있으면, 모달 본문만 봐서는 산출물을 알 수 없다.
      for (const v of VERSION_MODES) {
        expect(versionProfile(v).createEyebrow, v).toBeTruthy();
      }
    });
  });
});
