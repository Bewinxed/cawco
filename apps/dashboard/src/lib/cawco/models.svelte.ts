/**
 * The model list, once for the whole app: what each machine reports its
 * harnesses can run, and for Claude each signed-in account's catalog, which
 * the hub reads per account and keeps. The catalog is a property of an
 * installed CLI and the account behind it, never of a session that happens
 * to be up, so nothing here asks a session. A harness with no catalog says
 * why ({@link models}`.unread`).
 */

import {
  type HarnessKind,
  isEffortLevel,
  type ModelInfo,
} from "@cawco/core/harness/kinds";
import { traitsOf } from "@cawco/core/harness/traits";
import { machineLabel } from "@cawco/core/machine-names";
import {
  LONG_CONTEXT,
  type ModelListing,
  modelListingOn,
  modelNameIn,
} from "@cawco/core/model-names";
import { z } from "zod";
import { hub } from "#lib/platform/hub.js";
import { hubData } from "#lib/platform/hub-read.js";
import { readJson, writeJson } from "#lib/platform/storage.js";
import {
  admittedOn,
  covers,
  type HarnessModel,
  type ListingsOn,
  modelsForHarness,
  typedOffered,
} from "./model-catalog";
import { accountsStore } from "./stores/accounts.svelte";
import { boardStore } from "./stores/board.svelte";
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
  for (const machine of boardStore.machines) {
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
  const view = accountsStore.accounts;
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

/**
 * The reported catalog, Claude rows carrying the window the hub saw a turn
 * report: built once each time what it is read from changes. Built on each
 * call instead, every delegate row a transcript mounted as it scrolled
 * rebuilt every machine's and every account's rows for its model's name
 * (`modelLabel`; nightly 7148: 15ms of a long conversation's wheel).
 */
const catalogRows = $derived.by(() =>
  reported().map((row) => {
    const window =
      traitsOf(row.harness).contextWindow === "hub"
        ? store.claudeWindows[row.resolvedModel ?? row.value]
        : undefined;
    return window ? { ...row, contextWindow: window } : row;
  })
);

function catalog(): HarnessModel[] {
  return catalogRows;
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
  const machines = boardStore.machines.filter(
    (machine) => !machineIds?.length || machineIds.includes(machine.machineId)
  );
  const said =
    traitsOf(harness).modelCatalog === "account"
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
  if (said.length > 0) {
    return `${speakerName(harness)}'s models couldn't be read. ${said.join(" ")}`;
  }
  // Only Claude's catalogs are read by the hub; another harness that says
  // nothing has said nothing yet.
  return traitsOf(harness).modelCatalog === "account"
    ? "The hub hasn't read the models of the Claude accounts signed in here yet. It tries again until it can."
    : null;
}

/**
 * Claude's side of {@link unread}: the hub's fault for each account signed in
 * on `machineIds` that has no catalog; empty while none has one yet (a read
 * on its way); null with none signed in there.
 */
function claudeUnread(machineIds: string[]): string[] | null {
  const view = accountsStore.accounts;
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

/**
 * What `harness` lists on `machineId`, as the hub judges a start there
 * (core `modelListingOn`): the catalogs read of the Claude accounts signed
 * in there, with the faults of those not read, and the machine's report of
 * OpenCode or pi.
 */
function listingOn(harness: HarnessKind, machineId: string): ModelListing {
  const view = accountsStore.accounts;
  const signedIn = new Set(
    (view?.signins ?? [])
      .filter(
        (signin) =>
          signin.state === "signed-in" && signin.machineId === machineId
      )
      .map((signin) => signin.accountId)
  );
  return modelListingOn(harness, {
    report: boardStore.machines
      .find((machine) => machine.machineId === machineId)
      ?.harnesses?.find((report) => report.harness === harness),
    catalogs: (view?.catalogs ?? [])
      .filter((kept) => signedIn.has(kept.accountId))
      .map((kept) => kept.models),
    faults: (view?.catalogFaults ?? [])
      .filter((fault) => signedIn.has(fault.accountId))
      .map((fault) => fault.reason),
  });
}

/**
 * Where a picker judges a model for `harness`: on `machineIds`, every one;
 * with none chosen, on any machine of the fleet.
 */
const listingsOn = (harness: HarnessKind, machineIds?: string[]): ListingsOn =>
  machineIds?.length
    ? {
        every: true,
        listings: machineIds.map((machineId) => listingOn(harness, machineId)),
      }
    : {
        every: false,
        listings: boardStore.machines.map((machine) =>
          listingOn(harness, machine.machineId)
        ),
      };

/** Reads the claude windows the hub has observed, for pickers that size models. */
export async function loadModelWindows(): Promise<void> {
  const answer = await hubData(hub.api["model-windows"].get());
  store.claudeWindows = answer.claude;
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
  /**
   * Ids typed in for `harness` that its offered list on `machineIds` does
   * not cover and a start there is admitted on (model-catalog
   * `typedOffered`), newest first.
   */
  recentFor: (harness: HarnessKind, machineIds?: string[]): string[] =>
    typedOffered(
      harness,
      store.recent[harness] ?? [],
      modelsForHarness(catalog(), harness, machineIds),
      listingsOn(harness, machineIds)
    ),
  /**
   * Whether a start on `id`, typed in, is admitted for `harness` on
   * `machineIds` (model-catalog `admittedOn`).
   */
  admits: (harness: HarnessKind, id: string, machineIds?: string[]): boolean =>
    admittedOn(harness, id, listingsOn(harness, machineIds)),
};

/**
 * A row that names a choice rather than a model. More than one row can resolve
 * to the same wire id, and this one comes first in the harness's own list, so
 * it is what a plain search finds: a session running Opus would be called
 * "Default (recommended)" in its own header, which says what somebody picked
 * and not what is running. Looked at last, so it answers only when it is the
 * only row that does.
 */
const NAMES_NO_MODEL = new Set(["default"]);

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
  for (const id of new Set([model, model.replace(LONG_CONTEXT, "")])) {
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

/** What to call a model in a trigger: its name in the offered list (@cawco/core/model-names), or the id as typed. */
export function modelLabel(model: string, harness?: string): string {
  if (!model) {
    return "Default";
  }
  return modelNameIn(models.forHarness(harness), model) ?? model;
}

/**
 * Remembers an id the user typed for `harness`, so its next session can pick
 * it off a list. A typed id is, by definition, one the catalog does not offer
 * — that is the whole reason it was typed — so nothing here checks it against
 * the catalog. `models.recentFor` hides any that the catalog later comes to
 * cover or a start on the machine is not admitted on, and each harness's
 * shortlist is capped, so a typo costs one slot
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
