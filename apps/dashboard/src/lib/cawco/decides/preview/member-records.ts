/**
 * Each member's record this month as `GET /api/decides/members/:id/record`
 * answers it, for its card's figures. Ages count back from the moment the
 * module loads.
 */
import type { MemberRecord } from "../decides-client";

const ago = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

/** Each member's record this month, as its card reads it. */
export const records: Record<string, MemberRecord> = {
  advisor: {
    caw: null,
    decided: 23,
    lastAt: ago(60),
    takenBack: 2,
    waiting: 0,
    spendUsd: 41.27,
  },
  practice: {
    caw: null,
    decided: 41,
    lastAt: ago(120),
    takenBack: 0,
    waiting: 0,
    spendUsd: 3.84,
  },
  "design-reviewer": {
    caw: null,
    decided: 18,
    lastAt: ago(40),
    takenBack: 3,
    waiting: 1,
    spendUsd: 26.5,
  },
  "release-checker": {
    caw: null,
    decided: 0,
    lastAt: null,
    takenBack: 0,
    waiting: 0,
    spendUsd: 0,
  },
  caw: {
    caw: { spendUsd: 97.9, threads: 38, lastTurnAt: ago(25) },
    decided: 0,
    lastAt: null,
    takenBack: 0,
    waiting: 0,
    spendUsd: 0,
  },
};
