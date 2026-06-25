const INV_SQRT_2PI = 0.3989422804014327; // 1/√(2π)

export function normPdf(x: number): number {
	return INV_SQRT_2PI * Math.exp(-0.5 * x * x);
}

// Cumulative standard normal distribution (Graeme West, 2009 — "Better
// approximations to cumulative normal functions"). Double-precision accurate.
export function normCdf(x: number): number {
	const z = Math.abs(x);
	let c: number;
	if (z > 37) {
		c = 0;
	} else {
		const e = Math.exp(-0.5 * z * z);
		if (z < 7.07106781186547) {
			let n = 3.52624965998911e-2 * z + 0.700383064443688;
			n = n * z + 6.37396220353165;
			n = n * z + 33.912866078383;
			n = n * z + 112.079291497871;
			n = n * z + 221.213596169931;
			n = n * z + 220.206867912376;
			let d = 8.83883476483184e-2 * z + 1.75566716318264;
			d = d * z + 16.064177579207;
			d = d * z + 86.7807322029461;
			d = d * z + 296.564248779674;
			d = d * z + 637.333633378831;
			d = d * z + 793.826512519948;
			d = d * z + 440.413735824752;
			c = (e * n) / d;
		} else {
			let f = z + 0.65;
			f = z + 4 / f;
			f = z + 3 / f;
			f = z + 2 / f;
			f = z + 1 / f;
			c = e / f / 2.506628274631;
		}
	}
	return x > 0 ? 1 - c : c;
}
