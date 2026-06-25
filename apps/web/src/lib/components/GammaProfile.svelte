<script lang="ts">
	import type { GammaSurface } from '@gammax/contracts';
	import { scaleLinear } from 'd3';

	let { surface }: { surface: GammaSurface | undefined } = $props();

	const W = 560;
	const H = 400;
	const M = { top: 14, right: 96, bottom: 26, left: 62 };

	const model = $derived.by(() => {
		if (!surface || surface.byStrike.length === 0) return null;
		const strikes = surface.byStrike;
		const maxAbs = Math.max(1, ...strikes.map((s) => Math.abs(s.netGex)));
		const minK = Math.min(...strikes.map((s) => s.strike));
		const maxK = Math.max(...strikes.map((s) => s.strike));
		const x = scaleLinear()
			.domain([-maxAbs, maxAbs])
			.range([M.left, W - M.right]);
		const y = scaleLinear()
			.domain([minK, maxK])
			.nice()
			.range([H - M.bottom, M.top]);
		const band = Math.max(2, (H - M.bottom - M.top) / strikes.length - 1.6);
		return { strikes, x, y, x0: x(0), band, ticks: y.ticks(7), maxAbs };
	});

	const spotY = $derived(model && surface ? model.y(surface.spot) : null);
	const flipY = $derived(model && surface?.gammaFlip != null ? model.y(surface.gammaFlip) : null);
	const callY = $derived(model && surface?.callWall != null ? model.y(surface.callWall) : null);
	const putY = $derived(model && surface?.putWall != null ? model.y(surface.putWall) : null);
	const netBn = $derived(surface ? surface.netGex / 1e9 : 0);
</script>

<div class="profile">
	{#if model && surface}
		<svg
			viewBox="0 0 {W} {H}"
			preserveAspectRatio="xMidYMid meet"
			role="img"
			aria-label="Gamma profile"
		>
			<defs>
				<linearGradient id="gp-call" x1="0" x2="1" y1="0" y2="0">
					<stop offset="0%" stop-color="var(--call)" stop-opacity="0.25" />
					<stop offset="100%" stop-color="var(--call)" stop-opacity="0.95" />
				</linearGradient>
				<linearGradient id="gp-put" x1="1" x2="0" y1="0" y2="0">
					<stop offset="0%" stop-color="var(--put)" stop-opacity="0.25" />
					<stop offset="100%" stop-color="var(--put)" stop-opacity="0.95" />
				</linearGradient>
				<filter id="gp-glow" x="-50%" y="-50%" width="200%" height="200%">
					<feGaussianBlur stdDeviation="2.2" result="b" />
					<feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
				</filter>
			</defs>

			<!-- strike gridlines + labels -->
			{#each model.ticks as k (k)}
				<line x1={M.left} x2={W - M.right} y1={model.y(k)} y2={model.y(k)} class="grid" />
				<text x={M.left - 9} y={model.y(k) + 3} class="tick" text-anchor="end">{k}</text>
			{/each}

			<!-- zero axis -->
			<line x1={model.x0} x2={model.x0} y1={M.top} y2={H - M.bottom} class="axis" />

			<!-- diverging bars -->
			{#each model.strikes as s (s.strike)}
				{@const xv = model.x(s.netGex)}
				{@const isWall = s.strike === surface.callWall || s.strike === surface.putWall}
				<rect
					x={Math.min(model.x0, xv)}
					y={model.y(s.strike) - model.band / 2}
					width={Math.max(0.5, Math.abs(xv - model.x0))}
					height={model.band}
					rx={Math.min(2, model.band / 2)}
					fill={s.netGex >= 0 ? 'url(#gp-call)' : 'url(#gp-put)'}
					opacity={isWall ? 1 : 0.82}
					stroke={isWall ? (s.netGex >= 0 ? 'var(--call)' : 'var(--put)') : 'none'}
					stroke-width={isWall ? 1 : 0}
				/>
			{/each}

			<!-- put wall / call wall markers -->
			{#if callY !== null}
				<line x1={M.left} x2={W - M.right} y1={callY} y2={callY} class="wall-line call" />
				<g transform="translate({W - M.right + 4},{callY})">
					<rect x="0" y="-8" width="86" height="16" rx="8" class="pill call-pill" />
					<text x="7" y="3.5" class="pill-tx">▲ CW {surface.callWall}</text>
				</g>
			{/if}
			{#if putY !== null}
				<line x1={M.left} x2={W - M.right} y1={putY} y2={putY} class="wall-line put" />
				<g transform="translate({W - M.right + 4},{putY})">
					<rect x="0" y="-8" width="86" height="16" rx="8" class="pill put-pill" />
					<text x="7" y="3.5" class="pill-tx">▼ PW {surface.putWall}</text>
				</g>
			{/if}

			<!-- gamma flip -->
			{#if flipY !== null}
				<line
					x1={M.left}
					x2={W - M.right}
					y1={flipY}
					y2={flipY}
					class="flip"
					filter="url(#gp-glow)"
				/>
				<g transform="translate({W - M.right + 4},{flipY})">
					<rect x="0" y="-8" width="86" height="16" rx="8" class="pill flip-pill" />
					<text x="7" y="3.5" class="pill-tx">⟂ flip {surface.gammaFlip?.toFixed(0)}</text>
				</g>
			{/if}

			<!-- spot -->
			{#if spotY !== null}
				<line
					x1={M.left}
					x2={W - M.right}
					y1={spotY}
					y2={spotY}
					class="spot"
					filter="url(#gp-glow)"
				/>
				<g transform="translate({W - M.right + 4},{spotY})">
					<rect x="0" y="-8" width="86" height="16" rx="8" class="pill spot-pill" />
					<text x="7" y="3.5" class="pill-tx dark">● spot {surface.spot.toFixed(0)}</text>
				</g>
			{/if}

			<!-- net gex badge -->
			<text x={M.left} y={H - 8} class="net">
				net {netBn >= 0 ? '+' : ''}{netBn.toFixed(2)} B$/1% · {surface.regime}
			</text>
		</svg>
	{:else}
		<p class="empty">waiting for surface…</p>
	{/if}
</div>

<style>
	.profile {
		inline-size: 100%;
	}
	svg {
		inline-size: 100%;
		block-size: auto;
		display: block;
	}
	.grid {
		stroke: var(--border);
		stroke-width: 1;
		opacity: 0.35;
	}
	.axis {
		stroke: var(--ink-faint);
		stroke-width: 1.2;
	}
	.tick {
		fill: var(--ink-faint);
		font-size: 10px;
		font-family: var(--mono);
	}
	.spot {
		stroke: var(--spot);
		stroke-width: 1.4;
		stroke-dasharray: 5 3;
	}
	.flip {
		stroke: var(--flip);
		stroke-width: 1.3;
		stroke-dasharray: 2 3;
	}
	.wall-line {
		stroke-width: 1;
		stroke-dasharray: 1 4;
		opacity: 0.5;
	}
	.wall-line.call {
		stroke: var(--call);
	}
	.wall-line.put {
		stroke: var(--put);
	}
	.pill {
		stroke-width: 1;
	}
	.pill-tx {
		font-family: var(--mono);
		font-size: 9.5px;
		fill: var(--ink);
		font-weight: 600;
	}
	.pill-tx.dark {
		fill: var(--bg-0);
	}
	.call-pill {
		fill: var(--call-soft);
		stroke: var(--call);
	}
	.put-pill {
		fill: var(--put-soft);
		stroke: var(--put);
	}
	.flip-pill {
		fill: oklch(0.86 0.16 305 / 0.18);
		stroke: var(--flip);
	}
	.spot-pill {
		fill: var(--spot);
		stroke: none;
	}
	.net {
		fill: var(--ink-faint);
		font-size: 10px;
		font-family: var(--mono);
	}
	.empty {
		color: var(--ink-faint);
		padding-block: 48px;
		text-align: center;
	}
</style>
