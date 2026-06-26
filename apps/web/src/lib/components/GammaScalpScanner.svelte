<script lang="ts">
	import type { GammaScalpMode, GammaScalpScannerState } from '@gammax/contracts';

	let { scan }: { scan: GammaScalpScannerState | null } = $props();

	const rows = $derived(scan?.rows ?? []);

	const MODE_LABEL: Record<GammaScalpMode, string> = {
		long_gamma: 'long γ',
		short_gamma: 'short γ',
		neutral: '—'
	};

	function bn(v: number): string {
		return `${(v / 1e9).toFixed(2)}`;
	}
	function ratio(v: number | null): string {
		return v == null ? '—' : v.toFixed(2);
	}
	function pct(v: number | null): string {
		return v == null ? '—' : `${v.toFixed(2)}%`;
	}
	function range(lo: number | null, hi: number | null): string {
		return lo == null || hi == null ? '—' : `${lo.toFixed(0)}–${hi.toFixed(0)}`;
	}
</script>

<div class="scanner">
	{#if rows.length === 0}
		<p class="empty">scoring gamma-scalp conditions…</p>
	{:else}
		<table class="mono">
			<thead>
				<tr>
					<th>sym</th>
					<th>mode</th>
					<th class="r">score</th>
					<th class="r">net γ</th>
					<th class="r">rv/iv</th>
					<th class="r">exp move</th>
					<th class="r">range</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as r (r.symbol)}
					<tr>
						<td class="sym">{r.symbol}</td>
						<td><span class="badge {r.mode}">{MODE_LABEL[r.mode]}</span></td>
						<td class="r score">
							<span class="bar" style="--w:{r.score}%"></span>
							<span class="val">{r.score}</span>
						</td>
						<td class="r" class:neg={r.netGex < 0}>{bn(r.netGex)}</td>
						<td class="r" class:hot={(r.rvIvRatio ?? 0) > 1}>{ratio(r.rvIvRatio)}</td>
						<td class="r dim">{pct(r.expectedMovePct)}</td>
						<td class="r dim">{range(r.rangeLow, r.rangeHigh)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>

<style>
	.scanner {
		inline-size: 100%;
		overflow-x: auto;
	}
	table {
		inline-size: 100%;
		border-collapse: collapse;
		font-size: 11px;
	}
	th {
		text-align: left;
		font-weight: 600;
		color: var(--ink-faint);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-size: 9px;
		padding: 4px 8px;
		border-block-end: 1px solid var(--border);
	}
	td {
		padding: 5px 8px;
		border-block-end: 1px solid color-mix(in oklch, var(--border), transparent 50%);
	}
	.r {
		text-align: right;
	}
	.sym {
		font-weight: 700;
		color: var(--ink);
	}
	.dim {
		color: var(--ink-faint);
	}
	.neg {
		color: var(--put);
	}
	.hot {
		color: var(--warn);
	}
	.score {
		position: relative;
		min-inline-size: 64px;
	}
	.score .bar {
		position: absolute;
		inset-block: 3px;
		inset-inline-end: 26px;
		inline-size: var(--w);
		max-inline-size: calc(100% - 28px);
		background: linear-gradient(
			90deg,
			color-mix(in oklch, var(--accent), transparent 70%),
			var(--accent)
		);
		border-radius: 2px;
		opacity: 0.55;
	}
	.score .val {
		position: relative;
		font-weight: 700;
	}
	.badge {
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-size: 9px;
		font-weight: 700;
		padding-block: 2px;
		padding-inline: 7px;
		border-radius: 999px;
	}
	.badge.long_gamma {
		background: color-mix(in oklch, var(--call), transparent 74%);
		color: var(--call);
	}
	.badge.short_gamma {
		background: color-mix(in oklch, var(--flip), transparent 74%);
		color: var(--flip);
	}
	.badge.neutral {
		background: oklch(0.26 0.014 262 / 0.6);
		color: var(--ink-faint);
	}
	.empty {
		color: var(--ink-faint);
		padding-block: 28px;
		text-align: center;
	}
</style>
