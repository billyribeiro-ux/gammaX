import type { Greeks, OptionRight } from '@gammax/contracts';
import { MIN_T_YEARS } from './constants';
import { normCdf, normPdf } from './normal';

// Black–Scholes with continuous dividend yield q and rate r.
//   d1 = (ln(S/K) + (r − q + σ²/2)·T) / (σ·√T),  d2 = d1 − σ√T
// SPX/SPXW: European, cash-settled → exact-form appropriate (q≈0, or use a
// dividend-adjusted forward). SPY: American dividend ETF — for 0DTE the early-
// exercise effect is negligible; we use BS with SPY's q (documented approximation).
export interface BsInputs {
	s: number; // spot / underlying level
	k: number; // strike
	t: number; // time to expiry in years (floored at MIN_T_YEARS)
	r: number; // risk-free rate (annualized decimal)
	q: number; // continuous dividend yield
	sigma: number; // volatility (annualized decimal)
}

interface D1D2 {
	d1: number;
	d2: number;
	t: number;
	sqrtT: number;
}

function d1d2(input: BsInputs): D1D2 {
	const t = Math.max(input.t, MIN_T_YEARS);
	const sqrtT = Math.sqrt(t);
	const { s, k, r, q, sigma } = input;
	const d1 = (Math.log(s / k) + (r - q + 0.5 * sigma * sigma) * t) / (sigma * sqrtT);
	const d2 = d1 - sigma * sqrtT;
	return { d1, d2, t, sqrtT };
}

export function bsPrice(right: OptionRight, input: BsInputs): number {
	const { d1, d2, t } = d1d2(input);
	const { s, k, r, q } = input;
	const dfR = Math.exp(-r * t);
	const dfQ = Math.exp(-q * t);
	if (right === 'C') {
		return s * dfQ * normCdf(d1) - k * dfR * normCdf(d2);
	}
	return k * dfR * normCdf(-d2) - s * dfQ * normCdf(-d1);
}

// Γ = e^{−qT}·φ(d1) / (S·σ·√T) — identical for calls and puts.
export function bsGamma(input: BsInputs): number {
	const { d1, t, sqrtT } = d1d2(input);
	const { s, q, sigma } = input;
	return (Math.exp(-q * t) * normPdf(d1)) / (s * sigma * sqrtT);
}

// Vega = S·e^{−qT}·φ(d1)·√T, per 1.00 (100%) vol.
export function bsVega(input: BsInputs): number {
	const { d1, t, sqrtT } = d1d2(input);
	const { s, q } = input;
	return s * Math.exp(-q * t) * normPdf(d1) * sqrtT;
}

export function bsDelta(right: OptionRight, input: BsInputs): number {
	const { d1, t } = d1d2(input);
	const dfQ = Math.exp(-input.q * t);
	return right === 'C' ? dfQ * normCdf(d1) : dfQ * (normCdf(d1) - 1);
}

export function bsTheta(right: OptionRight, input: BsInputs): number {
	const { d1, d2, t, sqrtT } = d1d2(input);
	const { s, k, r, q, sigma } = input;
	const dfR = Math.exp(-r * t);
	const dfQ = Math.exp(-q * t);
	const term1 = -(s * dfQ * normPdf(d1) * sigma) / (2 * sqrtT);
	if (right === 'C') {
		return term1 - r * k * dfR * normCdf(d2) + q * s * dfQ * normCdf(d1);
	}
	return term1 + r * k * dfR * normCdf(-d2) - q * s * dfQ * normCdf(-d1);
}

// Vanna = ∂Delta/∂σ = −e^{−qT}·φ(d1)·d2/σ, per 1.00 vol.
export function bsVanna(input: BsInputs): number {
	const { d1, d2, t } = d1d2(input);
	const { q, sigma } = input;
	return (-Math.exp(-q * t) * normPdf(d1) * d2) / sigma;
}

// Charm = −∂Delta/∂T (delta decay as calendar time passes), per year.
// Identity (validates implementations): charm_call − charm_put = q·e^{−qT}.
export function bsCharm(right: OptionRight, input: BsInputs): number {
	const { d1, d2, t, sqrtT } = d1d2(input);
	const { r, q, sigma } = input;
	const dfQ = Math.exp(-q * t);
	const shared =
		(dfQ * normPdf(d1) * (2 * (r - q) * t - d2 * sigma * sqrtT)) / (2 * t * sigma * sqrtT);
	if (right === 'C') {
		return q * dfQ * normCdf(d1) - shared;
	}
	return -q * dfQ * normCdf(-d1) - shared;
}

export function greeks(right: OptionRight, input: BsInputs): Greeks {
	return {
		delta: bsDelta(right, input),
		gamma: bsGamma(input),
		vanna: bsVanna(input),
		charm: bsCharm(right, input),
		theta: bsTheta(right, input),
		vega: bsVega(input)
	};
}
