/**
 * The model list, once for the whole app: what each machine reports its
 * harnesses can run, and for Claude each signed-in account's catalog, which
 * the hub reads per account and keeps. The catalog is a property of an
 * installed CLI and the account behind it, never of a session that happens
 * to be up, so nothing here asks a session. A harness with no catalog says
 * why ({@link models}`.unread`).
 */

import type { ModelInfo } from "@cawco/core/harness";
import { isEffortLevel } from "@cawco/core/harness";
import { machineLabel } from "@cawco/core/machine-names";
import { z } from "zod";
import { hubRefusal } from "#lib/cawco/hub-read.js";
import { cawco } from "./client.svelte";
import { type HarnessModel, modelsForHarness } from "./model-catalog";
import { readJson, writeJson } from "./storage";
import { speakerName } from "./transcript/speaker";

/**
 * Every key hangs off one prefix so the imminent product rename is one edit.
 * Nothing else may write the literal.
 */
export const MODEL_STORAGE_PREFIX = "cawco-models";
const RECENT_KEY = `${MODEL_STORAGE_PREFIX}:recent-by-harness`;

/** How many typed-in model ids are remembered per harness — a shortlist, not a history. */
const RECENT_LIMIT = 5;

/**
 * The form's value when the user has not chosen: no model is sent at all, and
 * the harness runs its own default.
 */
export const MODEL_DEFAULT = "";

const store = $state({
  /**
   * Claude models' context windows as the hub last saw a turn report them —
   * claude's own catalog carries none. Keyed by wire id.
   */
  claudeWindows: {} as Record<string, number>,
  /** Typed-in ids by the harness they were typed for, newest first. */
  recent: {} as Record<string, string[]>,
});

// Read once as the module loads rather than from a getter — a read that
// writes is a render that mutates. Nothing to read on the server.
store.recent = readJson(
  RECENT_KEY,
  z.record(z.string(), z.array(z.string())),
  {}
);

/**
 * What the machines themselves report they can run. A harness whose catalog
 * its machine could not read is absent here, and says why in its report
 * (`modelsUnread`).
 */
function reported(): HarnessModel[] {
  const rows: HarnessModel[] = [];
  for (const machine of cawco.machines) {
    for (const report of machine.harnesses ?? []) {
      for (const model of report.models ?? []) {
        rows.push({
          ...model,
          harness: report.harness,
          machineId: machine.machineId,
        });
      }
    }
  }
  return [...rows, ...accountRows()];
}

/**
 * Claude's models: each account's catalog, as its Claude Code answered at
 * initialize and the hub keeps, on every machine the account is signed in
 * on. A model's default effort is the one its sessions ran at when nobody
 * chose one; absent until one has.
 */
function accountRows(): HarnessModel[] {
  const view = cawco.accounts;
  if (!view) {
    return [];
  }
  return view.signins
    .filter((signin) => signin.state === "signed-in")
    .flatMap((signin) => {
      const kept = view.catalogs.find(
        (one) => one.accountId === signin.accountId
      );
      return (kept?.models ?? []).map((model) => {
        const learned =
          kept?.defaultEfforts[model.resolvedModel ?? model.value];
        return {
          ...model,
          ...(isEffortLevel(learned) ? { defaultEffort: learned } : {}),
          harness: "claude" as const,
          machineId: signin.machineId,
          accountId: signin.accountId,
        };
      });
    });
}

/** The reported catalog, Claude rows carrying the window the hub saw a turn report. */
function catalog(): HarnessModel[] {
  return reported().map((row) => {
    const window =
      row.harness === "claude"
        ? store.claudeWindows[row.resolvedModel ?? row.value]
        : undefined;
    return window ? { ...row, contextWindow: window } : row;
  });
}

/**
 * Why `harness` offers nothing to pick on `machineIds` (every machine when
 * none are named), or null when it offers something or nothing says why: each
 * machine that could not read its catalog, in its own words; for Claude, the
 * hub's last probe of each account signed in there whose models it could not
 * read, or that it has not read them yet (it tries again until it can).
 */
function unread(harness: string, machineIds?: string[]): string | null {
  if (modelsForHarness(catalog(), harness, machineIds).length > 0) {
    return null;
  }
  const machines = cawco.machines.filter(
    (machine) => !machineIds?.length || machineIds.includes(machine.machineId)
  );
  const said =
    harness === "claude"
      ? claudeUnread(machines.map((machine) => machine.machineId))
      : machines.flatMap((machine) => {
          const why = machine.harnesses?.find(
            (report) => report.harness === harness
          )?.modelsUnread;
          return why ? [`${machineLabel(machine.hostname)}: ${why}`] : [];
        });
  if (said === null) {
    return null;
  }
  return said.length > 0
    ? `${speakerName(harness)}'s models couldn't be read. ${said.join(" ")}`
    : "The hub hasn't read the models of the Claude accounts signed in here yet. It tries again until it can.";
}

/**
 * Claude's side of {@link unread}: the hub's fault for each account signed in
 * on `machineIds` that has no catalog; empty while none has one yet (a read
 * on its way); null with none signed in there.
 */
function claudeUnread(machineIds: string[]): string[] | null {
  const view = cawco.accounts;
  const accounts = new Set(
    (view?.signins ?? [])
      .filter(
        (signin) =>
          signin.state === "signed-in" && machineIds.includes(signin.machineId)
      )
      .map((signin) => signin.accountId)
  );
  if (accounts.size === 0) {
    return null;
  }
  return (view?.catalogFaults ?? [])
    .filter((fault) => accounts.has(fault.accountId))
    .map((fault) => fault.reason);
}

/** Reads the claude windows the hub has observed, for pickers that size models. */
export async function loadModelWindows(): Promise<void> {
  const response = await fetch("/api/model-windows");
  if (!response.ok) {
    throw await hubRefusal(response);
  }
  store.claudeWindows = (
    (await response.json()) as { claude: Record<string, number> }
  ).claude;
}

export const models = {
  get offered(): ModelInfo[] {
    return modelsForHarness(catalog());
  },
  /**
   * A harness's models; given `machineIds`, only what those machines run;
   * given `accountId`, only what that account's Claude Code offers.
   */
  forHarness: (
    harness?: string,
    machineIds?: string[],
    accountId?: string | null
  ): ModelInfo[] =>
    modelsForHarness(
      accountId
        ? catalog().filter(
            (row) => row.accountId === undefined || row.accountId === accountId
          )
        : catalog(),
      harness,
      machineIds
    ),
  unread,
  /** Ids typed in for `harness` that its offered list does not cover, newest first. */
  recentFor: (harness: string): string[] => {
    const rows = modelsForHarness(catalog(), harness);
    return (store.recent[harness] ?? []).filter(
      (id) => !rows.some((row) => covers(row, id))
    );
  },
};

/**
 * An offered row stands for a model id if either name matches: `system.init`
 * reports the wire id (`claude-sonnet-5`) while the row that offers it is keyed
 * by its alias (`sonnet`).
 */
export const covers = (row: ModelInfo, model: string): boolean =>
  row.value === model || row.resolvedModel === model;

/**
 * A row that names a choice rather than a model. More than one row can resolve
 * to the same wire id, and this one comes first in the harness's own list, so
 * it is what a plain search finds: a session running Opus would be called
 * "Default (recommended)" in its own header, which says what somebody picked
 * and not what is running. Looked at last, so it answers only when it is the
 * only row that does.
 */
const NAMES_NO_MODEL = new Set(["default"]);

/** The 1M-context variant's mark on a Claude model id: `claude-opus-5-5[1m]`. */
const CONTEXT_SUFFIX = /\[1m\]$/iu;

/**
 * The offered row for a model id — the one that carries its name, its provider
 * and the effort scale it can be run at. A row that names the model wins over
 * one that only says "default".
 *
 * A session on the 1M-context variant reports `claude-opus-5-5[1m]`, which no
 * row is keyed by: the catalog lists the model once. That id is the same model
 * with a larger window, run at the same effort scale, so it is described by
 * its model's row when no row names the variant itself.
 */
export const describingRow = (
  model: string,
  harness?: string
): ModelInfo | null => {
  const list = models.forHarness(harness);
  for (const id of new Set([model, model.replace(CONTEXT_SUFFIX, "")])) {
    const row =
      list.find(
        (item) => !NAMES_NO_MODEL.has(item.value) && covers(item, id)
      ) ?? list.find((item) => covers(item, id));
    if (row) {
      return row;
    }
  }
  return null;
};

/** What to call a model in a trigger: the offered name, or the id as typed. */
export function modelLabel(model: string, harness?: string): string {
  if (!model) {
    return "Default";
  }
  return describingRow(model, harness)?.displayName ?? model;
}

/**
 * Remembers an id the user typed for `harness`, so its next session can pick
 * it off a list. A typed id is, by definition, one the catalog does not offer
 * — that is the whole reason it was typed — so nothing here checks it against
 * the catalog. `models.recentFor` hides any that the catalog later comes to
 * cover, and each harness's shortlist is capped, so a typo costs one slot
 * until it scrolls off.
 */
export function rememberModel(model: string, harness: string): void {
  const id = model.trim();
  if (!id) {
    return;
  }
  store.recent = {
    ...store.recent,
    [harness]: [
      id,
      ...(store.recent[harness] ?? []).filter((seen) => seen !== id),
    ].slice(0, RECENT_LIMIT),
  };
  writeJson(RECENT_KEY, store.recent);
}
