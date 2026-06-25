import { ChainSnapshot, type FeedSource, type UnderlyingSymbol } from '@gammax/contracts';
import { z } from 'zod';
import { parseOsi } from './osi';

// Raw Schwab option-chain shapes. z.object strips unknown keys (loose by intent).
export const RawOptionContract = z.object({
	putCall: z.enum(['CALL', 'PUT']),
	symbol: z.string(),
	bid: z.number(),
	ask: z.number(),
	last: z.number().optional(),
	mark: z.number().optional(),
	totalVolume: z.number().optional(),
	openInterest: z.number().optional(),
	volatility: z.number().optional(), // percent; -999 = N/A
	delta: z.number().optional(),
	gamma: z.number().optional(),
	theta: z.number().optional(),
	vega: z.number().optional(),
	rho: z.number().optional(),
	strikePrice: z.number(),
	expirationDate: z.number().optional(), // epoch ms
	daysToExpiration: z.number().optional()
});
export type RawOptionContract = z.infer<typeof RawOptionContract>;

const ExpDateMap = z.record(z.string(), z.record(z.string(), z.array(RawOptionContract)));

export const RawChainsResponse = z.object({
	symbol: z.string().optional(),
	underlyingPrice: z.number().optional(),
	underlying: z.object({ last: z.number().optional(), mark: z.number().optional() }).optional(),
	callExpDateMap: ExpDateMap.default({}),
	putExpDateMap: ExpDateMap.default({})
});
export type RawChainsResponse = z.infer<typeof RawChainsResponse>;

function cleanIv(v: number | undefined): number | undefined {
	return v != null && v > 0 && v < 999 ? v / 100 : undefined;
}

function midOf(bid: number, ask: number, mark: number | undefined): number {
	if (mark != null && mark > 0) return mark;
	const m = (Math.max(0, bid) + Math.max(0, ask)) / 2;
	return m > 0 ? m : 0;
}

function toQuotes(map: z.infer<typeof ExpDateMap>, underlying: UnderlyingSymbol): unknown[] {
	const out: unknown[] = [];
	for (const [expKey, strikes] of Object.entries(map)) {
		const expiry = expKey.split(':')[0] ?? '1970-01-01';
		const dteFromKey = Number(expKey.split(':')[1] ?? 'NaN');
		for (const contracts of Object.values(strikes)) {
			for (const c of contracts) {
				const dte = Number.isFinite(c.daysToExpiration)
					? (c.daysToExpiration as number)
					: Number.isFinite(dteFromKey)
						? dteFromKey
						: 0;
				out.push({
					symbol: c.symbol,
					underlying,
					root: parseOsi(c.symbol)?.root,
					expiry,
					dte: Math.max(0, Math.trunc(dte)),
					expiryMillis: c.expirationDate,
					right: c.putCall === 'CALL' ? 'C' : 'P',
					strike: c.strikePrice,
					bid: Math.max(0, c.bid),
					ask: Math.max(0, c.ask),
					mid: midOf(c.bid, c.ask, c.mark),
					last: c.last,
					volume: Math.max(0, Math.trunc(c.totalVolume ?? 0)),
					openInterest: Math.max(0, Math.trunc(c.openInterest ?? 0)),
					iv: cleanIv(c.volatility),
					delta: c.delta,
					gamma: c.gamma,
					theta: c.theta,
					vega: c.vega,
					rho: c.rho
				});
			}
		}
	}
	return out;
}

export interface MapChainsParams {
	underlying: UnderlyingSymbol;
	captureTs: number;
	source?: FeedSource;
	delayed?: boolean;
}

// All vendor normalization happens here so `core` never sees Schwab shapes.
export function mapChainsResponse(raw: unknown, params: MapChainsParams): ChainSnapshot {
	const data = RawChainsResponse.parse(raw);
	const spot = data.underlyingPrice ?? data.underlying?.mark ?? data.underlying?.last;
	if (spot == null || !(spot > 0)) {
		throw new Error('Schwab chains response is missing a valid underlying price');
	}
	const quotes = [
		...toQuotes(data.callExpDateMap, params.underlying),
		...toQuotes(data.putExpDateMap, params.underlying)
	];
	return ChainSnapshot.parse({
		captureTs: params.captureTs,
		source: params.source ?? 'schwab',
		delayed: params.delayed ?? false,
		underlying: { symbol: params.underlying, last: spot, ts: params.captureTs },
		quotes
	});
}
