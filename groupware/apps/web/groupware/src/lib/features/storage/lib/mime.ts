// 파일 종류 판정(순수): 목록의 "유형" 칸에 무엇을 적을지 정한다.

type FileKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'text'
  | 'archive'
  | 'doc'
  | 'sheet'
  | 'slide'
  | 'other';

const EXTENSION_KINDS: Record<string, FileKind> = {
  zip: 'archive',
  rar: 'archive',
  '7z': 'archive',
  gz: 'archive',
  doc: 'doc',
  docx: 'doc',
  hwp: 'doc',
  hwpx: 'doc',
  xls: 'sheet',
  xlsx: 'sheet',
  csv: 'sheet',
  ppt: 'slide',
  pptx: 'slide'
};

/** mime 을 먼저 보고 확장자로 보완한다(일부 브라우저는 확장자만 있고 mime 이 빈 값이다) */
export function fileKindOf(mimeType: string, fileName = ''): FileKind {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('text/')) return 'text';
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_KINDS[ext] ?? 'other';
}

export const FILE_KIND_LABEL: Record<FileKind, string> = {
  image: '이미지',
  video: '영상',
  audio: '오디오',
  pdf: 'PDF',
  text: '텍스트',
  archive: '압축 파일',
  doc: '문서',
  sheet: '스프레드시트',
  slide: '슬라이드',
  other: '파일'
};
