import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  sectionFromPath,
  sectionPath,
  swapVersion,
  tabUrl,
  versionBasePath,
  workspaceBasePath,
  type WorkspaceRoute,
} from '$lib/pages/tools/marketing-video/workspaceUrl';
import { hasSection } from '$lib/pages/tools/marketing-video/versionProfile';

/**
 * 워크스페이스 주소의 네 조각. 버전이 채널보다 위다.
 *
 * 그 순서 덕에 채널 전환 링크가 버전을 자동으로 들고 가고(versionBase + 채널), 섹션/탭 함수는
 * basePath 뒤만 다루므로 세그먼트가 하나 늘어도 그대로 동작한다. 그 성질을 여기서 못박는다.
 */
const V15: WorkspaceRoute = {
  orgSlug: 'acme',
  toolSlug: 'marketing-video',
  version: 'v1.5',
  channelSlug: 'youtube',
};

describe('워크스페이스 주소', () => {
  it('버전이 도구와 채널 사이에 들어간다', () => {
    expect(versionBasePath(V15)).toBe('/acme/marketing-video/v1.5');
    expect(workspaceBasePath(V15)).toBe('/acme/marketing-video/v1.5/youtube');
  });

  it('버전이 다르면 다른 워크스페이스 주소다', () => {
    expect(workspaceBasePath({ ...V15, version: 'v1.0' })).toBe(
      '/acme/marketing-video/v1.0/youtube',
    );
  });

  it('섹션/탭 계산은 세그먼트 수와 무관하다(basePath 뒤만 본다)', () => {
    const base = workspaceBasePath(V15);
    expect(sectionPath(base, 'archive')).toBe('/acme/marketing-video/v1.5/youtube/archive');
    // 버전 세그먼트를 섹션으로 오인하면 nav 하이라이트가 통째로 어긋난다.
    expect(sectionFromPath(`${base}/archive`, base)).toBe('archive');
    expect(sectionFromPath(base, base)).toBe('workspace');
    expect(tabUrl(base, new URLSearchParams(), 'source')).toBe(`${base}?tab=source`);
  });

  it('한글 채널 이름은 퍼센트 인코딩된 주소가 된다', () => {
    // 백엔드가 만들어 주는 기본 채널 이름이 '기본' 이라 새 사용자는 전부 이 경로를 지난다.
    //   params 는 디코딩된 값이고 URL.pathname 과 Location 헤더는 인코딩된 값이다. 그대로 이으면
    //   Response 가 헤더를 거부해(Latin1 밖 문자) 서버 리다이렉트가 500 이 된다.
    const korean: WorkspaceRoute = { ...V15, channelSlug: '기본' };
    const base = workspaceBasePath(korean);
    expect(base).toBe('/acme/marketing-video/v1.5/%EA%B8%B0%EB%B3%B8');
    expect(() => new Response(null, { status: 307, headers: { location: base } })).not.toThrow();
  });

  it('인코딩된 pathname 과 basePath 가 같은 모양이라 섹션 판정이 맞는다', () => {
    // 브라우저가 보낸 주소는 URL.pathname 에서 인코딩된 채로 온다. basePath 가 디코딩된 채널을 들고
    //   있으면 startsWith 가 늘 실패해 어느 섹션이든 workspace 로 읽힌다(게이트가 열리고 nav 가 꺼진다)
    const korean: WorkspaceRoute = { ...V15, channelSlug: '기본' };
    const url = new URL('http://x/acme/marketing-video/v1.5/기본/archive?tab=final');
    expect(sectionFromPath(url.pathname, workspaceBasePath(korean))).toBe('archive');
    expect(swapVersion(url, korean, 'v1.0', hasSection)).toBe(
      '/acme/marketing-video/v1.0/%EA%B8%B0%EB%B3%B8/archive?tab=final',
    );
  });
});

/**
 * 도구 라우트가 주소를 손으로 잇지 않는가
 *
 * 빌더가 있어도 한 파일이 채널 slug 를 템플릿 문자열에 직접 넣으면 두 가지가 조용히 어긋난다.
 * 버전 조각이 빠지면 그 화면은 멀쩡히 뜨고 거기서 만든 링크를 눌러야 404 가 드러나고(기획안
 * 상세가 실제로 그렇게 깨졌다), 인코딩이 빠지면 한글 채널의 서버 리다이렉트가 500 이 된다(도구
 * 랜딩이 실제로 그렇게 깨졌다). 컴파일러도 타입도 잡지 못하므로 파일을 직접 읽어 막는다.
 * 화면(.svelte)과 서버 로더(.ts)를 모두 본다. 리다이렉트는 서버 로더에 있다.
 */
describe('도구 라우트의 주소 조립', () => {
  const ROOT = resolve(__dirname, '../../../../src/routes/[orgSlug]/[toolSlug]');

  function routeFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const path = join(dir, e.name);
      if (e.isDirectory()) return routeFiles(path);
      return e.name.endsWith('.svelte') || e.name.endsWith('.ts') ? [path] : [];
    });
  }

  it('채널 slug 를 템플릿에 직접 넣지 않는다(workspaceBasePath 를 쓴다)', () => {
    // `${channelSlug}`, `${event.params.channelSlug}` 처럼 채널 slug 로 끝나는 보간 전부
    const HAND_BUILT = /\$\{[^}]*channelSlug\s*\}/;
    const offenders = routeFiles(ROOT)
      .filter((f) => HAND_BUILT.test(readFileSync(f, 'utf8')))
      .map((f) => relative(ROOT, f));
    expect(offenders, '버전 조각과 인코딩이 빠진다: workspaceBasePath 를 쓸 것').toEqual([]);
  });
});

describe('버전 전환(swapVersion)', () => {
  it('채널/섹션/쿼리를 그대로 들고 간다', () => {
    const url = new URL('http://x/acme/marketing-video/v1.5/youtube/archive?tab=final&q=1');
    expect(swapVersion(url, V15, 'v1.0', hasSection)).toBe(
      '/acme/marketing-video/v1.0/youtube/archive?tab=final&q=1',
    );
  });

  it('대상 버전에 없는 섹션이면 그 버전의 워크스페이스로 접는다', () => {
    // v1.0 의 에셋에서 v1.5 로 넘어가면 갈 곳이 없다. 그대로 두면 서버 게이트가 다시 리다이렉트해
    //   화면이 두 번 튄다.
    const v10: WorkspaceRoute = { ...V15, version: 'v1.0' };
    const url = new URL('http://x/acme/marketing-video/v1.0/youtube/assets');
    expect(swapVersion(url, v10, 'v1.5', hasSection)).toBe('/acme/marketing-video/v1.5/youtube');
  });
});
