<script lang="ts">
	import type { GammaSurface } from '@gammax/contracts';
	import { scaleLinear } from 'd3';

	let { surface }: { surface: GammaSurface | undefined } = $props();

	const W = 540;
	const H = 380;
	const M = { top: 12, right: 18, bottom: 26, left: 60 };

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
		const band = Math.max(1.5, (H - M.bottom - M.top) / strikes.length - 1.5);
		const ticks = y.ticks(6);
		return { strikes, x, y, x0: x(0), band, ticks };
	});

	const spotY = $derived(model && surface ? model.y(surface.spot) : null);
	const flipY = $derived(model && surface?.gammaFlip != null ? model.y(surface.gammaFlip) : null);
</script>

<div class="profile">
	{#if model && surface}
		<svg
			viewBox="0 0 {W} {H}"
			preserveAspectRatio="xMidYMid meet"
			role="img"
			aria-label="Gamma profile"
		>
			<line x1={model.x0} x2={model.x0} y1={M.top} y2={H - M.bottom} class="axis" />
			{#each model.ticks as k (k)}
				<text x={M.left - 8} y={model.y(k) + 3} class="tick" text-anchor="end">{k}</text>
			{/each}
			{#each model.strikes as s (s.strike)}
				{@const xv = model.x(s.netGex)}
				<rect
					x={Math.min(model.x0, xv)}
					y={model.y(s.strike) - model.band / 2}
					width={Math.abs(xv - model.x0)}
					height={model.band}
					fill={s.netGex >= 0 ? 'var(--call)' : 'var(--put)'}
					opacity="0.85"
				/>
			{/each}
			{#if spotY !== null}
				<line x1={M.left} x2={W - M.right} y1={spotY} y2={spotY} class="spot" />
				<text x={W - M.right} y={spotY - 4} class="lbl spot-lbl" text-anchor="end"
					>spot {surface.spot.toFixed(0)}</text
				>
			{/if}
			{#if flipY !== null}
				<line x1={M.left} x2={W - M.right} y1={flipY} y2={flipY} class="flip" />
				<text x={W - M.right} y={flipY + 12} class="lbl flip-lbl" text-anchor="end"
					>flip {surface.gammaFlip?.toFixed(0)}</text
				>
			{/if}
			{#if surface.callWall !== null && model}
				<text x={M.left + 4} y={model.y(surface.callWall) + 3} class="lbl wall-c"
					>▲ call wall {surface.callWall}</text
				>
			{/if}
			{#if surface.putWall !== null && model}
				<text x={M.left + 4} y={model.y(surface.putWall) + 3} class="lbl wall-p"
					>▼ put wall {surface.putWall}</text
				>
			{/if}
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
	.axis {
		stroke: var(--ink-faint);
		stroke-width: 1;
	}
	.tick {
		fill: var(--ink-faint);
		font-size: 10px;
		font-family: var(--mono);
	}
	.spot {
		stroke: var(--spot);
		stroke-width: 1.2;
		stroke-dasharray: 4 3;
	}
	.flip {
		stroke: var(--flip);
		stroke-width: 1.2;
		stroke-dasharray: 2 3;
	}
	.lbl {
		font-size: 10px;
		font-family: var(--mono);
	}
	.spot-lbl {
		fill: var(--spot);
	}
	.flip-lbl {
		fill: var(--flip);
	}
	.wall-c {
		fill: var(--call);
	}
	.wall-p {
		fill: var(--put);
	}
	.empty {
		color: var(--ink-faint);
		padding-block: 40px;
		text-align: center;
	}
</style>
