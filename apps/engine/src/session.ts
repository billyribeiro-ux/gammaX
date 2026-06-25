import { Temporal } from 'temporal-polyfill';

const ET = 'America/New_York';

function minutesOf(hhmm: string): number {
	const [h, m] = hhmm.split(':').map(Number);
	return (h ?? 0) * 60 + (m ?? 0);
}

function etMinutesAndWeekday(tsMillis: number): { minutes: number; weekday: number } {
	const zdt = Temporal.Instant.fromEpochMilliseconds(tsMillis).toZonedDateTimeISO(ET);
	return { minutes: zdt.hour * 60 + zdt.minute, weekday: zdt.dayOfWeek };
}

// Regular trading hours in ET, weekdays only. DST handled by temporal-polyfill
// (Node 24 does not ship Temporal — see CLAUDE.md).
export function isRth(tsMillis: number, open: string, close: string): boolean {
	const { minutes, weekday } = etMinutesAndWeekday(tsMillis);
	if (weekday > 5) return false;
	return minutes >= minutesOf(open) && minutes <= minutesOf(close);
}

// Late-session window for pin/pop (default 14:00–15:30 ET).
export function isLateSession(tsMillis: number): boolean {
	const { minutes, weekday } = etMinutesAndWeekday(tsMillis);
	if (weekday > 5) return false;
	return minutes >= 14 * 60 && minutes <= 15 * 60 + 30;
}
