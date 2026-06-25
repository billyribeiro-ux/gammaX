import type { OptionRight } from '@gammax/contracts';
import { PERCENT_MOVE } from './constants';

export type DealerSignModel = (right: OptionRight) => 1 | -1;

// Default naive convention: dealers long calls (+gamma), short puts (−gamma).
// Pluggable so a Phase-2 flow-classified model (from signed prints) can replace
// it without touching aggregation.
export const naiveDealerSign: DealerSignModel = (right) => (right === 'C' ? 1 : -1);

// Dollar gamma per 1% move for one option leg (magnitude; the dealer sign is
// applied separately by the caller).  GEX$ = Γ · OI · multiplier · S² · 0.01
export function optionGexDollars(
	gamma: number,
	openInterest: number,
	spot: number,
	multiplier: number
): number {
	return gamma * openInterest * multiplier * spot * spot * PERCENT_MOVE;
}
