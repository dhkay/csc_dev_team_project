/**
 * 가격표의 렌더 계약. 버전마다 사실이 다르고, 틀려도 화면은 멀쩡히 그려진다.
 *
 * 여기서 잠그는 것은 돈에 대해 화면이 하는 말이다. v1.5 에는 내부 모델이 없고 공개 단가가 한 줄도
 * 없으며 청구 주체가 모델 제작사가 아니라 Higgsfield 다. 그 셋 중 하나만 틀려도 읽는 사람이
 * 존재하지 않는 무료 경로를 찾거나, 청구서에서 볼 수 없는 회사 이름을 뒤지게 된다.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import PricePage from '$lib/pages/tools/marketing-video/price/PricePage.svelte';
import { DEFAULT_SCENE_COUNT } from '$lib/pages/tools/marketing-video/planComposeOptions';

// 조직 등록 키 조회는 이 화면의 관심사가 아니다(상태 배지만 바뀐다). 비어 있는 것으로 고정한다.
vi.mock('$lib/features/api-credentials/services/apiCredentials.service', () => ({
  apiCredentialsService: {
    configuredProvidersOptions: () => ({ queryKey: ['configured'], queryFn: async () => [] }),
  },
}));

vi.mock('@tanstack/svelte-query', () => ({
  createQuery: () => ({ data: [], isPending: false }),
}));

describe('PricePage (v1.5)', () => {
  it('내부 모델 안내를 그리지 않는다', () => {
    // 그 버전에는 사내 GPU 로 도는 모델이 하나도 없다. "추가 비용이 없습니다" 를 읽으면 무료로 쓸
    //   길이 있는 줄 알게 되는데, 이 버전은 모든 단계가 조직 키를 요구한다.
    render(PricePage, { version: 'v1.5' });
    expect(screen.queryByText(/내부\(자체\) 모델/)).not.toBeInTheDocument();
    expect(screen.getByText(/모든 단계가 조직 API 키를 요구합니다/)).toBeInTheDocument();
  });

  it('청구 주체를 모델 제작사가 아니라 플랫폼으로 적는다', () => {
    // Kling/Seedance/Veo 는 만든 곳이 셋이지만 조직이 키를 등록하고 돈을 내는 곳은 Higgsfield 다
    const { container } = render(PricePage, { version: 'v1.5' });
    const banner = container.textContent ?? '';
    expect(banner).toContain('Higgsfield');
    expect(banner).not.toMatch(/비용이 [^.]*Kling[^.]*에서 조직으로 직접 청구/);
  });

  it('공개 단가가 있는 줄이 생기면 그 각주를 되살린다', () => {
    // 각주는 표에 공개 단가 줄이 있는지를 따라간다. 화면에 고정값으로 박아 두면 그 구성이 바뀌는
    //   순간 거짓이 된다(전부 크레딧 과금이면 숫자가 하나도 없다)
    render(PricePage, { version: 'v1.5' });
    expect(screen.getByText(/표시 단가는 각 회사가 공개한 API 요금/)).toBeInTheDocument();
  });

  it('기획 LLM 을 그 버전이 쓰는 모델로 한 줄 싣는다', () => {
    // 축에서 빼 두었을 때는 이 지출이 가격표에서 아예 안 보였다. 영상 한 편마다 나가는 호출이다.
    render(PricePage, { version: 'v1.5' });
    expect(screen.getByText('Claude Sonnet 5')).toBeInTheDocument();
    // 고를 수 없는 나머지 둘은 그 버전의 정보가 아니다.
    expect(screen.queryByText('Claude Opus 4.8')).not.toBeInTheDocument();
  });

  it('영상 한 편에 나가는 호출 횟수를 씬 수로 보여준다', () => {
    // 표는 단가를 말하고 이 블록은 횟수를 말한다. 모든 줄이 "요청마다 다름" 인 버전에서는 이것이
    //   화면에 남는 유일한 숫자다.
    render(PricePage, { version: 'v1.5' });
    expect(screen.getByText('영상 한 편에 나가는 호출')).toBeInTheDocument();
    expect(screen.getAllByText(`${DEFAULT_SCENE_COUNT}회`).length).toBeGreaterThan(0);
  });
});

describe('PricePage (v1.0)', () => {
  it('내부 모델과 공개 단가 안내가 그대로 있다', () => {
    // v1.5 를 고치면서 v1.0 의 사실까지 지우지 않았는지 본다(그쪽은 자체 모델과 공개 단가가 있다)
    render(PricePage, { version: 'v1.0' });
    expect(screen.getByText(/표시 단가는 각 회사가 공개한 API 요금/)).toBeInTheDocument();
  });
});
