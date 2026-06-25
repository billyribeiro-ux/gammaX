import type { ChainSnapshot, IvSample, OptionQuote, RiskParams } from '@gammax/contracts';
import { CM_TENOR_DAYS } from './constants';
import { impliedVol } from './implied-vol';
import { yearsToExpiry } from './surface';

export interface ExpiryIv {
	dte: number;
	days: number; // fractional days to expiry (T·365), for CM interpolation
	iv: number;
}

function quoteIv(
	quote: OptionQuote,
	spot: number,
	t: number,
	riskParams: RiskParams
): number | null {
	const own =
		quote.mid > 0
			? impliedVol(
					quote.right,
					{ s: spot, k: quote.strike, t, r: riskParams.r, q: riskParams.q },
					quote.mid
				)
			: null;
	return own ?? (quote.iv != null && quote.iv > 0 ? quote.iv : null);
}

// ATM IV per expiry: at each expiry, average the IV of the call and put at the
// strike nearest spot.
export function atmIvByExpiry(snapshot: ChainSnapshot, riskParams: RiskParams): ExpiryIv[] {
	const spot = snapshot.underlying.last;
	const byExpiry = new Map<string, OptionQuote[]>();
	for (const q of snapshot.quotes) {
		const list = byExpiry.get(q.expiry);
		if (list) list.push(q);
		else byExpiry.set(q.expiry, [q]);
	}
	const out: ExpiryIv[] = [];
	for (const quotes of byExpiry.values()) {
		let atmStrike: number | null = null;
		let best = Infinity;
		for (const q of quotes) {
			const d = Math.abs(q.strike - spot);
			if (d < best) {
				best = d;
				atmStrike = q.strike;
			}
		}
		if (atmStrike === null) continue;
		const atm = quotes.filter((q) => q.strike === atmStrike);
		const first = atm[0];
		if (!first) continue;
		const t = yearsToExpiry(snapshot.captureTs, first);
		const ivs: number[] = [];
		for (const q of atm) {
			const iv = quoteIv(q, spot, t, riskParams);
			if (iv != null) ivs.push(iv);
		}
		if (ivs.length === 0) continue;
		out.push({ dte: first.dte, days: t * 365, iv: ivs.reduce((a, b) => a + b, 0) / ivs.length });
	}
	return out.sort((a, b) => a.days - b.days);
}

export function atmIv0dte(expiryIvs: readonly ExpiryIv[]): number | null {
	for (const e of expiryIvs) if (e.dte === 0) return e.iv;
	return null;
}

// Constant-maturity 30D ATM IV by linear interpolation in TOTAL VARIANCE (σ²·T)
// across the bracketing expiries — the Cboe VIX method. Clamps to the nearest
// expiry when 30D is outside the available range.
export function atmIvCm30(expiryIvs: readonly ExpiryIv[]): number | null {
	const xs = expiryIvs.filter((e) => e.days > 0 && e.iv > 0).sort((a, b) => a.days - b.days);
	const first = xs[0];
	const last = xs[xs.length - 1];
	if (!first || !last) return null;
	if (first === last) return first.iv;
	const target = CM_TENOR_DAYS;
	if (target <= first.days) return first.iv;
	if (target >= last.days) return last.iv;
	let near = first;
	let next = last;
	for (let i = 0; i < xs.length - 1; i++) {
		const a = xs[i];
		const b = xs[i + 1];
		if (a && b && a.days <= target && b.days >= target) {
			near = a;
			next = b;
			break;
		}
	}
	const t1 = near.days / 365;
	const t2 = next.days / 365;
	const t30 = target / 365;
	const tv1 = near.iv * near.iv * t1;
	const tv2 = next.iv * next.iv * t2;
	const wNear = (next.days - target) / (next.days - near.days);
	const wNext = (target - near.days) / (next.days - near.days);
	const tv30 = tv1 * wNear + tv2 * wNext;
	return Math.sqrt(tv30 / t30);
}

export interface IvVelocity {
	zScore: number | null;
	rocPctPerMin: number | null;
}

// Velocity over a rolling buffer (not IV-rank — no long history). z-score and
// rate-of-change use 0DTE ATM IV when present, else CM30.
export function ivVelocity(series: readonly IvSample[], window: number): IvVelocity {
	const vals: { ts: number; v: number }[] = [];
	for (const s of series) {
		const v = s.atmIv0dte ?? s.atmIvCm30;
		if (v != null && Number.isFinite(v)) vals.push({ ts: s.ts, v });
	}
	if (vals.length < 2) return { zScore: null, rocPctPerMin: null };
	const win = vals.slice(-window);
	const last = win[win.length - 1];
	const prev = win[win.length - 2];
	if (!last || !prev) return { zScore: null, rocPctPerMin: null };
	const mean = win.reduce((a, b) => a + b.v, 0) / win.length;
	const variance = win.reduce((a, b) => a + (b.v - mean) ** 2, 0) / win.length;
	const std = Math.sqrt(variance);
	const zScore = std > 0 ? (last.v - mean) / std : 0;
	const dtMin = (last.ts - prev.ts) / 60_000;
	const rocPctPerMin =
		dtMin > 0 && prev.v !== 0 ? (((last.v - prev.v) / prev.v) * 100) / dtMin : null;
	return { zScore, rocPctPerMin };
}
