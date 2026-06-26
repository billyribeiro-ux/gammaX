<script lang="ts">
	import type { IvScannerState } from '@gammax/contracts';

	let { scan }: { scan: IvScannerState | null } = $props();

	const rows = $derived(scan?.rows ?? []);

	function pct(v: number | null): string {
		return v == null ? '—' : `${(v * 100).toFixed(1)}%`;
	}
	function num(v: number | null, dp = 2): string {
		return v == null ? '—' : v.toFixed(dp);
	}
</script>

<div class="scanner">
	{#if rows.length === 0}
		<p class="empty">collecting IV velocity…</p>
	{:else}
		<table class="mono">
			<thead>
				<tr>
					<th>sym</th>
					<th>state</th>
					<th class="r">z</th>
					<th class="r">roc</th>
					<th class="r">0dte</th>
					<th class="r">cm30</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as r (r.symbol)}
					<tr>
						<td class="sym">{r.symbol}</td>
						<td><span class="badge {r.state}">{r.state}</span></td>
						<td class="r z" class:up={(r.zScore ?? 0) > 0} class:down={(r.zScore ?? 0) < 0}>
							{num(r.zScore)}
						</td>
						<td class="r">{r.rocPctPerMin == null ? '—' : `${num(r.rocPctPerMin)}%/m`}</td>
						<td class="r">{pct(r.atmIv0dte)}</td>
						<td class="r dim">{pct(r.atmIvCm30)}</td>
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
	.z.up {
		color: var(--warn);
	}
	.z.down {
		color: var(--accent);
	}
	.badge {
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-size: 9px;
		font-weight: 700;
		padding-block: 2px;
		padding-inline: 7px;
		border-radius: 999px;
	}
	.badge.explosion {
		background: color-mix(in oklch, var(--warn), transparent 74%);
		color: var(--warn);
	}
	.badge.implosion {
		background: color-mix(in oklch, var(--accent), transparent 74%);
		color: var(--accent);
	}
	.badge.calm {
		background: oklch(0.26 0.014 262 / 0.6);
		color: var(--ink-faint);
	}
	.empty {
		color: var(--ink-faint);
		padding-block: 28px;
		text-align: center;
	}
</style>
