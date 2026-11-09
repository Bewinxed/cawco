/**
 * Kinds of choice as they are being changed (build spec §3.6): a kind being
 * added, step by step (Name → What agents read → Who decides it), and a
 * kind being renamed in its row. A kind half added and closed by a press
 * elsewhere is kept in the session's storage, so a reload still opens it
 * where it was (The Work Outlives Its Surface Rule); Cancel is the one
 * discard.
 */
import { type Kind, slugOf } from "@cawco/core/decides";
import { decidesWords } from "@cawco/core/words/decides";
import { z } from "zod";
import { readJson, unstore, writeJson } from "#lib/platform/storage.js";

/** Add a kind's steps, in their order. */
export const KIND_STEPS = ["name", "example", "to"] as const;
export type KindStep = (typeof KIND_STEPS)[number];

const ParkedKindShape = z.object({
  name: z.string(),
  example: z.string(),
  to: z.string(),
  open: z.enum(KIND_STEPS).nullable(),
  reached: z
    .number()
    .int()
    .min(0)
    .max(KIND_STEPS.length - 1),
});
type ParkedKind = z.output<typeof ParkedKindShape>;

/** What keeps a kind from being added, by the step that holds the field. */
export type KindProblems = Partial<Record<KindStep, string>>;

export class KindAdd {
  name = $state("");
  example = $state("");
  /** The member who decides it across the fleet. */
  to = $state("you");
  open = $state<KindStep | null>("name");
  /** The furthest step unfolded, by its index. */
  reached = $state(0);
  /** Continue or Add kind was pressed: the problems show. */
  tried = $state(false);
  saving = $state(false);
  /** The hub refused it: its words, and the step they name. */
  fault = $state<{ reason: string; step: KindStep | null } | null>(null);
  /** Bumped when a press finds a problem: its field comes into view. */
  shown = $state(0);

  constructor(parked?: ParkedKind) {
    if (parked) {
      this.name = parked.name;
      this.example = parked.example;
      this.to = parked.to;
      this.open = parked.open;
      this.reached = parked.reached;
    }
  }

  /** Something was said: closed, it is kept. */
  get changed(): boolean {
    return (
      this.name.trim() !== "" ||
      this.example.trim() !== "" ||
      this.to !== "you" ||
      this.reached > 0
    );
  }

  parked(): ParkedKind {
    return {
      name: this.name,
      example: this.example,
      to: this.to,
      open: this.open,
      reached: this.reached,
    };
  }
}

/** A kind's name and examples, as they are being renamed in its row. */
export class KindRename {
  readonly id: string;
  name = $state("");
  example = $state("");
  saving = $state(false);

  constructor(kind: Kind) {
    this.id = kind.id;
    this.name = kind.name;
    this.example = kind.example;
  }
}

/** A kind's name taken by another, by its name in any case or its id. */
const taken = (kinds: readonly Kind[], name: string, except?: string) =>
  kinds.some(
    (one) =>
      one.id !== except &&
      (one.name.toLowerCase() === name.toLowerCase() ||
        (except === undefined && one.id === slugOf(name)))
  );

/** What keeps a kind's name and examples from being written, as the hub would refuse them. */
export const kindProblems = (
  fields: { example: string; name: string },
  kinds: readonly Kind[],
  except?: string
): KindProblems => {
  const problems: KindProblems = {};
  const name = fields.name.trim();
  if (!(name && slugOf(name))) {
    problems.name = decidesWords.kindNameMissing;
  } else if (taken(kinds, name, except)) {
    problems.name = decidesWords.kindTaken(name);
  }
  if (!fields.example.trim()) {
    problems.example = decidesWords.kindExampleMissing;
  }
  return problems;
};

const FINAL_STOP = /\.$/u;
/** The step a hub refusal names, by its words; null for one no field holds. */
export const stepOfRefusal = (reason: string): KindStep | null => {
  const said = (words: string) =>
    reason.startsWith(words.replace(FINAL_STOP, ""));
  if (said(decidesWords.kindTaken("").split(" called")[0] ?? "")) {
    return "name";
  }
  // "“…” is not a member of Who decides.": its words after the name.
  if (
    reason.includes(
      decidesWords.unknownMember("").slice(2).replace(FINAL_STOP, "")
    )
  ) {
    return "to";
  }
  return null;
};

const parkedKey = (projectId: string | null) =>
  `decides:${projectId ?? "fleet"}:kind`;

export const readParkedKind = (projectId: string | null): KindAdd | null => {
  const parked = readJson(
    parkedKey(projectId),
    ParkedKindShape.nullable(),
    null,
    "session"
  );
  return parked ? new KindAdd(parked) : null;
};

/** Keeps `add` in the session's storage; null forgets it. */
export const writeParkedKind = (
  projectId: string | null,
  add: KindAdd | null
): void => {
  if (add?.changed) {
    writeJson(parkedKey(projectId), add.parked(), "session");
  } else {
    unstore("session", parkedKey(projectId));
  }
};
