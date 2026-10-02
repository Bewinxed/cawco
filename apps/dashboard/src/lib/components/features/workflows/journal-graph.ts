/**
 * What a run's log says beyond its steps, for the run's tab: the program's
 * own narration (`w.log`, its notices) and the checkpoints it marked. The
 * step rows carry the statuses; nothing here infers one.
 */

import type { WorkflowLogEntry } from "@cawco/core";

export interface JournalCheckpoint {
  at: string;
  data: unknown;
  label: string;
  seq: number;
}
export interface JournalLogLine {
  at: string;
  kind: "log" | "notify";
  seq: number;
  text: string;
}

/** One argument of the call, as the log keeps it. */
const arg = (effect: WorkflowLogEntry, name: string): string =>
  String(effect.args?.[name] ?? "");

/** The checkpoints the program marked, in the order it marked them. */
export function journalCheckpoints(
  effects: WorkflowLogEntry[]
): JournalCheckpoint[] {
  return [...effects]
    .sort((a, b) => a.seq - b.seq)
    .filter((effect) => effect.kind === "checkpoint")
    .map((effect) => ({
      seq: effect.seq,
      label: arg(effect, "label"),
      data: effect.args?.data ?? null,
      at: String(effect.at),
    }));
}

/** The run's own narration: `w.log` lines and the notices it sent. */
export function journalLog(effects: WorkflowLogEntry[]): JournalLogLine[] {
  return [...effects]
    .sort((a, b) => a.seq - b.seq)
    .filter((effect) => effect.kind === "log" || effect.kind === "notify")
    .map((effect) => ({
      seq: effect.seq,
      kind: effect.kind as "log" | "notify",
      at: String(effect.at),
      text: arg(effect, "text"),
    }));
}
