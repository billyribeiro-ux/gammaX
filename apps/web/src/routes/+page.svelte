<script lang="ts">
	import { env } from '$env/dynamic/public';
	import type { ExpiryScope, SurfaceScope } from '@gammax/contracts';
	import GammaProfile from '$lib/components/GammaProfile.svelte';
	import GammaScalpScanner from '$lib/components/GammaScalpScanner.svelte';
	import GammaSurface3D from '$lib/components/GammaSurface3D.svelte';
	import HealthBar from '$lib/components/HealthBar.svelte';
	import IvScanner from '$lib/components/IvScanner.svelte';
	import IvVelocity from '$lib/components/IvVelocity.svelte';
	import KeyLevels from '$lib/components/KeyLevels.svelte';
	import SignalFeed from '$lib/components/SignalFeed.svelte';
	import { EngineStore } from '$lib/engine/store.svelte';

	const url = env.PUBLIC_ENGINE_WS_URL ?? 'ws://localhost:8787';
	const store = new EngineStore(url);

	$effect(() => {
		store.connect();
		return () => store.disconnect();
	});

	let scope = $state<SurfaceScope>('combined');
	let expiry = $state<ExpiryScope>('all');

	const scopes: SurfaceScope[] = ['combined', 'SPX', 'SPY'];
	const expiries: ExpiryScope[] = ['all', '0dte'];

	const profileSurface = $derived(store.surface(scope, expiry));
	const combinedAll = $derived(store.surface('combined', 'all'));
	const combined0 = $derived(store.surface('combined', '0dte'));
	const combinedGrid = $derived(store.grid('combined'));
	const spxIv = $derived(store.iv('SPX'));
	const lastPinPop = $derived(store.signals.find((s) => s.kind === 'pin' || s.kind === 'pop'));
</script>

<div class="app">
	<header class="masthead">
		<h1>gamma<span>X</span> <span class="sub">S&amp;P 0DTE gamma + IV velocity</span></h1>
		<HealthBar
			status={store.status}
			connected={store.connected}
			lastMessageTs={store.lastMessageTs}
		/>
	</header>

	<div class="grid">
		<section class="panel profile">
			<header>
				<h2>combined S&amp;P gamma profile</h2>
				<div class="toggles">
					{#each scopes as s (s)}
						<button class="chip" aria-pressed={scope === s} onclick={() => (scope = s)}>{s}</button>
					{/each}
					<span class="div"></span>
					{#each expiries as e (e)}
						<button class="chip" aria-pressed={expiry === e} onclick={() => (expiry = e)}
							>{e}</button
						>
					{/each}
				</div>
			</header>
			<GammaProfile surface={profileSurface} />
		</section>

		<section class="panel surface">
			<header><h2>3D gamma surface · strike × expiry × net GEX</h2></header>
			<GammaSurface3D grid={combinedGrid} />
		</section>

		<section class="panel iv">
			<header><h2>IV velocity · SPX ATM</h2></header>
			<IvVelocity iv={spxIv} />
		</section>

		<section class="panel levels">
			<header><h2>key levels · pin / pop</h2></header>
			<KeyLevels surface={combinedAll} surface0={combined0} pinpop={lastPinPop} />
		</section>

		<section class="panel ivscan">
			<header>
				<h2>IV explosion / implosion scanner</h2>
				<span class="count mono">{store.ivScan?.rows.length ?? 0} symbols</span>
			</header>
			<IvScanner scan={store.ivScan} />
		</section>

		<section class="panel scalp">
			<header>
				<h2>gamma-scalping scanner</h2>
				<span class="count mono">{store.gammaScalp?.rows.length ?? 0} symbols</span>
			</header>
			<GammaScalpScanner scan={store.gammaScalp} />
		</section>

		<section class="panel feed">
			<header><h2>live signals</h2></header>
			<SignalFeed signals={store.signals} outcomes={store.outcomes} />
		</section>
	</div>
</div>

<style>
	.app {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 14px;
		max-inline-size: 1600px;
		margin-inline: auto;
	}
	.masthead {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 14px;
		flex-wrap: wrap;
		padding-block: 4px 12px;
		border-block-end: 1px solid var(--border);

		& h1 {
			font-size: 22px;
			font-weight: 700;
			letter-spacing: -0.02em;
			display: flex;
			align-items: baseline;
			gap: 12px;
		}
		& h1 span:first-of-type {
			color: var(--accent);
			text-shadow: 0 0 18px color-mix(in oklch, var(--accent), transparent 40%);
		}
		& .sub {
			font-size: 12px;
			font-weight: 400;
			color: var(--ink-faint);
			letter-spacing: 0.02em;
		}
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(12, 1fr);
		gap: 14px;
	}
	.profile {
		grid-column: span 5;
	}
	.surface {
		grid-column: span 7;
		min-block-size: 420px;
	}
	.iv {
		grid-column: span 7;
	}
	.levels {
		grid-column: span 5;
	}
	.ivscan {
		grid-column: span 5;
	}
	.scalp {
		grid-column: span 7;
	}
	.feed {
		grid-column: span 12;
	}
	.count {
		font-size: 10px;
		color: var(--ink-faint);
	}
	.toggles {
		display: flex;
		gap: 5px;
		align-items: center;
	}
	.div {
		inline-size: 1px;
		block-size: 16px;
		background: var(--border);
		margin-inline: 4px;
	}
	@media (max-width: 1100px) {
		.grid > section {
			grid-column: span 12;
		}
	}
</style>
