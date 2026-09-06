// 하단 공지 바 데이터: 현재는 전부 더미값(이미지 기준)
// TODO: 실제 공지 데이터 연동 시 교체

export interface FooterNotice {
  id: string;
  // 바의 좌/우 그룹
  side: 'start' | 'end';
  text: string;
  // 있으면 배지(예: 'NEW')로, 없으면 스피커(공지) 아이콘으로 표시
  badge?: string;
}

export const footerNotices: FooterNotice[] = [
  { id: 'company', side: 'start', text: '현재 공지 기능 준비 중입니다.' },
  { id: 'upload', side: 'end', badge: 'NEW', text: '공지 기능 오픈 예정' },
];
