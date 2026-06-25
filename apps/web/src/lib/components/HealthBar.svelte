<script lang="ts">
	import type { FeedStatus } from '@gammax/contracts';

	let {
		status,
		connected,
		lastMessageTs
	}: { status: FeedStatus | null; connected: boolean; lastMessageTs: number | null } = $props();

	let now = $state(Date.now());
	$effect(() => {
		const id = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(id);
	});

	const ageSec = $derived(lastMessageTs != null ? Math.round((now - lastMessageTs) / 1000) : null);
</script>

<div class="health">
	<span class="dot" class:on={connected} class:off={!connected}></span>
	<span class="mono">{connected ? 'connected' : 'disconnected'}</span>
	<span class="sep">·</span>
	<span class="mono">feed {status?.source ?? '—'}</span>
	<span class="badge" class:delayed={status?.delayed} class:rt={!status?.delayed}>
		{status?.delayed ? 'delayed 15m' : 'realtime'}
	</span>
	<span class="sep">·</span>
	<span class="mono dim">symbols {status?.symbolsSubscribed ?? 0}</span>
	<span class="sep">·</span>
	<span class="mono dim">rate {status?.rateRemaining != null ? status.rateRemaining : '—'}</span>
	<span class="sep">·</span>
	<span class="mono dim">updated {ageSec != null ? `${ageSec}s ago` : '—'}</span>
</div>

<style>
	.health {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		font-size: 11px;
		padding: 8px 14px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: linear-gradient(180deg, var(--panel-1), var(--panel-0));
		box-shadow: var(--shadow);
	}
	.dot {
		inline-size: 8px;
		block-size: 8px;
		border-radius: 999px;
	}
	.dot.on {
		background: var(--ok);
		box-shadow: 0 0 8px var(--ok);
	}
	.dot.off {
		background: var(--bad);
	}
	.sep {
		color: var(--ink-faint);
	}
	.dim {
		color: var(--ink-faint);
	}
	.badge {
		font-size: 10px;
		padding-block: 1px;
		padding-inline: 6px;
		border-radius: 999px;
	}
	.badge.rt {
		background: color-mix(in oklch, var(--ok), transparent 80%);
		color: var(--ok);
	}
	.badge.delayed {
		background: color-mix(in oklch, var(--warn), transparent 78%);
		color: var(--warn);
	}
</style>
