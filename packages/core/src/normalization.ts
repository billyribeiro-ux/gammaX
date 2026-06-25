import { SPX_SPY_STRIKE_SCALE } from './constants';

// SPY trades at ~1/10 of SPX. To place an SPY book on the SPX index axis, map
// strikes ×10. Dollar-gamma (GEX$) needs NO rescale — both books are already in
// dollars-per-1% and sum directly; the ×10 only matters for contract-equivalent
// units.
//
// Worked example (ATM, OI=1, mult=100, σ=0.15, r=0.04, q=0, T=30/365):
//   1 SPX contract @5000 → GEX$ ≈ $46,162.69
//   1 SPY contract @ 500 → GEX$ ≈ $ 4,616.27   (ratio exactly 10×)
// per-share γ scales 10× (γ ∝ 1/(S·σ·√T)) while S² scales 100× → net 10×.
export function spyStrikeToSpxAxis(spyStrike: number): number {
	return spyStrike * SPX_SPY_STRIKE_SCALE;
}

export function spySpotToSpxAxis(spySpot: number): number {
	return spySpot * SPX_SPY_STRIKE_SCALE;
}
