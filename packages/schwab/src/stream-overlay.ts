import type { ChainSnapshot, OptionQuote } from '@gammax/contracts';
import { L1_OPTION_FIELDS } from './streamer';

export type StreamQuoteMap = Map<string, Record<string, string | number>>;

function num(fields: Record<string, string | number>, field: number): number | undefined {
	const v = fields[String(field)];
	const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
	return Number.isFinite(n) ? n : undefined;
}

// Overlay the freshest streamed LEVELONE_OPTIONS bid/ask/last onto a REST chain
// snapshot (matched by symbol), keeping OI/greeks/expiry structure from REST.
// Pure — the live quote cache is owned by SchwabFeed. Returns the input unchanged
// when nothing matched.
export function applyStreamQuotes(snapshot: ChainSnapshot, quotes: StreamQuoteMap): ChainSnapshot {
	if (quotes.size === 0) return snapshot;
	let changed = false;
	const updated = snapshot.quotes.map((q): OptionQuote => {
		const fields = quotes.get(q.symbol);
		if (!fields) return q;
		const bid = num(fields, L1_OPTION_FIELDS.bid) ?? q.bid;
		const ask = num(fields, L1_OPTION_FIELDS.ask) ?? q.ask;
		const last = num(fields, L1_OPTION_FIELDS.last) ?? q.last;
		const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : q.mid;
		// Only mark changed when a value actually moved — a streamed message with
		// incomplete fields (all falling back to the REST values) must not spawn a
		// new snapshot and trigger downstream recompute/persist for nothing.
		if (bid === q.bid && ask === q.ask && last === q.last && mid === q.mid) return q;
		changed = true;
		return { ...q, bid, ask, mid, last };
	});
	return changed ? { ...snapshot, quotes: updated } : snapshot;
}
