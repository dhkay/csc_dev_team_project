// 텍스트 오버레이 스타일 공유 커널: 최종 영상의 상단 제목과 하단 자막의 표현
// 내용(자막 트랙)은 원천 합성이 만들고 여기엔 표현만 담아 스튜디오가 스타일만 바꿔 재렌더
// marketingdb marketing_video_finals.overlays(jsonb, FinalOverlaysJson) 와 동형

/**
 * 구역(제목/자막) 뒤에 깔리는 직사각형. 기하는 캔버스 대비 %(해상도 독립)
 * 미지정이면 렌더러가 구역 기본(제목은 상단 띠, 자막은 하단 띠)을 사용
 */
export interface OverlayBand {
  // 배경색 '#RRGGBB'
  color?: string;
  // 불투명도 %(미지정이면 렌더러 기본 = 불투명)
  opacityPct?: number;
  // 좌상단 x: 캔버스 폭 %
  xPct?: number;
  // 좌상단 y: 캔버스 높이 %
  yPct?: number;
  // 폭: 캔버스 폭 %
  widthPct?: number;
  // 높이: 캔버스 높이 %
  heightPct?: number;
}

/** 텍스트 오버레이 스타일. 해상도 독립(sizePct = 캔버스 높이 %) */
export interface TextOverlayStyle {
  // 폰트 자산 file-upload id. 지정 시 FINALIZE 가 fetch 해 번인, 미지정이면 번들 폴백
  fontUploadId?: string | null;
  // 논리 폰트 키(렌더러가 실제 폰트로 해석). fontUploadId 미지정 시의 폴백 힌트
  fontKey?: string;
  // 글자 크기: 캔버스 높이 대비 %
  sizePct?: number;
  // 글자색 '#RRGGBB'
  color?: string;
  // 구역 뒷배경 직사각형. null 이나 미지정이면 배경 없이 외곽선 처리
  band?: OverlayBand | null;
}

/** 최종 영상 오버레이: 상단 제목(텍스트 + 스타일), 하단 자막(스타일만, 트랙은 원천에서) */
export interface FinalOverlays {
  title: { text: string; style: TextOverlayStyle };
  subtitle: { style: TextOverlayStyle };
}

/**
 * 기본 오버레이 스펙. 제목과 자막 모두 밴드 없이 외곽선(가독성)
 * video-model ass_builder 의 방어 폴백과 수치를 맞춘 의도된 SSOT 미러
 */
function defaultFinalOverlays(title: string): FinalOverlays {
  return {
    title: {
      text: title,
      style: { fontKey: 'nanum-gothic', sizePct: 6.5, color: '#FFFFFF', band: null },
    },
    subtitle: {
      style: { fontKey: 'nanum-gothic', sizePct: 5, color: '#FFFFFF', band: null },
    },
  };
}

/**
 * 세트가 정의하는 구역별 오버레이 스타일. 세트 적용 시 FinalOverlays 로 확장
 * 편집 UI 는 배경색과 폰트만 노출하고 나머지 수치는 기본값과 렌더러가 채움
 */
export interface SetOverlayStyles {
  title: TextOverlayStyle;
  subtitle: TextOverlayStyle;
}

/** 기본 구역 스타일에 세트 오버라이드를 얹는다(제공된 필드만) */
function mergeRegion(base: TextOverlayStyle, override: TextOverlayStyle | undefined): TextOverlayStyle {
  if (!override) return base;
  // band 는 명시적 null(배경 없음)일 수 있어 undefined 일 때만 기본값 유지
  const band = override.band !== undefined ? override.band : base.band;
  return {
    ...base,
    ...(override.fontUploadId !== undefined ? { fontUploadId: override.fontUploadId } : {}),
    ...(override.fontKey !== undefined ? { fontKey: override.fontKey } : {}),
    ...(override.sizePct !== undefined ? { sizePct: override.sizePct } : {}),
    ...(override.color !== undefined ? { color: override.color } : {}),
    band,
  };
}

/**
 * 세트 구역별 스타일과 원천 영상 제목을 최종 FinalOverlays 로 변환
 * 세트에 스타일이 없으면 기본값이고 title.text 는 항상 원천 제목
 */
export function overlaysFromSet(
  title: string,
  set: SetOverlayStyles | null | undefined,
): FinalOverlays {
  const base = defaultFinalOverlays(title);
  if (!set) return base;
  return {
    title: { text: title, style: mergeRegion(base.title.style, set.title) },
    subtitle: { style: mergeRegion(base.subtitle.style, set.subtitle) },
  };
}
