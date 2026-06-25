<script lang="ts">
	import { browser } from '$app/environment';
	import type { GammaSurfaceGrid } from '@gammax/contracts';
	import { Canvas } from '@threlte/core';
	import GammaScene from './GammaScene.svelte';

	let { grid }: { grid: GammaSurfaceGrid | undefined } = $props();

	let webglOk = $state(true);
	if (browser) {
		try {
			const c = document.createElement('canvas');
			webglOk = !!(c.getContext('webgl2') ?? c.getContext('webgl'));
		} catch {
			webglOk = false;
		}
	}
</script>

<div class="surface3d">
	{#if browser && webglOk}
		<Canvas>
			<GammaScene {grid} />
		</Canvas>
	{:else}
		<p class="fallback">3D surface unavailable (WebGL not supported)</p>
	{/if}
	<div class="legend mono">
		<span><i class="call"></i> +γ</span>
		<span><i class="put"></i> −γ</span>
		<span class="dim">bright row = 0DTE</span>
	</div>
</div>

<style>
	.surface3d {
		position: relative;
		inline-size: 100%;
		block-size: 100%;
		min-block-size: 300px;
	}
	.fallback {
		display: grid;
		place-items: center;
		block-size: 100%;
		color: var(--ink-faint);
	}
	.legend {
		position: absolute;
		inset-block-end: 8px;
		inset-inline-start: 10px;
		display: flex;
		gap: 12px;
		font-size: 10px;
		color: var(--ink-dim);

		& i {
			display: inline-block;
			inline-size: 9px;
			block-size: 9px;
			border-radius: 2px;
			vertical-align: middle;
		}
		& .call {
			background: var(--call);
		}
		& .put {
			background: var(--put);
		}
		& .dim {
			color: var(--ink-faint);
		}
	}
</style>
