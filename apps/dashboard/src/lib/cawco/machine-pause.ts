/**
 * A machine's pause as the dashboard offers and says it (hub
 * machine-pause.ts): the menu's few ends, and the row's "paused until 00:57".
 */
import { pauseClock } from "@cawco/core";

/** The hour a morning pause ends at, on this browser's clock. */
const MORNING_HOUR = 8;

/** One end Pause until… offers: its words, its clock, and the time. */
export interface PauseChoice {
  /** The end on the clock, as the menu shows it beside the words ("22:57"). */
  clock: string;
  label: string;
  until: Date;
}

/**
 * The ends Pause until… offers, from `now`: an hour, three, and the next
 * morning at 08:00, today's when it is not 08:00 yet (a pause set at 01:00
 * ends that morning, not the one after).
 */
export const pauseChoices = (now: Date): PauseChoice[] => {
  const morning = new Date(now);
  morning.setHours(MORNING_HOUR, 0, 0, 0);
  const today = morning.getTime() > now.getTime();
  if (!today) {
    morning.setDate(morning.getDate() + 1);
  }
  const at = (until: Date, label: string): PauseChoice => ({
    label,
    until,
    clock: pauseClock(until.getTime(), now.getTime()),
  });
  return [
    at(new Date(now.getTime() + 60 * 60_000), "1 hour"),
    at(new Date(now.getTime() + 3 * 60 * 60_000), "3 hours"),
    at(morning, today ? "This morning" : "Tomorrow morning"),
  ];
};

/** "paused until 00:57" for a paused machine's row; undefined when it is not. */
export const pausedWords = (
  pausedUntil: number | null | undefined
): string | undefined =>
  pausedUntil ? `paused until ${pauseClock(pausedUntil)}` : undefined;
