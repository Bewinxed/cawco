/**
 * The questions agents asked his fleet over the last days, as
 * `GET /api/decides/recent` answers them, newest first, with each member's
 * record for its card: a busy week on Cawco-Dev with a few from his other
 * projects. Ages count back from the moment the module loads.
 */
import type { MemberRecord, RecentCall } from "../decides-client";

const ago = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

const call = (
  card: string,
  kind: string,
  member: string,
  question: string,
  picked: string[],
  minutes: number,
  extra: Partial<RecentCall> = {}
): RecentCall => ({
  artifactId: `page-${card}`,
  card,
  kind,
  member,
  question,
  picked,
  projectId: "cawco-dev",
  takenBack: false,
  at: ago(minutes),
  ...extra,
});

export const calls: RecentCall[] = [
  call(
    "phone-first",
    "scope",
    "you",
    "Ship the phone layout now, or after the tablet pass?",
    [],
    12,
    { projectId: "roost-ios" }
  ),
  call(
    "row-density",
    "look",
    "design-reviewer",
    "How dense is the task row on the board?",
    ["Comfortable, 44px"],
    40
  ),
  call(
    "browser-stream",
    "approach",
    "advisor",
    "Stream the agent's browser over WebRTC, or hand the video the canvas directly?",
    ["The canvas directly"],
    60
  ),
  call(
    "schemas",
    "tools",
    "practice",
    "zod 4.6 or valibot for the hub's request schemas?",
    ["zod 4.6"],
    120
  ),
  call(
    "wake-parked",
    "behaviour",
    "you",
    "Should a parked session wake when its card is answered?",
    [],
    180
  ),
  call(
    "phone-head",
    "look",
    "design-reviewer",
    "Which head for the phone project page: title over tabs, or tabs in the bar?",
    ["Title over tabs"],
    300,
    { takenBack: true }
  ),
  call(
    "unused-locals",
    "rules",
    "advisor",
    "Turn off noUnusedLocals in the generated tokens file?",
    ["Yes, for generated files only"],
    1500
  ),
  call(
    "approve-same-call",
    "behaviour",
    "you",
    "Does Approve continue the same call while you watch, or start a fresh one?",
    ["Continue the same call"],
    1560,
    { projectId: "private-office" }
  ),
  call(
    "shared-worker",
    "approach",
    "advisor",
    "One socket per tab, or one shared worker for every tab?",
    ["One socket per tab"],
    1620,
    { takenBack: true }
  ),
  call(
    "iso-dates",
    "tools",
    "practice",
    "ISO dates or epoch milliseconds in the decision record?",
    ["ISO 8601 strings"],
    1700,
    { projectId: "hyucksfield" }
  ),
  call(
    "pose-picker",
    "scope",
    "you",
    "Cut the pose picker from the first release of Who decides?",
    ["Keep it"],
    4300
  ),
  call(
    "probe-docs",
    "rules",
    "advisor",
    "Skip the probe kit on commits that touch docs only?",
    ["Skip it"],
    5800
  ),
];

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
