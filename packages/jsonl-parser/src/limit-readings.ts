/**
 * The parser's readings of the bounds still waiting on data, handed to
 * whoever runs it: the parser takes nothing of CawCo's core (core takes
 * the parser), so the process that loads it names where its readings go
 * ({@link recordLimitReadingsWith}: agent search/host.ts passes core
 * limit-readings.ts `recordLimitReading`, whose readings ride its beat).
 * Before one is named, a reading goes nowhere.
 */

let sink: ((metric: string, value: number) => void) | undefined;

/** Where the parser's readings go from now. */
export const recordLimitReadingsWith = (record: (metric: string, value: number) => void): void => {
  sink = record;
};

/** One reading of the bound `metric` names (core limit-readings.ts `recordLimitReading`). */
export const recordLimitReading = (metric: string, value: number): void => {
  sink?.(metric, value);
};
