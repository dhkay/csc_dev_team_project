<script lang="ts">
	// 02_화면구성.md "오각형 차트 애니메이션 사양". 역할 도메인마다 축 하나(각도 = 360/역할수,
	// Profile마다 역할 수가 다르면 각도도 달라진다), 값이 바뀌면 축마다 독립적으로 부드럽게
	// 이동한다. 이건 화면 프리뷰 레이어일 뿐이고, 승인·확정용 공식 표현은 05번 문서의 이산
	// Cell 변환을 거친 값이다(이 컴포넌트가 그 변환을 대체하지 않는다).
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';

	interface AxisValue {
		domainCode: string;
		/** 0~100 사이. 범위를 벗어나면 그려질 때 clamp된다. */
		percent: number;
	}

	interface Props {
		values: AxisValue[];
		size?: number;
	}
	let { values, size = 220 }: Props = $props();

	const clamped = $derived(values.map((v) => Math.max(0, Math.min(100, v.percent))));
	// 축 개수가 도중에 바뀌면(다른 Profile로 전환 등) 배열 길이가 달라져 보간이 실패할 수
	// 있다 — 지금은 화면 하나가 한 Profile만 다루므로 실제로는 발생하지 않는다(확인 필요).
	const animated = Tween.of(() => clamped, { duration: 300, easing: cubicOut });

	const center = $derived(size / 2);
	const radius = $derived(size / 2 - 28);
	const RING_PERCENTS = [20, 40, 60, 80, 100];

	function pointAt(index: number, count: number, percent: number): { x: number; y: number } {
		// 12시 방향에서 시작해 시계 방향으로 배치한다(어느 방향이든 프리뷰 표현이라 무관).
		const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
		const r = (percent / 100) * radius;
		return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) };
	}

	function ringPoints(percent: number): string {
		return values.map((_, i) => {
			const p = pointAt(i, values.length, percent);
			return `${p.x},${p.y}`;
		}).join(' ');
	}

	const axisPoints = $derived(values.map((_, i) => pointAt(i, values.length, 100)));
	const labelPoints = $derived(values.map((v, i) => ({ ...pointAt(i, values.length, 118), domainCode: v.domainCode })));
	const polygonPoints = $derived(
		values.map((_, i) => {
			const p = pointAt(i, values.length, animated.current[i] ?? 0);
			return `${p.x},${p.y}`;
		}).join(' ')
	);
</script>

{#if values.length >= 3}
	<svg width={size} height={size} viewBox="0 0 {size} {size}" role="img" aria-label="역할 도메인 오각형 차트">
		{#each RING_PERCENTS as ring (ring)}
			<polygon points={ringPoints(ring)} fill="none" stroke="#e5e7eb" stroke-width="1" />
		{/each}
		{#each axisPoints as p, i (values[i].domainCode)}
			<line x1={center} y1={center} x2={p.x} y2={p.y} stroke="#e5e7eb" stroke-width="1" />
		{/each}
		<polygon points={polygonPoints} fill="#1868db" fill-opacity="0.22" stroke="#1868db" stroke-width="2" />
		{#each labelPoints as p (p.domainCode)}
			<text x={p.x} y={p.y} font-size="11" fill="#6b7280" text-anchor="middle" dominant-baseline="middle">
				{p.domainCode}
			</text>
		{/each}
	</svg>
{/if}
