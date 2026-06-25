<script lang="ts">
	import type { Signal, SignalOutcome } from '@gammax/contracts';
	import {
		ArrowsClockwise,
		ArrowsOut,
		Lightning,
		Pulse,
		PushPin,
		Stack,
		TrendDown,
		Wall
	} from 'phosphor-svelte';

	let { signals, outcomes }: { signals: Signal[]; outcomes: Record<string, SignalOutcome> } =
		$props();

	const ICONS = {
		iv_explosion: Lightning,
		iv_implosion: TrendDown,
		gamma_regime_flip: ArrowsClockwise,
		wall_test: Wall,
		pin: PushPin,
		pop: ArrowsOut,
		flow_divergence: Pulse,
		composite: Stack
	} as const;

	function label(s: Signal): string {
		return s.kind === 'composite' ? s.payload.name : s.kind.replace(/_/g, ' ');
	}

	function fmtTime(ts: number): string {
		return new Date(ts).toLocaleTimeString('en-US', { hour12: false });
	}
</script>

<div class="feed">
	{#if signals.length === 0}
		<p class="empty">no signals yet…</p>
	{/if}
	{#each signals as s (s.id)}
		{@const Icon = ICONS[s.kind]}
		{@const outcome = outcomes[s.id]}
		<article class="card {s.kind}">
			<span class="icon {s.kind}"><Icon size={16} weight="bold" /></span>
			<div class="body">
				<div class="top">
					<strong>{label(s)}</strong>
					<span class="under mono">{s.underlying}</span>
					<span class="time mono">{fmtTime(s.ts)}</span>
				</div>
				<div class="conf" title="confidence">
					<div class="bar" style:inline-size="{Math.round(s.confidence * 100)}%"></div>
				</div>
				{#if outcome}
					<div class="outcome {outcome.result}">
						<span>{outcome.result}</span>
						<span class="dim">{outcome.detail.note}</span>
					</div>
				{/if}
			</div>
		</article>
	{/each}
</div>

<style>
	.feed {
		display: flex;
		flex-direction: column;
		gap: 8px;
		overflow-y: auto;
		max-block-size: 420px;
	}
	.card {
		display: flex;
		gap: 10px;
		padding: 9px 11px;
		border: 1px solid var(--border);
		border-inline-start: 3px solid var(--accent);
		border-radius: 10px;
		background: linear-gradient(180deg, oklch(0.25 0.016 262 / 0.85), oklch(0.21 0.015 262 / 0.85));
		transition:
			transform 0.12s ease,
			border-color 0.12s ease;
	}
	.card:hover {
		transform: translateX(2px);
		border-inline-start-color: var(--accent);
	}
	.card.iv_explosion {
		border-inline-start-color: var(--warn);
	}
	.card.iv_implosion {
		border-inline-start-color: var(--accent);
	}
	.card.wall_test,
	.card.pop {
		border-inline-start-color: var(--put);
	}
	.card.pin {
		border-inline-start-color: var(--call);
	}
	.card.gamma_regime_flip {
		border-inline-start-color: var(--flip);
	}
	.icon {
		display: grid;
		place-items: center;
		inline-size: 28px;
		block-size: 28px;
		border-radius: 8px;
		color: var(--bg-0);
		background: var(--accent);
		flex-shrink: 0;
	}
	.icon.iv_explosion {
		background: var(--warn);
	}
	.icon.wall_test,
	.icon.pop {
		background: var(--put);
	}
	.icon.pin {
		background: var(--call);
	}
	.body {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	.top {
		display: flex;
		align-items: baseline;
		gap: 8px;
	}
	.top strong {
		text-transform: capitalize;
		font-size: 12.5px;
	}
	.under {
		font-size: 11px;
		color: var(--ink-dim);
	}
	.time {
		margin-inline-start: auto;
		font-size: 10px;
		color: var(--ink-faint);
	}
	.conf {
		block-size: 4px;
		background: var(--border);
		border-radius: 999px;
		overflow: hidden;
	}
	.conf .bar {
		block-size: 100%;
		background: var(--accent);
	}
	.outcome {
		display: flex;
		gap: 8px;
		font-size: 11px;
		text-transform: capitalize;
	}
	.outcome.confirmed {
		color: var(--ok);
	}
	.outcome.rejected {
		color: var(--bad);
	}
	.outcome.inconclusive,
	.outcome.partial {
		color: var(--meh);
	}
	.dim {
		color: var(--ink-faint);
		text-transform: none;
	}
	.empty {
		color: var(--ink-faint);
		padding-block: 28px;
		text-align: center;
	}
</style>
