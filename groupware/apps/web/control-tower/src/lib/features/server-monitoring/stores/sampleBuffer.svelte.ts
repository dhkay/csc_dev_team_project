/**
 * 시계열 샘플 링버퍼 (Svelte 5 runes 싱글톤)
 * 그리드 폴링(TanStack Query)이 새 스냅샷을 받을 때마다 push() 로 호스트별 최근 N샘플을 누적한다.
 * 그래프의 시간축 = 이 버퍼. DB 없음. 페이지 이탈/새로고침 시 리셋
 */
import type { MetricSample, ServerWithStatus } from '../types';

const MAX_SAMPLES = 60; // 3s 간격 ≈ 3분

const avg = (xs: number[]): number =>
  xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0;

class SampleBuffer {
  /** 호스트 id → 시계열 샘플 */
  history = $state<Record<string, MetricSample[]>>({});
  #lastTs: Record<string, string> = {};

  reset(): void {
    this.history = {};
    this.#lastTs = {};
  }

  /** 폴링 스냅샷을 버퍼에 반영(같은 timestamp 중복 push 방지) */
  push(servers: ServerWithStatus[]): void {
    const next: Record<string, MetricSample[]> = { ...this.history };
    for (const s of servers) {
      if (s.status !== 'online' || !s.metrics) continue;
      const m = s.metrics;
      if (this.#lastTs[s.id] === m.timestamp) continue; // 동일 스냅샷 중복 방지
      this.#lastTs[s.id] = m.timestamp;
      const hasGpu = m.gpus.length > 0;
      const arr = next[s.id] ? [...next[s.id]] : [];
      arr.push({
        t: new Date(m.timestamp),
        cpu: m.cpu.percent,
        ram: m.memory.percent,
        disk: m.disk ? m.disk.percent : null,
        gpu: hasGpu ? avg(m.gpus.map((g) => g.utilPercent)) : null,
        vram: hasGpu ? avg(m.gpus.map((g) => g.memPercent)) : null,
      });
      if (arr.length > MAX_SAMPLES) arr.splice(0, arr.length - MAX_SAMPLES);
      next[s.id] = arr;
    }
    this.history = next;
  }
}

export const sampleBuffer = new SampleBuffer();
