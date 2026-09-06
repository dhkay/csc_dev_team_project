// v1.0 응답의 씬 어휘. 이 버전만의 것이라 파일이 갈려 있다.
// 이미지→영상 씬은 sourceDirection, subtitle, narration, imagePrompt + 인포그래픽 + 효과음
// 한 파서가 두 버전 필드를 다 읽던 동안 imagePrompt 폴백이 v1.5 결과에도 걸렸다.
import {
  PlanInfographicEntity,
  PlanSceneEntity,
  PlanSfxEntity,
} from '../../../../core/domain';
import { AudioAssetCandidate } from '../../../../core/application/ports/outbound';
import { snapshot, str } from '../plan-response-parse';

// 비어있지 않은 문자열 배열. 읽는 곳이 아래 인포그래픽 파싱뿐이라 공유 자리에 두지 않음
function strArray(v: unknown): string[] {
  return (Array.isArray(v) ? v : []).map(str).filter((s) => s.length > 0);
}

/**
 * LLM 씬 객체를 도메인 씬(v1.0 스키마)으로 변환
 * sfxById 는 선택된 id 를 스냅샷으로 enrich 하고 검증하는 후보 맵(삽입 순서가 sortOrder)
 */
export function toScene(
  raw: unknown,
  idx: number,
  sfxById: Map<number, AudioAssetCandidate>,
): PlanSceneEntity {
  const o = (raw ?? {}) as Record<string, unknown>;
  const sourceDirection = str(o.sourceDirection);
  const scene: PlanSceneEntity = {
    index: idx + 1, // 1-base 재부여. LLM 이 준 index 는 무시하고 순서만 신뢰
    sourceDirection,
    subtitle: str(o.subtitle),
    narration: str(o.narration),
    // 이미지 프롬프트가 씬 이미지의 전부라 누락되면 장면이 통째로 사라짐
    // LLM 이 빠뜨리면 한국어 연출이라도 넘김(품질은 떨어져도 무관한 그림보다 나음)
    imagePrompt: str(o.imagePrompt) || sourceDirection,
  };
  const info = toInfographic(o.infographic);
  if (info) scene.infographic = info;
  const sfx = toSfxList(o.sfx, sfxById);
  if (sfx.length > 0) scene.sfx = sfx;
  return scene;
}

/**
 * 씬 효과음 목록 파싱. 후보에 있는 것만 스냅샷으로 남기고 무효 id 는 드롭
 * offsetSec 은 부호 있는 값 그대로 보존(음수는 전환에 걸침)하고 비정상만 0
 * 렌더가 앵커 씬 시작 + offsetSec 으로 절대 시각을 만들고 전체 길이로만 클램프
 */
function toSfxList(raw: unknown, byId: Map<number, AudioAssetCandidate>): PlanSfxEntity[] {
  const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const out: PlanSfxEntity[] = [];
  for (const item of arr) {
    const o = (item ?? {}) as Record<string, unknown>;
    const id = Number(o.assetId);
    const c = Number.isInteger(id) ? byId.get(id) : undefined;
    if (!c) continue;
    const off = Number(o.offsetSec);
    const offsetSec = Number.isFinite(off) ? off : 0;
    out.push({ ...snapshot(c), offsetSec });
  }
  return out;
}

/**
 * LLM 인포그래픽(다형) 파싱. type 으로 디스패치하고 형태별 필드를 검증, 불량은 null
 * type 이 없고 items 가 있으면 list 로 폴백(구 저장분과 LLM 누락 무중단)
 * 새 형태 추가는 case 하나 + 엔티티 유니온 멤버 + 렌더러 레지스트리
 */
function toInfographic(raw: unknown): PlanInfographicEntity | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const title = str(o.title);
  const type = str(o.type) || (Array.isArray(o.items) ? 'list' : '');
  const obj = (v: unknown): Record<string, unknown> => (v ?? {}) as Record<string, unknown>;

  switch (type) {
    case 'list': {
      const items = strArray(o.items);
      return items.length > 0 ? { type: 'list', title, items } : null;
    }
    case 'table': {
      const columns = strArray(o.columns);
      const rows = (Array.isArray(o.rows) ? o.rows : []).map(strArray).filter((r) => r.length > 0);
      return columns.length > 0 && rows.length > 0 ? { type: 'table', title, columns, rows } : null;
    }
    case 'bar': {
      const bars = (Array.isArray(o.bars) ? o.bars : [])
        .map((b) => ({ label: str(obj(b).label), value: Number(obj(b).value) }))
        .filter((b) => b.label.length > 0 && Number.isFinite(b.value));
      const unit = str(o.unit);
      return bars.length > 0 ? { type: 'bar', title, bars, ...(unit ? { unit } : {}) } : null;
    }
    case 'comparison': {
      const side = (v: unknown) => ({ heading: str(obj(v).heading), points: strArray(obj(v).points) });
      const left = side(o.left);
      const right = side(o.right);
      const ok = (s: { heading: string; points: string[] }) =>
        s.heading.length > 0 || s.points.length > 0;
      return ok(left) && ok(right) ? { type: 'comparison', title, left, right } : null;
    }
    case 'steps': {
      const steps = strArray(o.steps);
      return steps.length > 0 ? { type: 'steps', title, steps } : null;
    }
    case 'stat': {
      const stats = (Array.isArray(o.stats) ? o.stats : [])
        .map((s) => ({ value: str(obj(s).value), label: str(obj(s).label) }))
        .filter((s) => s.value.length > 0);
      return stats.length > 0 ? { type: 'stat', title, stats } : null;
    }
    case 'timeline': {
      const events = (Array.isArray(o.events) ? o.events : [])
        .map((e) => ({ time: str(obj(e).time), label: str(obj(e).label) }))
        .filter((e) => e.label.length > 0);
      return events.length > 0 ? { type: 'timeline', title, events } : null;
    }
    default:
      return null;
  }
}

/** 기획안당 인포그래픽 최대 1개. 첫 인포그래픽 씬만 남기고 제거(LLM 남발 방어) */
export function capInfographicsToOne(scenes: PlanSceneEntity[]): void {
  let seen = false;
  for (const s of scenes) {
    if (!s.infographic) continue;
    if (seen) delete s.infographic;
    else seen = true;
  }
}
