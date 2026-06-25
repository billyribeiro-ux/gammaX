<script lang="ts">
	import type { GammaSurfaceGrid } from '@gammax/contracts';
	import { T } from '@threlte/core';
	import { OrbitControls } from '@threlte/extras';

	let { grid }: { grid: GammaSurfaceGrid | undefined } = $props();

	interface Bar {
		x: number;
		z: number;
		h: number;
		positive: boolean;
		is0dte: boolean;
	}

	// strike (x) × DTE slice (z) × net GEX (height). 0DTE slice highlighted.
	const bars = $derived.by((): Bar[] => {
		if (!grid || grid.slices.length === 0) return [];
		const all = grid.slices.flatMap((s) => s.byStrike);
		const maxAbs = Math.max(1, ...all.map((s) => Math.abs(s.netGex)));
		const strikes = [...new Set(all.map((s) => s.strike))].sort((a, b) => a - b);
		const idx = new Map(strikes.map((k, i) => [k, i]));
		const n = strikes.length;
		const depth = grid.slices.length;
		const out: Bar[] = [];
		grid.slices.forEach((slice, zi) => {
			for (const s of slice.byStrike) {
				const i = idx.get(s.strike) ?? 0;
				out.push({
					x: (i - n / 2) * 0.45,
					z: (zi - (depth - 1) / 2) * 2.2,
					h: (s.netGex / maxAbs) * 6,
					positive: s.netGex >= 0,
					is0dte: slice.dte === 0
				});
			}
		});
		return out;
	});
</script>

<T.PerspectiveCamera makeDefault position={[16, 13, 18]} fov={42}>
	<OrbitControls enableDamping target={[0, 0, 0]} />
</T.PerspectiveCamera>

<T.DirectionalLight position={[12, 18, 10]} intensity={1.3} />
<T.AmbientLight intensity={0.55} />

{#each bars as b, i (i)}
	<T.Mesh position={[b.x, b.h / 2, b.z]}>
		<T.BoxGeometry args={[0.4, Math.max(0.04, Math.abs(b.h)), 0.4]} />
		<T.MeshStandardMaterial
			color={b.positive ? '#46d98a' : '#e85d42'}
			emissive={b.positive ? '#46d98a' : '#e85d42'}
			emissiveIntensity={b.is0dte ? 0.55 : 0.05}
			transparent
			opacity={b.is0dte ? 1 : 0.72}
		/>
	</T.Mesh>
{/each}
