<script lang="ts">
	import type { GammaSurface, Signal } from '@gammax/contracts';

	let { surface, pinpop }: { surface: GammaSurface | undefined; pinpop: Signal | undefined } =
		$props();

	const flipDistPct = $derived(
		surface && surface.gammaFlip != null
			? ((surface.spot - surface.gammaFlip) / surface.spot) * 100
			: null
	);
	const pin = $derived(
		pinpop && (pinpop.kind === 'pin' || pinpop.kind === 'pop') ? pinpop : undefined
	);
</script>

<div class="levels">
	{#if surface}
		<div class="regime {surface.regime}">
			<span class="tag">{surface.regime} gamma</span>
			<span class="mono net">{(surface.netGex / 1e9).toFixed(2)} B$ / 1%</span>
		</div>
		<dl>
			<div>
				<dt>spot</dt>
				<dd class="mono">{surface.spot.toFixed(0)}</dd>
			</div>
			<div>
				<dt>γ-flip</dt>
				<dd class="mono">
					{surface.gammaFlip != null ? surface.gammaFlip.toFixed(0) : '—'}
					{#if flipDistPct != null}<span class="dim"
							>({flipDistPct >= 0 ? '+' : ''}{flipDistPct.toFixed(2)}%)</span
						>{/if}
				</dd>
			</div>
			<div>
				<dt>call wall</dt>
				<dd class="mono call">{surface.callWall ?? '—'}</dd>
			</div>
			<div>
				<dt>put wall</dt>
				<dd class="mono put">{surface.putWall ?? '—'}</dd>
			</div>
			<div>
				<dt>vol trigger</dt>
				<dd class="mono dim">
					{surface.volTrigger != null ? surface.volTrigger.toFixed(0) : '—'}
					<span class="est">est</span>
				</dd>
			</div>
		</dl>
		{#if pin}
			<div class="pinpop {pin.kind}">
				<strong>{pin.kind.toUpperCase()}</strong>
				<span class="mono"
					>@ {pin.kind === 'pin' || pin.kind === 'pop' ? pin.payload.strike : ''}</span
				>
				<span class="dim">late-session 0DTE</span>
			</div>
		{/if}
	{:else}
		<p class="empty">waiting for combined surface…</p>
	{/if}
</div>

<style>
	.levels {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.regime {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 12px;
		border-radius: var(--radius);
		border: 1px solid var(--border);
	}
	.regime.positive {
		background: color-mix(in oklch, var(--call), transparent 86%);
	}
	.regime.negative {
		background: color-mix(in oklch, var(--put), transparent 86%);
	}
	.tag {
		text-transform: uppercase;
		font-size: 12px;
		letter-spacing: 0.06em;
		font-weight: 600;
	}
	.net {
		font-size: 12px;
		color: var(--ink-dim);
	}
	dl {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px 16px;
		margin: 0;

		& > div {
			display: flex;
			justify-content: space-between;
			border-bottom: 1px dotted var(--border);
			padding-block-end: 4px;
		}
	}
	dt {
		color: var(--ink-faint);
		font-size: 11px;
	}
	dd {
		margin: 0;
		font-size: 13px;
	}
	.call {
		color: var(--call);
	}
	.put {
		color: var(--put);
	}
	.dim {
		color: var(--ink-faint);
	}
	.est {
		font-size: 9px;
		opacity: 0.7;
	}
	.pinpop {
		display: flex;
		gap: 10px;
		align-items: center;
		padding: 8px 12px;
		border-radius: var(--radius);
		font-size: 12px;
	}
	.pinpop.pin {
		background: color-mix(in oklch, var(--call), transparent 82%);
	}
	.pinpop.pop {
		background: color-mix(in oklch, var(--put), transparent 82%);
	}
	.empty {
		color: var(--ink-faint);
		padding-block: 28px;
		text-align: center;
	}
</style>
