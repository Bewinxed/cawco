/**
 * A member's settings, or Add a member, as they are being changed (build
 * spec §3.4): the draft, which row stands open, how far a new member's steps
 * have come, and what still needs fixing. One stands at a time (WhoDecides
 * `setup`). Closed before saving, its draft is parked under its key in the
 * session's storage, so a reload still offers it back (The Work Outlives Its
 * Surface Rule); Cancel is the one discard.
 */
import {
  type FleetDecides,
  HEARS,
  type Hear,
  type Member,
  slugOf,
} from "@cawco/core/decides";
import { ANY_TYPE, type DelegateType } from "@cawco/core/delegate-types";
import {
  EFFORT_LEVELS,
  type EffortLevel,
  HARNESSES,
  type HarnessKind,
} from "@cawco/core/harness/kinds";
import { unhandled } from "@cawco/core/unhandled";
import { decidesWords } from "@cawco/core/words/decides";
import { z } from "zod";
import { readJson, writeJson } from "#lib/platform/storage.js";
import type { FleetOffer } from "./decides-client";

/** Each row a member's settings can hold, in the order they stand. */
export type RowId =
  "does" | "lead" | "runs" | "knows" | "decides" | "hear" | "record";

/** Add a member's key, where a member's settings are keyed by its id. */
export const NEW = "new";

export interface Draft {
  /** May start delegates of its own. */
  delegates: boolean;
  effort: EffortLevel | null;
  harness: HarnessKind | null;
  hear: Hear;
  hue: number;
  instructions: string;
  job: string;
  /** The kinds it decides on this page. */
  kinds: string[];
  /** Null: the harness's default (Caw's only). */
  model: string | null;
  name: string;
  skills: string[];
}

const DraftShape = z.object({
  delegates: z.boolean(),
  effort: z.enum(EFFORT_LEVELS).nullable(),
  harness: z.enum(HARNESSES).nullable(),
  hear: z.enum(HEARS),
  hue: z.number().int().min(1).max(8),
  instructions: z.string(),
  job: z.string(),
  kinds: z.array(z.string()),
  model: z.string().nullable(),
  name: z.string(),
  skills: z.array(z.string()),
});

const ParkedShape = z.object({
  draft: DraftShape,
  adding: z.literal("agent").nullable(),
  open: z
    .enum(["does", "lead", "runs", "knows", "decides", "hear", "record"])
    .nullable(),
  reached: z.number().int().min(0),
  /** The draft as it was opened, to tell a change from none. */
  start: DraftShape,
});
export type Parked = z.output<typeof ParkedShape>;
const ParkedAll = z.record(z.string(), ParkedShape);

/** What's wrong with the draft, by the row that holds the field. */
export type Problems = Partial<Record<RowId, string>>;

export class Setup {
  /** The member's id; {@link NEW} while adding, until the hub has added it. */
  key = $state(NEW);
  draft = $state<Draft>() as Draft;
  /** The draft as opened: a draft equal to it parks nothing. */
  readonly start: Draft;
  /** Adding: the kind of member picked; null while the three tiles ask. */
  adding = $state<"agent" | null>(null);
  open = $state<RowId | null>(null);
  /** Adding: the furthest step unfolded, by its index in the rows. */
  reached = $state(0);
  /** Save or Continue was pressed: the problems show. */
  tried = $state(false);
  /** The picture picker stands open under the head. */
  picking = $state(false);
  saving = $state(false);
  /** The hub refused a save or a picture: its words, and the row they name. */
  fault = $state<{ reason: string; row: RowId | null } | null>(null);
  /** Bumped when Save finds problems: the first scrolls into view. */
  shown = $state(0);
  /** It was opened as Add a member. */
  readonly added: boolean;
  /** The key it was opened by: the card its popover hangs from, while adding too. */
  readonly from: string;

  constructor(key: string, draft: Draft, parked?: Parked) {
    this.key = key;
    this.from = key;
    this.added = key === NEW;
    this.start = parked?.start ?? $state.snapshot(draft);
    this.draft = parked?.draft ?? draft;
    this.adding = parked?.adding ?? null;
    this.open = parked?.open ?? null;
    this.reached = parked?.reached ?? 0;
  }

  /** The draft differs from what was opened. */
  get changed(): boolean {
    return (
      (this.added && this.adding !== null) ||
      JSON.stringify(this.draft) !== JSON.stringify(this.start)
    );
  }

  parked(): Parked {
    return {
      draft: $state.snapshot(this.draft),
      adding: this.adding,
      open: this.open,
      reached: this.reached,
      start: this.start,
    };
  }
}

/** The rows a member's settings hold, by who it is and the page it is on; a member being added has no record yet. */
export const rowsFor = (member: Member | null, project: boolean): RowId[] => {
  const type = member?.type ?? "agent";
  const record: RowId[] = member === null ? [] : ["record"];
  switch (type) {
    case "practice":
      return ["runs", "hear", ...record];
    case "caw":
      return project
        ? ["does", "lead", "runs", "knows", "decides", ...record]
        : ["does", "decides", ...record];
    case "advisor":
    case "agent":
      return ["does", "runs", "knows", "decides", "hear", ...record];
    case "you":
    case "asker":
    case "person":
    case "channel":
      return [];
    default:
      return unhandled("member type", type);
  }
};

/** A row holds only what is: nothing in it can change here. */
export const readOnly = (row: RowId, member: Member | null): boolean =>
  (row === "does" && member !== null && member.type !== "agent") ||
  (row === "knows" && member?.type === "caw") ||
  row === "lead" ||
  row === "record";

/** The first identity hue no member wears, else the first. */
const freeHue = (members: Member[]): number =>
  [1, 2, 3, 4, 5, 6, 7, 8].find(
    (hue) => !members.some((member) => member.hue === hue)
  ) ?? 1;

/** A harness on an online machine, Claude Code first. */
const firstHarness = (fleet: FleetOffer): HarnessKind | null =>
  (HARNESSES.find((id) =>
    fleet.harnesses.some(
      (offer) => offer.id === id && offer.machines.length > 0
    )
  ) as HarnessKind | undefined) ?? null;

/** The model a harness answers on unasked, by its id. */
const defaultModel = (
  fleet: FleetOffer,
  harness: HarnessKind | null
): string | null =>
  fleet.harnesses
    .find((offer) => offer.id === harness)
    ?.models.find((model) => model.default)?.id ?? null;

/** A new agent's draft: nothing said yet, on the first harness the fleet runs. */
export const blankDraft = (fleet: FleetOffer): Draft => {
  const harness = firstHarness(fleet);
  return {
    name: "",
    job: "",
    hue: freeHue(fleet.members),
    hear: "each",
    harness,
    model: defaultModel(fleet, harness),
    effort: "high",
    delegates: false,
    skills: [],
    instructions: "",
    kinds: [],
  };
};

/** A member's draft as the hub holds it: its delegate type's Runs on and Knows, Caw's the project's. */
export const draftOf = (
  member: Member,
  type: DelegateType | undefined,
  kinds: string[],
  caw: { harness: HarnessKind; model: string | null } | null
): Draft => ({
  name: member.name,
  job: member.job,
  hue: member.hue ?? 1,
  hear: member.hear ?? "each",
  harness: caw?.harness ?? type?.harness ?? null,
  model: caw ? caw.model : (type?.model ?? null),
  effort: type?.effort ?? null,
  delegates: type?.mayStart?.includes(ANY_TYPE) ?? false,
  skills: type?.skills ?? [],
  instructions: type?.description ?? "",
  kinds,
});

/** What keeps the draft from saving, by row: only rows it holds count. */
export const problemsOf = (
  draft: Draft,
  rows: RowId[],
  member: Member | null,
  fleet: FleetDecides & Pick<FleetOffer, "harnesses">,
  types: DelegateType[]
): Problems => {
  const problems: Problems = {};
  if (member === null && rows.includes("does")) {
    const name = draft.name.trim();
    const id = slugOf(name);
    if (!(name && id)) {
      problems.does = decidesWords.nameMissing;
    } else if (
      fleet.members.some((one) => one.id === id) ||
      types.some((one) => one.name === id)
    ) {
      problems.does = decidesWords.nameTaken(name);
    }
  }
  if (rows.includes("runs") && member?.type !== "caw") {
    const offer = fleet.harnesses.find((one) => one.id === draft.harness);
    if (!offer || offer.machines.length === 0) {
      problems.runs = decidesWords.noMachine(
        offer?.name ?? draft.harness ?? decidesWords.harnessLabel
      );
    }
  }
  if (
    rows.includes("knows") &&
    member?.type !== "caw" &&
    !draft.instructions.trim()
  ) {
    problems.knows = decidesWords.instructionsMissing;
  }
  return problems;
};

const FINAL_STOP = /\.$/u;
/** The row a hub refusal names, by its words; null for one no field holds. */
export const rowOfRefusal = (reason: string): RowId | null => {
  const said = (words: string) =>
    reason.startsWith(words.replace(FINAL_STOP, ""));
  if (
    said(decidesWords.nameMissing) ||
    said(decidesWords.nameTaken("").split(" called")[0] ?? "")
  ) {
    return "does";
  }
  if (said(decidesWords.instructionsMissing)) {
    return "knows";
  }
  if (reason.includes(" is on no machine yet")) {
    return "runs";
  }
  return null;
};

/** The session's parked drafts on a page, by key. */
const parkedKey = (projectId: string | null) =>
  `decides:${projectId ?? "fleet"}:parked`;

export const readParked = (projectId: string | null): Record<string, Parked> =>
  readJson(parkedKey(projectId), ParkedAll, {}, "session");

export const writeParked = (
  projectId: string | null,
  parked: Record<string, Parked>
): void => writeJson(parkedKey(projectId), parked, "session");
