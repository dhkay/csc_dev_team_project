// 채널 URL 식별자 생성: 이름에서 URL 친화 식별자를 만든다.
// 소문자화 + 공백→하이픈 + 허용 문자(영문/숫자/한글/하이픈)만 남기고 하이픈 정리
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9가-힣-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * URL 경로에 쓸 채널 식별자: 이름에서 파생한다(별도 slug 필드 없음)
 * URL 생성(드롭다운/리다이렉트)과 매칭(라우트 resolve)에서 동일하게 사용해 일관성을 보장한다.
 */
export function channelPathSlug(channel: { name: string }): string {
  return slugify(channel.name);
}
