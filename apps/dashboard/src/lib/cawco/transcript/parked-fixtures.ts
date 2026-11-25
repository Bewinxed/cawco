/**
 * What a session of the Cawco-Dev project put to the person outside a tool
 * call, shaped as the hub answers it (core parked.ts, `GET
 * /api/instances/:id/parked`): a design graph's directions for the grey a
 * hovered row and button take at night, a third direction of it, and a
 * decision card of its page; and the `artifact_create` calls that put them,
 * as the transcript holds them. The states ParkedPrompt.stories.ts draws.
 */
import type { ParkedCard, ParkedPick } from "@cawco/core/parked";
import type { Message } from "../types";

const SESSION = "s-parked-orchestrator";

/** The grey of each direction at night, by its states file: the value the stand-in drawing takes (the product's is the stage page's). */
export const DIRECTION_GREYS: Record<string, string> = {
  "apps/dashboard/src/lib/tokens/HoverOneStep.stories.ts":
    "light-dark(var(--color-neutral-4), var(--color-neutral-4))",
  "apps/dashboard/src/lib/tokens/HoverTwoSteps.stories.ts":
    "light-dark(var(--color-neutral-4), var(--color-neutral-5))",
  "apps/dashboard/src/lib/tokens/HoverWarm.stories.ts":
    "light-dark(var(--color-neutral-4), oklch(30.5% 0.018 62))",
};

const GREYS: ParkedPick = {
  kind: "directions",
  key: "judge",
  artifact: {
    id: "4f1c2a7e-9b3d-4c55-8e21-6a0f3d9b7c11",
    name: "dark-hover-grey",
    title: "Hover grey at night",
  },
  askedAt: "2026-11-24T09:12:00.000Z",
  state: "open",
  dismissed: null,
  words: null,
  ask: "Which grey do hovered rows and buttons use on the dark side?",
  path: "/__cawco/canvas?file=apps/dashboard/src/lib/tokens/HoverOneStep.stories.ts",
  picked: null,
  pickedAt: null,
  directions: [
    {
      file: "apps/dashboard/src/lib/tokens/HoverOneStep.stories.ts",
      name: "One step up",
      line: "Ghost buttons in every bar, menu rows and Sessions' rows under the pointer, at night: neutral 4, as today.",
      story: "Live",
    },
    {
      file: "apps/dashboard/src/lib/tokens/HoverTwoSteps.stories.ts",
      name: "Two steps up",
      line: "The same places, a step lighter, so a hovered row still shows on a raised panel at night.",
      story: "Live",
    },
  ],
};

/** Two directions of the night hover grey. */
export const TWO_DIRECTIONS: ParkedPick = GREYS;

/** Three: a warm grey beside the two. */
export const THREE_DIRECTIONS: ParkedPick = {
  ...GREYS,
  directions: [
    ...GREYS.directions,
    {
      file: "apps/dashboard/src/lib/tokens/HoverWarm.stories.ts",
      name: "Warm step",
      line: "Two steps up, leaning to the warm neutral of the page, so hover reads as the surface and never as a grey patch.",
      story: "Live",
    },
  ],
};

/** A decision card of the composer's page. */
export const DECISION_CARD: ParkedCard = {
  kind: "card",
  key: "card:minimized-bar",
  artifact: {
    id: "8a3b5d10-2c4e-4f6a-9b7c-1d2e3f405162",
    name: "parked-picks",
    title: "Picks parked in the composer",
  },
  askedAt: "2026-11-24T09:20:00.000Z",
  state: "open",
  dismissed: null,
  words: null,
  answer: null,
  card: {
    id: "minimized-bar",
    question:
      "Where does a minimized pick stand while you read the conversation?",
    why: "The tray row already holds what waits on you, so a bar there costs the transcript no room.",
    kind: "look",
    mockup: null,
    multiple: false,
    section: null,
    after: [],
    options: [
      {
        id: "tray",
        keycap: 1,
        label: "On the tray row",
        line: "A one-line bar where the delegate chips stand, as a minimized question does.",
        cost: "The delegate chips step aside while it stands.",
        recommended: true,
      },
      {
        id: "chip",
        keycap: 2,
        label: "In the Needs you chip",
        line: "Only the count goes up; the list opens it.",
        cost: "One more press to see what it asks.",
        recommended: false,
      },
    ],
  },
};

/** A card he answered with a note alone, as the transcript keeps it. */
export const NOTE_ONLY: ParkedCard = {
  ...DECISION_CARD,
  state: "answered",
  answer: {
    at: "2026-11-24T09:24:00.000Z",
    options: [],
    note: "Neither yet: show me both on a phone first, the tray row is already full there.",
  },
};

/** The two directions, picked. */
export const PICKED: ParkedPick = {
  ...TWO_DIRECTIONS,
  state: "answered",
  picked: "apps/dashboard/src/lib/tokens/HoverTwoSteps.stories.ts",
  pickedAt: "2026-11-24T09:15:00.000Z",
};

/** The two directions, answered in his own words with no pick. */
export const DIRECTIONS_IN_WORDS: ParkedPick = {
  ...TWO_DIRECTIONS,
  state: "answered",
  words: {
    at: "2026-11-24T09:16:00.000Z",
    words:
      "Neither: both greys vanish on the raised panel. Try one that also lifts the row's text a step.",
  },
};

/** The card, answered in his own words with no pick. */
export const CARD_IN_WORDS: ParkedCard = {
  ...DECISION_CARD,
  state: "answered",
  words: {
    at: "2026-11-24T09:26:00.000Z",
    words: "Isn't there a setting for this already? I'm confused.",
  },
};

/** The two directions, dismissed without a word. */
export const DISMISSED_PICK: ParkedPick = {
  ...TWO_DIRECTIONS,
  state: "dismissed",
  dismissed: { at: "2026-11-24T09:16:00.000Z", note: "" },
};

/** The card, dismissed without a word. */
export const DISMISSED_CARD: ParkedCard = {
  ...DECISION_CARD,
  state: "dismissed",
  dismissed: { at: "2026-11-24T09:25:00.000Z", note: "" },
};

/** The agent's question that waits behind a pick. */
export const QUEUED_QUESTION =
  "The nightly is held for the host checks. Ship it now, or wait for them to pass?";

/** The `artifact_create` call that opened `item`, as the transcript holds it. */
export const createCall = (item: ParkedPick | ParkedCard): Message => ({
  id: `call-${item.artifact.id}`,
  instanceId: SESSION,
  type: "tool.use",
  content: "",
  timestamp: item.askedAt,
  toolCallId: `call-${item.artifact.id}`,
  metadata: {
    toolName: "mcp__cawco__artifact_create",
    toolInput:
      item.kind === "directions"
        ? {
            kind: "component",
            does: "judge",
            name: item.artifact.name,
            title: item.artifact.title,
            ask: item.ask,
            directions: item.directions,
          }
        : {
            kind: "page",
            does: "pick",
            name: item.artifact.name,
            title: item.artifact.title,
            ask: "Pick where a minimized pick stands",
            program: `root = Decisions([d1])\nd1 = Decision("${item.card.id}", "${item.card.question}", [])`,
          },
    toolResult: `Opened [${item.artifact.title}](cawco:artifact/${item.artifact.id}) in your panel.`,
    toolStatus: "success",
  },
});
