import type { IsoDate, OptionRight } from '@gammax/contracts';

// OSI 21-char option symbol: 6-char space-padded root + YYMMDD + C/P + strike×1000
// zero-padded to 8 digits. e.g. buildOsi('SPXW','2026-06-25','C',5000) →
// "SPXW  260625C05000000".
export function buildOsi(
	root: string,
	expiry: IsoDate,
	right: OptionRight,
	strike: number
): string {
	const paddedRoot = root.padEnd(6, ' ');
	const yymmdd = expiry.slice(2).replace(/-/g, '');
	const strikePart = Math.round(strike * 1000)
		.toString()
		.padStart(8, '0');
	return `${paddedRoot}${yymmdd}${right}${strikePart}`;
}

export interface ParsedOsi {
	root: string;
	expiry: IsoDate;
	right: OptionRight;
	strike: number;
}

export function parseOsi(symbol: string): ParsedOsi | null {
	if (symbol.length !== 21) return null;
	const root = symbol.slice(0, 6).trim();
	const yy = symbol.slice(6, 8);
	const mm = symbol.slice(8, 10);
	const dd = symbol.slice(10, 12);
	const rightChar = symbol.slice(12, 13);
	const strikeRaw = symbol.slice(13, 21);
	if (rightChar !== 'C' && rightChar !== 'P') return null;
	if (!/^\d{8}$/.test(strikeRaw) || !/^\d{6}$/.test(`${yy}${mm}${dd}`)) return null;
	return {
		root,
		expiry: `20${yy}-${mm}-${dd}`,
		right: rightChar,
		strike: Number(strikeRaw) / 1000
	};
}
