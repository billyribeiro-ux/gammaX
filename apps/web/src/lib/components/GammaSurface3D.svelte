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
		<span class="lbl">−γ</span>
		<span class="bar"></span>
		<span class="lbl">+γ</span>
		<span class="dim">depth = DTE (near → far)</span>
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
		inset-block-end: 10px;
		inset-inline-start: 12px;
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 10px;
		color: var(--ink-dim);

		& .bar {
			inline-size: 88px;
			block-size: 7px;
			border-radius: 999px;
			/* matches the surface ramp: −γ red → neutral dark → +γ green */
			background: linear-gradient(90deg, #ff2d55, #7a1622, #0e1318, #0d3a24, #1fe07e);
		}
		& .lbl {
			font-weight: 600;
		}
		& .dim {
			color: var(--ink-faint);
			margin-inline-start: 6px;
		}
	}
</style>
