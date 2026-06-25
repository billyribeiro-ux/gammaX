<script lang="ts">
	import type { GammaSurface } from '@gammax/contracts';
	import { T } from '@threlte/core';
	import { OrbitControls } from '@threlte/extras';

	let {
		surfaceAll,
		surface0
	}: { surfaceAll: GammaSurface | undefined; surface0: GammaSurface | undefined } = $props();

	interface Bar {
		x: number;
		z: number;
		h: number;
		positive: boolean;
		is0dte: boolean;
	}

	const bars = $derived.by((): Bar[] => {
		const rows = [
			{ surface: surfaceAll, z: -1, is0dte: false },
			{ surface: surface0, z: 1, is0dte: true }
		].filter(
			(r): r is { surface: GammaSurface; z: number; is0dte: boolean } => r.surface !== undefined
		);
		const all = rows.flatMap((r) => r.surface.byStrike);
		const maxAbs = Math.max(1, ...all.map((s) => Math.abs(s.netGex)));
		const out: Bar[] = [];
		for (const r of rows) {
			const ks = r.surface.byStrike;
			const n = ks.length;
			ks.forEach((s, i) => {
				out.push({
					x: (i - n / 2) * 0.5,
					z: r.z * 1.4,
					h: (s.netGex / maxAbs) * 6,
					positive: s.netGex >= 0,
					is0dte: r.is0dte
				});
			});
		}
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
			emissiveIntensity={b.is0dte ? 0.5 : 0.05}
			transparent
			opacity={b.is0dte ? 1 : 0.8}
		/>
	</T.Mesh>
{/each}
