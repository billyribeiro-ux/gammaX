<script lang="ts">
	import type { IvSample, IvState } from '@gammax/contracts';
	import { area, line, scaleLinear } from 'd3';

	let { iv, zThreshold = 2 }: { iv: IvState | undefined; zThreshold?: number } = $props();

	const W = 560;
	const H = 250;
	const M = { top: 14, right: 18, bottom: 22, left: 48 };

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
			.domain([Math.min(...vals) * 0.96, Math.max(...vals) * 1.04])
			.range([H - M.bottom, M.top]);
		const dte0 = line<IvSample>()
			.defined((p) => p.atmIv0dte != null)
			.x((p) => x(p.ts))
			.y((p) => y(p.atmIv0dte as number));
		const cm = line<IvSample>()
			.defined((p) => p.atmIvCm30 != null)
			.x((p) => x(p.ts))
			.y((p) => y(p.atmIvCm30 as number));
		const fill = area<IvSample>()
			.defined((p) => p.atmIv0dte != null)
			.x((p) => x(p.ts))
			.y0(H - M.bottom)
			.y1((p) => y(p.atmIv0dte as number));
		const lastPt = s[s.length - 1];
		const lastV = lastPt?.atmIv0dte ?? lastPt?.atmIvCm30 ?? null;
		return {
			p0: dte0(s) ?? '',
			pcm: cm(s) ?? '',
			pfill: fill(s) ?? '',
			ticks: y.ticks(4),
			y,
			lastX: lastPt ? x(lastPt.ts) : null,
			lastY: lastV != null ? y(lastV) : null
		};
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
		<span class="mono z">z {iv?.zScore != null ? iv.zScore.toFixed(2) : '—'}</span>
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
			<defs>
				<linearGradient id="iv-fill" x1="0" x2="0" y1="0" y2="1">
					<stop offset="0%" stop-color="var(--warn)" stop-opacity="0.35" />
					<stop offset="100%" stop-color="var(--warn)" stop-opacity="0" />
				</linearGradient>
				<filter id="iv-glow" x="-20%" y="-50%" width="140%" height="200%">
					<feGaussianBlur stdDeviation="2.4" result="b" />
					<feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
				</filter>
			</defs>
			{#each model.ticks as t (t)}
				<line x1={M.left} x2={W - M.right} y1={model.y(t)} y2={model.y(t)} class="grid" />
				<text x={M.left - 6} y={model.y(t) + 3} class="tick" text-anchor="end"
					>{(t * 100).toFixed(0)}</text
				>
			{/each}
			<path d={model.pfill} fill="url(#iv-fill)" />
			<path d={model.pcm} class="cm30" />
			<path d={model.p0} class="dte0" filter="url(#iv-glow)" />
			{#if model.lastX !== null && model.lastY !== null}
				<circle cx={model.lastX} cy={model.lastY} r="4" class="marker" filter="url(#iv-glow)" />
				<circle cx={model.lastX} cy={model.lastY} r="2" class="marker-core" />
			{/if}
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
		letter-spacing: 0.07em;
		font-size: 10px;
		padding-block: 3px;
		padding-inline: 9px;
		border-radius: 999px;
		font-weight: 700;
	}
	.explosion {
		background: color-mix(in oklch, var(--warn), transparent 72%);
		color: var(--warn);
		box-shadow: 0 0 14px -3px var(--warn);
	}
	.implosion {
		background: color-mix(in oklch, var(--accent), transparent 72%);
		color: var(--accent);
		box-shadow: 0 0 14px -3px var(--accent);
	}
	.calm {
		background: oklch(0.26 0.014 262 / 0.6);
		color: var(--ink-faint);
	}
	.z {
		color: var(--ink);
	}
	.dim {
		color: var(--ink-faint);
	}
	svg {
		inline-size: 100%;
		block-size: auto;
		display: block;
	}
	.grid {
		stroke: var(--border);
		opacity: 0.3;
	}
	.tick {
		fill: var(--ink-faint);
		font-size: 9px;
		font-family: var(--mono);
	}
	.dte0 {
		fill: none;
		stroke: var(--warn);
		stroke-width: 2;
		stroke-linejoin: round;
		stroke-linecap: round;
	}
	.cm30 {
		fill: none;
		stroke: var(--ink-dim);
		stroke-width: 1.3;
		stroke-dasharray: 4 3;
		opacity: 0.7;
	}
	.marker {
		fill: var(--warn);
		opacity: 0.5;
	}
	.marker-core {
		fill: var(--spot);
	}
	.empty {
		color: var(--ink-faint);
		padding-block: 32px;
		text-align: center;
	}
</style>
