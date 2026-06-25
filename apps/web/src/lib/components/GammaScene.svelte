<script lang="ts">
	import type { GammaSurfaceGrid } from '@gammax/contracts';
	import { T } from '@threlte/core';
	import { OrbitControls } from '@threlte/extras';
	import { interpolateRgbBasis, scaleDiverging } from 'd3';
	import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute } from 'three';

	// High-contrast diverging ramp: −γ red → gamma-neutral dark → +γ green.
	const RAMP = interpolateRgbBasis(['#ff2d55', '#7a1622', '#0e1318', '#0d3a24', '#1fe07e']);

	let { grid }: { grid: GammaSurfaceGrid | undefined } = $props();

	const W = 18;
	const DEPTH = 10;
	const HEIGHT = 6.5;
	const SUB = 7; // z-subdivisions between expiries → a smooth surface

	interface Built {
		geom: BufferGeometry;
		zeroGeom: BufferGeometry;
	}

	function lerpRow(a: number[], b: number[], t: number): number[] {
		return a.map((av, i) => av + ((b[i] as number) - av) * t);
	}

	// Continuous heightfield: strike (x) × DTE (z) × net GEX (y), smoothly
	// subdivided in z and vertex-colored by a diverging gamma colormap.
	const built = $derived.by((): Built | null => {
		if (!grid || grid.slices.length === 0) return null;
		const slices = [...grid.slices].sort((a, b) => a.dte - b.dte);
		const strikes = [...new Set(slices.flatMap((s) => s.byStrike.map((b) => b.strike)))].sort(
			(a, b) => a - b
		);
		const cols = strikes.length;
		if (cols < 2) return null;
		const colOf = new Map(strikes.map((k, i) => [k, i]));

		const base: number[][] = slices.map((s) => {
			const row = new Array<number>(cols).fill(0);
			for (const b of s.byStrike) {
				const i = colOf.get(b.strike);
				if (i !== undefined) row[i] = b.netGex;
			}
			return row;
		});

		const dense: number[][] = [];
		if (base.length === 1) {
			dense.push(base[0] as number[], base[0] as number[]);
		} else {
			for (let r = 0; r < base.length - 1; r++) {
				for (let s = 0; s < SUB; s++) {
					dense.push(lerpRow(base[r] as number[], base[r + 1] as number[], s / SUB));
				}
			}
			dense.push(base[base.length - 1] as number[]);
		}
		const rows = dense.length;

		const maxAbs = Math.max(1, ...dense.flat().map((v) => Math.abs(v)));
		const color = scaleDiverging([-maxAbs, 0, maxAbs], RAMP);

		const positions: number[] = [];
		const colors: number[] = [];
		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				const x = (c / (cols - 1) - 0.5) * W;
				const z = (r / (rows - 1) - 0.5) * DEPTH;
				const v = (dense[r] as number[])[c] as number;
				positions.push(x, (v / maxAbs) * HEIGHT, z);
				const col = new Color(color(v));
				colors.push(col.r, col.g, col.b);
			}
		}
		const indices: number[] = [];
		for (let r = 0; r < rows - 1; r++) {
			for (let c = 0; c < cols - 1; c++) {
				const a = r * cols + c;
				const b = a + 1;
				const d = a + cols;
				const e = d + 1;
				indices.push(a, d, b, b, d, e);
			}
		}
		const geom = new BufferGeometry();
		geom.setAttribute('position', new Float32BufferAttribute(positions, 3));
		geom.setAttribute('color', new Float32BufferAttribute(colors, 3));
		geom.setIndex(indices);
		geom.computeVertexNormals();

		const zeroGeom = new BufferGeometry();
		zeroGeom.setAttribute(
			'position',
			new Float32BufferAttribute(
				[-W / 2, 0, -DEPTH / 2, W / 2, 0, -DEPTH / 2, W / 2, 0, DEPTH / 2, -W / 2, 0, DEPTH / 2],
				3
			)
		);
		zeroGeom.setIndex([0, 1, 2, 0, 2, 3]);
		zeroGeom.computeVertexNormals();

		return { geom, zeroGeom };
	});

	$effect(() => {
		const b = built;
		return () => {
			b?.geom.dispose();
			b?.zeroGeom.dispose();
		};
	});
</script>

<T.PerspectiveCamera makeDefault position={[15, 12.5, 18]} fov={36}>
	<OrbitControls
		enableDamping
		dampingFactor={0.08}
		target={[0, 0.5, 0]}
		minDistance={11}
		maxDistance={44}
		maxPolarAngle={1.5}
	/>
</T.PerspectiveCamera>

<T.FogExp2 attach="fog" args={['#0c1116', 0.012]} />

<T.DirectionalLight position={[16, 24, 14]} intensity={2.3} />
<T.DirectionalLight position={[-14, 9, -12]} intensity={0.6} color="#86b3ff" />
<T.AmbientLight intensity={0.45} />

{#if built}
	<T.Mesh geometry={built.zeroGeom}>
		<T.MeshBasicMaterial color="#64798a" transparent opacity={0.1} side={DoubleSide} />
	</T.Mesh>
	<T.Mesh geometry={built.geom}>
		<T.MeshStandardMaterial vertexColors side={DoubleSide} roughness={0.38} metalness={0.18} />
	</T.Mesh>
	<T.Mesh geometry={built.geom}>
		<T.MeshBasicMaterial wireframe color="#05130c" transparent opacity={0.1} />
	</T.Mesh>
{/if}

<T.GridHelper args={[W * 1.1, 24, '#2c3b45', '#1a262c']} position={[0, -HEIGHT - 0.5, 0]} />
