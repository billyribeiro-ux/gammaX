// Calendar-year basis for time-to-expiry (actual ms until settlement / YEAR_MS).
export const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// Minimum time-to-expiry clamp (~1 trading-minute in years). As 0DTE → expiry,
// ATM gamma ∝ 1/√T blows up; this floor keeps the surface finite and stable.
// (Used only as a clamp, not a measurement — a trading-time epsilon is fine.)
export const MIN_T_YEARS = 1 / (252 * 6.5 * 60); // ≈ 1.0175e-5

export const DEFAULT_MULTIPLIER = 100;

// GEX is expressed as dealer hedging dollars per a 1% move in spot.
export const PERCENT_MOVE = 0.01;

// SPY trades at ~1/10 of SPX; mapping SPY strikes onto the SPX index axis is ×10.
export const SPX_SPY_STRIKE_SCALE = 10;

// Days used for the constant-maturity ATM-IV tenor (Cboe VIX uses 30).
export const CM_TENOR_DAYS = 30;
