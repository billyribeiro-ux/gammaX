import { describe, expect, it } from 'vitest';
import { buildOsi, parseOsi } from './osi';

describe('OSI option symbols', () => {
	it('builds the canonical 21-char symbol', () => {
		expect(buildOsi('SPXW', '2026-06-25', 'C', 5000)).toBe('SPXW  260625C05000000');
		expect(buildOsi('SPY', '2026-06-25', 'P', 500)).toBe('SPY   260625P00500000');
	});
	it('round-trips build → parse (incl. fractional strikes)', () => {
		const s = buildOsi('SPXW', '2026-06-25', 'C', 5025.5);
		expect(parseOsi(s)).toEqual({ root: 'SPXW', expiry: '2026-06-25', right: 'C', strike: 5025.5 });
	});
	it('rejects malformed symbols', () => {
		expect(parseOsi('nope')).toBeNull();
		expect(parseOsi('SPXW  260625X05000000')).toBeNull();
	});
});
