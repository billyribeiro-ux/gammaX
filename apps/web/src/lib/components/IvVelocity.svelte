<script lang="ts">
	import type { IvSample, IvState } from '@gammax/contracts';
	import { line, scaleLinear } from 'd3';

	let { iv, zThreshold = 2 }: { iv: IvState | undefined; zThreshold?: number } = $props();

	const W = 540;
	const H = 240;
	const M = { top: 12, right: 16, bottom: 22, left: 46 };

	const model = $derived.by(() => {
		if (!iv || iv.series.length < 2) return null;
		const s = iv.series;
		const xs = s.map((p) => p.ts);
		const vals = s.flatMap((p) => [p.atmIv0dte, p.atmIvCm30]).filter((v): v is number => v != null);
		if (vals.length === 0) return null;
		const x = scaleLinear()
			.domain([Math.min(...xs), Math.max(...xs)])
			.range([M.left, W - M.right]);
		const y = scaleLinear()
			.domain([Math.min(...vals) * 0.97, Math.max(...vals) * 1.03])
			.range([H - M.bottom, M.top]);
		const p0 = line<IvSample>()
			.defined((p) => p.atmIv0dte != null)
			.x((p) => x(p.ts))
			.y((p) => y(p.atmIv0dte as number))(s);
		const pcm = line<IvSample>()
			.defined((p) => p.atmIvCm30 != null)
			.x((p) => x(p.ts))
			.y((p) => y(p.atmIvCm30 as number))(s);
		return { p0: p0 ?? '', pcm: pcm ?? '', ticks: y.ticks(4), y };
	});

	const state = $derived.by(() => {
		const z = iv?.zScore ?? null;
		if (z === null) return { label: 'no data', cls: 'calm' };
		if (z > zThreshold) return { label: 'explosion', cls: 'explosion' };
		if (z < -zThreshold) return { label: 'implosion', cls: 'implosion' };
		return { label: 'calm', cls: 'calm' };
	});
</script>

<div class="iv">
	<div class="readout">
		<span class="badge {state.cls}">{state.label}</span>
		<span class="mono">z {iv?.zScore != null ? iv.zScore.toFixed(2) : '—'}</span>
		<span class="mono"
			>roc {iv?.rocPctPerMin != null ? `${iv.rocPctPerMin.toFixed(2)}%/m` : '—'}</span
		>
		<span class="mono dim"
			>0dte {iv?.atmIv0dte != null ? `${(iv.atmIv0dte * 100).toFixed(1)}%` : '—'}</span
		>
		<span class="mono dim"
			>cm30 {iv?.atmIvCm30 != null ? `${(iv.atmIvCm30 * 100).toFixed(1)}%` : '—'}</span
		>
	</div>
	{#if model}
		<svg
			viewBox="0 0 {W} {H}"
			preserveAspectRatio="xMidYMid meet"
			role="img"
			aria-label="IV velocity"
		>
			{#each model.ticks as t (t)}
				<text x={M.left - 6} y={model.y(t) + 3} class="tick" text-anchor="end"
					>{(t * 100).toFixed(0)}</text
				>
			{/each}
			<path d={model.pcm} class="cm30" />
			<path d={model.p0} class="dte0" />
		</svg>
	{:else}
		<p class="empty">collecting IV samples…</p>
	{/if}
</div>

<style>
	.readout {
		display: flex;
		gap: 12px;
		align-items: center;
		flex-wrap: wrap;
		font-size: 11px;
	}
	.badge {
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-size: 10px;
		padding-block: 2px;
		padding-inline: 8px;
		border-radius: 999px;
		font-weight: 600;
	}
	.explosion {
		background: color-mix(in oklch, var(--warn), transparent 75%);
		color: var(--warn);
	}
	.implosion {
		background: color-mix(in oklch, var(--accent), transparent 75%);
		color: var(--accent);
	}
	.calm {
		background: var(--bg-elev);
		color: var(--ink-faint);
	}
	.dim {
		color: var(--ink-faint);
	}
	svg {
		inline-size: 100%;
		block-size: auto;
		display: block;
	}
	.tick {
		fill: var(--ink-faint);
		font-size: 9px;
		font-family: var(--mono);
	}
	.dte0 {
		fill: none;
		stroke: var(--warn);
		stroke-width: 1.6;
	}
	.cm30 {
		fill: none;
		stroke: var(--ink-dim);
		stroke-width: 1.4;
		stroke-dasharray: 4 3;
	}
	.empty {
		color: var(--ink-faint);
		padding-block: 28px;
		text-align: center;
	}
</style>
