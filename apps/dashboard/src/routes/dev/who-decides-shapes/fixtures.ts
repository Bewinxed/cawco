/**
 * Shaping frames' records: his fleet's Who decides with one agent he added,
 * and the calls each member made over the last days, as the hub would hold
 * them. Mock data shaped like the product; no hub is read.
 */
import {
  BUILT_IN,
  KIND_SEED,
  type Kind,
  type Member,
} from "@cawco/core/decides";

const designReviewer: Member = {
  id: "design-reviewer",
  type: "agent",
  name: "Design reviewer",
  job: "",
  subject: "the design reviewer",
  builtIn: false,
  hue: 3,
  pose: null,
  hear: "each",
  delegateType: "design-reviewer",
  reach: null,
};

export const members: Member[] = [
  BUILT_IN.you,
  designReviewer,
  BUILT_IN.advisor,
  BUILT_IN.practice,
  BUILT_IN.caw,
  BUILT_IN.asker,
];

export const kinds: Kind[] = KIND_SEED;

export const routes: Record<string, string> = {
  look: "design-reviewer",
  behaviour: "you",
  scope: "you",
  approach: "advisor",
  rules: "advisor",
  tools: "practice",
};

/** What each agent member runs on, as its chip says it. */
export const runsOn: Record<string, string> = {
  "design-reviewer": "Opus 5.5",
  advisor: "Fable 5.1",
  practice: "Sonnet 5.5",
  caw: "Opus 5.5",
};

/** This month, per member: calls made and calls he took back. */
export const tally: Record<string, { decided: number; back: number }> = {
  you: { decided: 31, back: 0 },
  "design-reviewer": { decided: 18, back: 3 },
  advisor: { decided: 23, back: 2 },
  practice: { decided: 41, back: 0 },
  caw: { decided: 0, back: 0 },
  asker: { decided: 0, back: 0 },
};

/** Cards waiting on him now, by kind. */
export const waiting: Record<string, number> = { behaviour: 2, scope: 1 };

export interface Call {
  age: string;
  /** He picked again after the member's call. */
  back?: boolean;
  by: string;
  day: "Today" | "Yesterday" | "This week";
  id: string;
  kind: string;
  /** Still open: waiting on him. */
  open?: boolean;
  pick: string;
  project: string;
  question: string;
  sources?: number;
}

export const calls: Call[] = [
  {
    id: "c1",
    kind: "scope",
    by: "you",
    question: "Ship the phone layout now, or after the tablet pass?",
    pick: "",
    open: true,
    project: "Roost iOS",
    age: "12m",
    day: "Today",
  },
  {
    id: "c2",
    kind: "look",
    by: "design-reviewer",
    question: "How dense is the task row on the board?",
    pick: "Comfortable, 44px",
    project: "Cawco-Dev",
    age: "40m",
    day: "Today",
  },
  {
    id: "c3",
    kind: "approach",
    by: "advisor",
    question:
      "Stream the agent's browser over WebRTC, or hand the video the canvas directly?",
    pick: "The canvas directly",
    sources: 2,
    project: "Cawco-Dev",
    age: "1h",
    day: "Today",
  },
  {
    id: "c4",
    kind: "tools",
    by: "practice",
    question: "zod 4.6 or valibot for the hub's request schemas?",
    pick: "zod 4.6",
    sources: 3,
    project: "Cawco-Dev",
    age: "2h",
    day: "Today",
  },
  {
    id: "c5",
    kind: "behaviour",
    by: "you",
    question: "Should a parked session wake when its card is answered?",
    pick: "",
    open: true,
    project: "Cawco-Dev",
    age: "3h",
    day: "Today",
  },
  {
    id: "c6",
    kind: "look",
    by: "design-reviewer",
    question:
      "Which head for the phone project page: title over tabs, or tabs in the bar?",
    pick: "Tabs in the bar",
    back: true,
    project: "Cawco-Dev",
    age: "5h",
    day: "Today",
  },
  {
    id: "c7",
    kind: "rules",
    by: "advisor",
    question: "Turn off noUnusedLocals in the generated tokens file?",
    pick: "Yes, for generated files only",
    sources: 1,
    project: "Cawco-Dev",
    age: "Yesterday",
    day: "Yesterday",
  },
  {
    id: "c8",
    kind: "behaviour",
    by: "you",
    question:
      "Does Approve continue the same call while you watch, or start a fresh one?",
    pick: "Continue the same call",
    project: "Private office",
    age: "Yesterday",
    day: "Yesterday",
  },
  {
    id: "c9",
    kind: "approach",
    by: "advisor",
    question: "One socket per tab, or one shared worker for every tab?",
    pick: "One shared worker",
    back: true,
    sources: 2,
    project: "Cawco-Dev",
    age: "Yesterday",
    day: "Yesterday",
  },
  {
    id: "c10",
    kind: "tools",
    by: "practice",
    question: "ISO dates or epoch milliseconds in the decision record?",
    pick: "ISO 8601 strings",
    sources: 2,
    project: "HyucksField",
    age: "Yesterday",
    day: "Yesterday",
  },
  {
    id: "c11",
    kind: "scope",
    by: "you",
    question: "Cut the pose picker from the first release of Who decides?",
    pick: "Keep it",
    project: "Cawco-Dev",
    age: "Tue",
    day: "This week",
  },
  {
    id: "c12",
    kind: "rules",
    by: "advisor",
    question: "Skip the probe kit on commits that touch docs only?",
    pick: "Skip it",
    sources: 1,
    project: "Cawco-Dev",
    age: "Mon",
    day: "This week",
  },
];

export const memberOf = (id: string): Member =>
  members.find((one) => one.id === id) ?? BUILT_IN.you;
export const kindById = (id: string): Kind =>
  kinds.find((one) => one.id === id) ?? kinds[0];
export const callsOf = (kind: string) =>
  calls.filter((one) => one.kind === kind);

/** Calls of each kind this month. */
export const perKind: Record<string, number> = {
  look: 18,
  behaviour: 19,
  scope: 12,
  approach: 14,
  rules: 9,
  tools: 41,
};
