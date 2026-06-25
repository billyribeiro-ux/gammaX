import type { OptionRight } from '@gammax/contracts';
import { bsPrice } from './black-scholes';
import { MIN_T_YEARS } from './constants';

// Brent's method (bisection + inverse-quadratic interpolation): robust, no
// derivative needed, can't diverge. Returns null if f is not bracketed on [a,b].
function brent(
	f: (x: number) => number,
	a0: number,
	b0: number,
	tol: number,
	maxIter: number
): number | null {
	let a = a0;
	let b = b0;
	let fa = f(a);
	let fb = f(b);
	if (fa === 0) return a;
	if (fb === 0) return b;
	if (fa * fb > 0) return null;
	if (Math.abs(fa) < Math.abs(fb)) {
		[a, b] = [b, a];
		[fa, fb] = [fb, fa];
	}
	let c = a;
	let fc = fa;
	let d = b;
	let mflag = true;
	for (let i = 0; i < maxIter; i++) {
		if (Math.abs(fb) < tol || Math.abs(b - a) < tol) return b;
		let s: number;
		if (fa !== fc && fb !== fc) {
			s =
				(a * fb * fc) / ((fa - fb) * (fa - fc)) +
				(b * fa * fc) / ((fb - fa) * (fb - fc)) +
				(c * fa * fb) / ((fc - fa) * (fc - fb));
		} else {
			s = b - (fb * (b - a)) / (fb - fa);
		}
		const lo = (3 * a + b) / 4;
		const between = (s - lo) * (s - b) < 0;
		if (
			!between ||
			(mflag && Math.abs(s - b) >= Math.abs(b - c) / 2) ||
			(!mflag && Math.abs(s - b) >= Math.abs(c - d) / 2) ||
			(mflag && Math.abs(b - c) < tol) ||
			(!mflag && Math.abs(c - d) < tol)
		) {
			s = (a + b) / 2;
			mflag = true;
		} else {
			mflag = false;
		}
		const fs = f(s);
		d = c;
		c = b;
		fc = fb;
		if (fa * fs < 0) {
			b = s;
			fb = fs;
		} else {
			a = s;
			fa = fs;
		}
		if (Math.abs(fa) < Math.abs(fb)) {
			[a, b] = [b, a];
			[fa, fb] = [fb, fa];
		}
	}
	return b;
}

export interface IvInputs {
	s: number;
	k: number;
	t: number;
	r: number;
	q: number;
}

// Solve implied volatility from an option mid price. Rejects (returns null)
// prices outside the no-arbitrage bounds or that fail to bracket — never NaN.
export function impliedVol(right: OptionRight, input: IvInputs, price: number): number | null {
	if (!(price > 0) || !(input.s > 0) || !(input.k > 0)) return null;
	const t = Math.max(input.t, MIN_T_YEARS);
	const dfR = Math.exp(-input.r * t);
	const dfQ = Math.exp(-input.q * t);
	const fwd = input.s * dfQ;
	const intrinsic =
		right === 'C' ? Math.max(fwd - input.k * dfR, 0) : Math.max(input.k * dfR - fwd, 0);
	const upper = right === 'C' ? fwd : input.k * dfR;
	if (price < intrinsic - 1e-8 || price > upper + 1e-8) return null;
	const f = (sigma: number): number => bsPrice(right, { ...input, t, sigma }) - price;
	const sigma = brent(f, 1e-4, 5, 1e-8, 100);
	return sigma != null && sigma > 0 && Number.isFinite(sigma) ? sigma : null;
}
