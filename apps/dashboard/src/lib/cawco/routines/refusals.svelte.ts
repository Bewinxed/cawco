/**
 * What the hub refused of an act on a routine (Run now, Pause, Resume,
 * Keep, Delete), by routine: said under the routine's row in its words,
 * where the act was asked, and kept until the reader acts on it (DESIGN.md,
 * The Work Outlives Its Surface Rule; DESIGN.md, Voice, "Error formula").
 * Never a toast. Kept per tab in sessionStorage, so a reload says it again.
 */
import { SvelteMap } from "svelte/reactivity";
import { z } from "zod";
import { RoutineRefusalSchema } from "#lib/cawco/stored-shapes.js";
import { readJson, writeJson } from "../storage";

export type RoutineAct = "run" | "pause" | "resume" | "keep" | "remove";

export interface RoutineRefusal {
  act: RoutineAct;
  /** The refusal in words: what did not happen, then the hub's why. */
  reason: string;
}

const KEY = "cawco:routine-refusals";

const refusals = new SvelteMap<string, RoutineRefusal>(
  readJson(
    KEY,
    z.array(z.tuple([z.string(), RoutineRefusalSchema])),
    [],
    "session"
  )
);

const keep = () => writeJson(KEY, [...refusals], "session");

export const routineRefusals = {
  of: (routineId: string): RoutineRefusal | null =>
    refusals.get(routineId) ?? null,
  set(routineId: string, refusal: RoutineRefusal): void {
    refusals.set(routineId, refusal);
    keep();
  },
  clear(routineId: string): void {
    if (refusals.delete(routineId)) {
      keep();
    }
  },
};
