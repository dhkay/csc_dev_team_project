// 브랜드/컨셉 카탈로그: 세로형 광고 영상 연출 방향의 기본 7축 선택지 SSOT
// 출처 reference/data/CSC 브랜드컨셉 카테고리 및 레퍼런스.xlsx, 표기는 원본 유지하고 옵션 key 는 갱신에도 보존
// 축별 라우팅: style/mood → 씬 이미지 프롬프트, 나머지 5축 → 기획안 텍스트 프롬프트

/** 컨셉 축 식별자. 저장분의 `axis` 와 매칭 */
export type ConceptAxisKey =
  | 'style'
  | 'mood'
  | 'tone'
  | 'sound'
  | 'structure'
  | 'audience'
  | 'purpose';

/** 한 축의 선택지 하나. label 과 description 이 그대로 화면과 프롬프트에 노출 */
export interface BrandConceptOption {
  // 저장분의 `option` 과 매칭되는 식별자
  key: string;
  // 칩 표시명
  label: string;
  // 감독 노트: 설명 패널 표시 + 프롬프트의 note
  description: string;
}

/** 컨셉 축 하나 */
export interface BrandConceptAxis {
  key: ConceptAxisKey;
  // 축 이름(화면 표시 + 프롬프트의 축 라벨)
  label: string;
  // 축이 정하는 것(미선택 시 안내)
  description: string;
  options: BrandConceptOption[];
}

export const BRAND_CONCEPT_AXES: BrandConceptAxis[] = [
  {
    key: 'style',
    label: '표현 형식',
    description: '영상의 비주얼 표현 방식(매체)입니다. 씬 이미지 프롬프트로 나갑니다.',
    options: [
      { key: 'live-action-closeup', label: '실사 클로즈업 필름룩', description: '아기 피부, 물방울을 근접 촬영, 연약함 강조' },
      { key: 'ugc-handheld', label: 'UGC 실사(핸드헬드)', description: '실제 부모가 찍은 듯한 리얼 후기 톤' },
      { key: 'motion-graphics', label: '2D 모션그래픽/인포그래픽', description: '염소 제거 원리 등을 도식으로 시각화' },
      { key: '3d-render', label: '3D 렌더/제품 CG', description: '필터 단면, 물 흐름을 입체적으로 표현' },
      { key: 'pastel-illustration', label: '감성 파스텔 일러스트', description: '손그림풍 따뜻한 일러스트, 친근한 톤' },
      { key: 'talking-head', label: '전문가/인플루언서 토킹헤드', description: '전문가나 인플루언서가 직접 설명' },
      { key: 'asmr-voiceless', label: 'ASMR 무보이스 클립', description: '물소리, 거품소리 중심, 무내레이션' },
      { key: 'stop-motion', label: '스톱모션/미니어처', description: '아기용품을 앙증맞게 연출하는 스톱모션' },
      { key: 'webtoon-cuttoon', label: '웹툰형(컷툰 애니메이션)', description: '웹툰 그림체를 컷 단위로 움직이는 애니메이션, 스토리 공감형' },
      { key: 'clay-puppet', label: '클레이/퍼펫 애니메이션', description: '점토, 인형 소재의 촉감 있는 애니메이션' },
      { key: 'typography-motion', label: '타이포그래피 모션', description: '자막, 텍스트 움직임 중심, 정보 전달에 강함' },
      { key: 'live-action-overlay', label: '혼합형(실사+모션 오버레이)', description: '실사 위에 수치, 자막, 아이콘을 얹는 방식' },
      { key: 'absurd-animation', label: '병맛 드립 애니메이션', description: '과장된 표정과 뜬금없는 전개로 웃음을 유발하는 B급 감성 애니메이션' },
      { key: 'meme-collage', label: '밈 콜라주 형식', description: '인터넷 밈 템플릿을 패러디하듯 활용하는 콘텐츠 형식' },
      { key: 'newtro-camcorder', label: '뉴트로 캠코더룩', description: '90년대 캠코더 화질을 흉내낸 키치한 영상미' },
      { key: 'still-slideshow', label: '스틸컷 슬라이드쇼(컷 전환형)', description: '정지 이미지를 순차 전환, 팬/줌으로 이어붙이는 영상 편집 방식' },
    ],
  },
  {
    key: 'mood',
    label: '무드',
    description: '화면의 색감과 분위기입니다. 씬 이미지 프롬프트로 나갑니다.',
    options: [
      { key: 'clean-pure', label: '클린 & 퓨어(화이트, 아쿠아)', description: '흰색, 물색 중심의 청결, 순수 무드' },
      { key: 'warm-cozy', label: '웜 & 코지(따뜻한 자연광)', description: '노을빛, 주광의 포근한 가정 분위기' },
      { key: 'pastel-soft', label: '파스텔 소프트', description: '연한 핑크, 민트의 부드러운 색감' },
      { key: 'natural-organic', label: '내추럴 오가닉', description: '식물, 자연주의를 담은 초록, 베이지 톤' },
      { key: 'minimal-premium', label: '미니멀 프리미엄', description: '절제된 여백과 고급 무광 질감' },
      { key: 'healing-slow', label: '힐링 슬로우 템포', description: '느린 편집, 잔잔한 리듬, 진정 정서' },
      { key: 'bright-vivid', label: '하이라이트 명료(밝고 선명)', description: '밝은 조명, 선명한 대비, 정보 가독성' },
      { key: 'clinical-lab', label: '리서치 랩(클리니컬)', description: '화이트 랩, 데이터 비주얼, 전문성 연출' },
      { key: 'docu-real', label: '다큐 리얼(생활밀착)', description: '꾸밈없는 실제 육아 현장 무드' },
      { key: 'fairytale-fantasy', label: '동화적 판타지', description: '웹툰, 동화풍의 몽환적 색감과 연출' },
      { key: 'vintage-nostalgia', label: '빈티지 노스탤지어', description: '필름 질감과 색바램, 그리움의 정서' },
      { key: 'bmovie-kitsch', label: '병맛 B급 감성', description: '촌스러움을 일부러 강조하는 키치하고 유쾌한 무드' },
      { key: 'absurd-comedy', label: '황당 개그 텐션', description: '예측 불가능한 전개로 실소를 유발하는 무드' },
    ],
  },
  {
    key: 'tone',
    label: '톤앤매너',
    description: '내레이션과 자막의 화법입니다. 기획안 텍스트 프롬프트로 나갑니다.',
    options: [
      { key: 'friendly-mom', label: '다정한 엄마 친구', description: '옆집 선배맘처럼 공감하는 화법' },
      { key: 'expert-trust', label: '전문가 신뢰형', description: '근거, 데이터를 차분하고 명료하게 전달' },
      { key: 'reassuring', label: '안심, 다독임', description: '불안, 죄책감을 덜어주는 위로형 화법' },
      { key: 'honest-transparent', label: '정직, 투명(클린 커뮤니케이션)', description: '성분, 정보를 과장 없이 담백하게 전달' },
      { key: 'baby-first-person', label: '아기 1인칭 시점', description: '아기가 자기 니즈를 말하는 위트 있는 화법' },
      { key: 'witty-empathy', label: '위트, 공감 개그', description: '육아 현실을 유쾌하게 공감하는 밈적 화법' },
      { key: 'info-curator', label: '정보 큐레이터', description: '핵심만 짚어주는 실용 가이드 톤' },
      { key: 'storyteller', label: '스토리텔러(경험담)', description: '실제 경험을 담담히 서사화' },
      { key: 'maternal-narration', label: '따뜻한 모성 내레이션', description: '부드럽고 신뢰감 있는 내레이션' },
      { key: 'comic-cheerful', label: '유쾌한 만화체', description: '웹툰 캐릭터의 능청스럽고 재치 있는 화법' },
      { key: 'deadpan-comic', label: '능청 개그 캐릭터', description: '진지한 상황을 뜬금없이 비트는 만담형 화법' },
      { key: 'pun-heavy', label: '드립력 만렙', description: '아재개그, 언어유희를 남발하는 위트 화법' },
    ],
  },
  {
    key: 'sound',
    label: '사운드 스타일',
    description: '배경음과 보이스의 성격입니다. 기획안 텍스트 프롬프트로 나갑니다.',
    options: [
      { key: 'calm-piano', label: '잔잔한 피아노/어쿠스틱', description: '감성적이고 따뜻한 배경음' },
      { key: 'music-box', label: '오르골/토이 멜로디', description: '동심을 연상시키는 오르골, 실로폰 사운드' },
      { key: 'water-asmr', label: '물, 거품 ASMR', description: '물소리, 거품소리 중심의 감각 사운드' },
      { key: 'female-narration', label: '따뜻한 여성 내레이션', description: '모성적이고 신뢰감 있는 보이스오버' },
      { key: 'male-narration', label: '남성 내레이션(아빠 시점)', description: '아빠 시점의 담백한 보이스오버' },
      { key: 'lofi-healing', label: '로파이 힐링', description: '부드러운 로파이 비트, 편안한 무드' },
      { key: 'minimal-ambient', label: '미니멀 앰비언트', description: '절제된 앰비언트, 프리미엄, 클리니컬 무드' },
      { key: 'bright-pop', label: '밝고 경쾌한 팝', description: '리듬감 있는 인스트루멘탈, 훅 강조' },
      { key: 'trendy-shortform', label: '트렌디 숏폼 트랙', description: '릴스, 쇼츠 인기 사운드로 확산 최적화' },
      { key: 'silent-subtitle', label: '무음+자막 강조', description: '무성 시청 대응, 자막, 효과음 위주' },
      { key: 'fairytale-orchestra', label: '동화적 오케스트라', description: '웹툰, 스토리텔링 콘텐츠에 어울리는 오케스트라' },
      { key: 'sfx-heavy', label: '과장 효과음(SFX 폭격)', description: '뿅, 띠용 등 과장된 효과음으로 코믹함 강조' },
      { key: 'retro-synth', label: '촌스러운 8090 신스', description: '복고풍 신디사이저로 병맛 무드 연출' },
    ],
  },
  {
    key: 'structure',
    label: '콘텐츠 구조',
    description: '기획안의 전개 방식입니다. 기획안 텍스트 프롬프트로 나갑니다.',
    options: [
      { key: 'hook-first', label: '훅 중심형', description: '첫 3초 임팩트로 이탈 방지' },
      { key: 'problem-solution', label: '문제-해결형', description: '문제 제기 후 해결책과 결과 제시' },
      { key: 'storytelling', label: '스토리텔링형', description: '감정 서사에 제품을 자연스럽게 녹임' },
      { key: 'review-usage', label: '후기, 실사용형', description: '실사용 경험과 전후 비교' },
      { key: 'informative', label: '정보전달형', description: '지식을 쉽고 빠르게 전달' },
      { key: 'comparison', label: '비교형', description: '전후, 타사 대비 차이를 시각화' },
      { key: 'qna-myth-busting', label: 'Q&A/오해풀기형', description: '자주 묻는 질문과 오해를 해소' },
      { key: 'tutorial', label: '사용법, 튜토리얼형', description: '설치, 사용법을 단계별로 안내' },
      { key: 'checklist-curation', label: '체크리스트, 큐레이션형', description: '저장, 공유를 유도하는 리스트형' },
      { key: 'challenge', label: '챌린지, 참여형', description: 'UGC 확산을 유도하는 참여형 콘텐츠' },
      { key: 'episodic-series', label: '에피소드 연재형', description: '웹툰처럼 이어지는 시리즈 스토리물' },
      { key: 'interview', label: '인터뷰/대담형', description: '전문가, 부모와의 대화 형식' },
      { key: 'twist-comedy', label: '반전 개그형', description: '기대를 배신하는 엔딩으로 웃음 유발' },
      { key: 'meme-challenge', label: '병맛 밈 챌린지형', description: '유행 밈 포맷을 브랜드식으로 비틀어 참여 유도' },
      { key: 'ugc-remix', label: 'UGC 재구성형', description: '고객, 체험단이 만든 콘텐츠를 브랜드가 재편집해 게시' },
    ],
  },
  {
    key: 'audience',
    label: '타겟 오디언스',
    description: '누구에게 말하는 영상인지입니다. 기획안 텍스트 프롬프트로 나갑니다.',
    options: [
      { key: 'first-time-anxious-mom', label: '초보 예민맘', description: '첫 출산, 완벽주의, 정보 검색에 몰입' },
      { key: 'expecting-mom', label: '예비맘(출산 예정)', description: '임신 중, 출산 준비로 정보 탐색 활발' },
      { key: 'research-parent', label: '정보탐색형 부모', description: '성분, 인증까지 꼼꼼히 따지는 리서치형' },
      { key: 'premium-parent', label: '프리미엄 지향 부모', description: '소득 여유, 최고의 것을 아이에게' },
      { key: 'practical-parent', label: '실용주의 부모', description: '가성비, 효율 중시, 과대광고 경계' },
      { key: 'working-parent', label: '워킹맘/워킹대디', description: '시간 부족, 간편함과 안전 동시 추구' },
      { key: 'grandparent-caregiver', label: '조부모, 공동양육자', description: '손주 돌봄, 쉬운 설명 선호' },
      { key: 'multi-child-parent', label: '다자녀 부모', description: '경험 많음, 대용량, 재구매 선호' },
      { key: 'sensitive-skin-parent', label: '알러지, 민감피부 케어형', description: '아토피 경험, 저자극, 무첨가에 민감' },
      { key: 'overseas-korean-parent', label: '해외거주 교민 부모', description: '해외에서 국내 육아정보, 제품 탐색' },
      { key: 'meme-savvy-parent', label: '밈 친화 육아 커뮤니티 부모', description: '인터넷 밈에 익숙하고 유쾌한 콘텐츠를 선호하는 층' },
    ],
  },
  {
    key: 'purpose',
    label: '목적 유형',
    description: '이 영상으로 무엇을 얻으려는지입니다. 기획안 텍스트 프롬프트로 나갑니다.',
    options: [
      { key: 'viral-humor', label: '웃음 유발 바이럴', description: '재미로 공유, 확산시키는 것이 목적인 콘텐츠' },
      { key: 'brand-awareness', label: '브랜드 인지', description: '브랜드 철학과 감성으로 각인' },
      { key: 'sales-conversion', label: '판매 전환', description: '후기, 비교, CTA로 즉시 구매 유도' },
      { key: 'product-launch', label: '신제품 런칭', description: '신제품 차별점 소구' },
      { key: 'promotion-event', label: '프로모션, 이벤트', description: '할인, 증정 등 즉각 반응 유도' },
      { key: 'usage-education', label: '사용법 교육', description: '설치, 안전 사용법 안내' },
      { key: 'trust-safety', label: '신뢰, 안전성 소구', description: '시험 데이터, 인증으로 안심 제공' },
      { key: 'awareness-education', label: '정보, 교육(계몽)', description: '카테고리 자체의 중요성을 알림' },
      { key: 'community-building', label: '커뮤니티, 관계 형성', description: '육아 공감, 챌린지로 팬덤 구축' },
      { key: 'retargeting-repurchase', label: '리타겟팅, 재구매', description: '필터 교체 주기 등 재구매 유도' },
      { key: 'series-subscription', label: '시리즈 구독 유도', description: '웹툰 연재형 콘텐츠로 구독, 팔로우 유도' },
      { key: 'ugc-generation', label: 'UGC 생상유도(체험단 운영)', description: '체험단, 서포터즈 모집으로 리뷰 콘텐츠 확보가 목적' },
    ],
  },
];

/** 선택(axis/option)의 화면과 프롬프트 문구. 카탈로그에 없으면 null */
export function resolveConceptText(
  axisKey: string,
  optionKey: string,
): { label: string; note: string } | null {
  if (!optionKey) return null;
  const axis = BRAND_CONCEPT_AXES.find((a) => a.key === axisKey);
  const option = axis?.options.find((o) => o.key === optionKey);
  return option ? { label: option.label, note: option.description } : null;
}
