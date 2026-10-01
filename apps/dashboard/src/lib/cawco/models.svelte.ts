/**
 * The model list, once for the whole app. `supportedModels()` is a `Query`
 * method, so it can only be asked through a session that is already up — and
 * each harness type returns its own list (Claude models from a Claude session,
 * opencode models from an opencode session). One session per unique harness is
 * queried and the results are merged, so the picker shows everything the fleet
 * can run. Kept in localStorage across visits.
 */

import type { HarnessKind, InstanceRow, ModelInfo } from "@cawco/core";
import { untrack } from "svelte";
import { cawco, isCustodyRefusal, loadModels } from "./client.svelte";
import { type HarnessModel, modelsForHarness } from "./model-catalog";
import { readJson, writeJson } from "./storage";

/**
 * Both keys hang off one prefix so the imminent product rename is one edit.
 * Nothing else may write the literal.
 */
export const MODEL_STORAGE_PREFIX = "cawco-models";
const OFFERED_KEY = `${MODEL_STORAGE_PREFIX}:by-harness`;
const RECENT_KEY = `${MODEL_STORAGE_PREFIX}:recent`;

/** How many typed-in model ids are remembered — a shortlist, not a history. */
const RECENT_LIMIT = 5;

/** What the form sends when the user has not chosen: nothing, and the SDK picks. */
export const MODEL_DEFAULT = "";

const store = $state({
  /**
   * Claude models' context windows as the hub last saw a turn report them —
   * claude's own catalog carries none. Keyed by wire id.
   */
  claudeWindows: {} as Record<string, number>,
  offered: [] as HarnessModel[],
  recent: [] as string[],
  loading: false,
  /** Why the last read failed, for the picker to say instead of showing nothing. */
  error: null as string | null,
});

// What the last visit learned, read once as the module loads rather than from a
// getter — a read that writes is a render that mutates. Nothing to read on the
// server, where the picker is a trigger and no more.
if (typeof localStorage !== "undefined") {
  store.offered = readJson<HarnessModel[]>(OFFERED_KEY, []);
  store.recent = readJson<string[]>(RECENT_KEY, []);
}

/** One running session per unique harness, so each harness type is queried. */
function liveByHarness(): InstanceRow[] {
  const seen = new Set<string>();
  const result: InstanceRow[] = [];
  for (const row of cawco.runningInstances) {
    const harness = row.harness ?? "claude";
    if (seen.has(harness)) {
      continue;
    }
    seen.add(harness);
    result.push(row);
  }
  return result;
}

/** Whether any running session can answer a `supportedModels` call. */
const hasLiveSession = () => cawco.runningInstances.length > 0;

/**
 * Sessions already asked, for the life of the page. Plain, not `$state`: an
 * effect that calls `ensureModels` must not depend on it. A session that
 * refused is in here too — asking it again on every render was a tight loop,
 * and each ask made the agent write a frame into the transcript.
 *
 * Recovery does not come from re-asking these, it comes from the ones that are
 * not in here yet: a session spawned after the walk is a fresh candidate, and
 * a session spawned after a restart is the one most likely to answer.
 */
const asked = new Set<string>();

/** Sessions of one harness that have not been asked yet, in board order. */
function candidates(kind: string, harness?: string): InstanceRow[] {
  return cawco.runningInstances.filter(
    (row) =>
      (row.harness ?? "claude") === kind &&
      !asked.has(row.id) &&
      (!harness || kind === harness)
  );
}

/** How many are asked at once while walking a harness's sessions. */
const ASK_BATCH = 8;

/**
 * What one harness answers, by asking its sessions until one of them does.
 *
 * Asking a single nominee was the bug. Which session that is depends on board
 * order, and a session that CANNOT answer is common: every one adopted after an
 * agent restart refuses each control until it hands back. One refusal therefore
 * left a whole harness with no catalog — no model names, and no effort scale on
 * any of its sessions — while dozens of healthy siblings sat unasked behind it.
 * There is no cap that fixes this, because the one that answers can be last.
 *
 * Walking them is affordable precisely because the failure is cheap: a refusal
 * is decided by the agent without reaching a model, and `supportedModels` is a
 * read-only control, so a refused one writes nothing into a transcript. The
 * walk stops at the first answer, so a healthy fleet asks once.
 */
async function askHarness(
  kind: string,
  harness: string | undefined
): Promise<{ custody: boolean; list?: ModelInfo[]; refused?: unknown }> {
  let custody = false;
  let refused: unknown;
  for (
    let batch = candidates(kind, harness).slice(0, ASK_BATCH);
    batch.length > 0;
    batch = candidates(kind, harness).slice(0, ASK_BATCH)
  ) {
    for (const row of batch) {
      asked.add(row.id);
    }
    // biome-ignore lint/performance/noAwaitInLoops: each batch is asked only because the one before it produced no answer — that is the point of the walk
    const lists = await Promise.all(
      batch.map((row) =>
        loadModels(row.id, row.machineId).catch(
          (error: unknown): ModelInfo[] | undefined => {
            if (isCustodyRefusal(error)) {
              custody = true;
            } else {
              refused ??= error;
            }
            return undefined;
          }
        )
      )
    );
    const answer = lists.find((list) => list !== undefined);
    if (answer) {
      return { custody, list: answer, refused };
    }
  }
  return { custody, refused };
}

async function ask(harness?: string): Promise<void> {
  if (liveByHarness().length === 0) {
    throw new Error(
      "A session has to be running to ask what models it offers."
    );
  }
  // A harness its machine already described is not asked at all — that is the
  // point of the report. What is left is the harnesses only a session can
  // answer for.
  const described = new Set<string>(reported().map((row) => row.harness));
  const kinds = [
    ...new Set(
      cawco.runningInstances
        .map((row) => row.harness ?? "claude")
        .filter((kind) => !harness || kind === harness)
    ),
  ].filter(
    (kind) => !described.has(kind) && candidates(kind, harness).length > 0
  );
  if (kinds.length === 0) {
    return;
  }
  store.loading = true;
  store.error = null;
  try {
    const results = await Promise.all(
      kinds.map((kind) => askHarness(kind, harness))
    );
    const answered = new Map<HarnessKind, ModelInfo[]>();
    let custody = false;
    let refused: unknown;
    for (const [index, result] of results.entries()) {
      if (result.list) {
        answered.set(kinds[index] as HarnessKind, result.list);
      }
      custody ||= result.custody;
      refused ??= result.refused;
    }
    const merged = [...answered].flatMap(([kind, list]) =>
      list.map((model) => ({ ...model, harness: kind }))
    );
    if (merged.length === 0 && refused !== undefined) {
      throw refused;
    }
    if (merged.length === 0 && custody) {
      throw new Error(
        "Every session we could ask is being handed back after an agent restart. Try again in a moment."
      );
    }
    store.offered = [
      ...store.offered.filter((row) => !answered.has(row.harness)),
      ...merged,
    ];
    writeJson(OFFERED_KEY, store.offered);
  } finally {
    store.loading = false;
  }
}

/**
 * What the machines themselves report they can run — the catalog as a property
 * of an installed CLI rather than of a session that happens to be up.
 *
 * This is the answer whenever a machine gives one. It needs no session, so it
 * survives everything the session route did not: nothing running, everything in
 * custody after an agent restart, a fleet that is entirely idle. A harness that
 * reports no catalog (an older agent, or one whose probe failed) is simply
 * absent here, and falls through to asking a session below.
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
  return rows;
}

/**
 * Reported first, asked second. Both are the same shape and the same question,
 * so a harness answered by its machine simply never reaches the ask — and one
 * that is not (opencode, whose catalog really does hang off a running server)
 * carries on as before.
 */
function catalog(): HarnessModel[] {
  const machineRows = reported();
  const described = new Set(machineRows.map((row) => row.harness));
  return [
    ...machineRows,
    ...store.offered.filter((row) => !described.has(row.harness)),
  ].map((row) => {
    const window =
      row.harness === "claude"
        ? store.claudeWindows[row.resolvedModel ?? row.value]
        : undefined;
    return window ? { ...row, contextWindow: window } : row;
  });
}

/** Reads the claude windows the hub has observed, for pickers that size models. */
export async function loadModelWindows(): Promise<void> {
  const response = await fetch("/api/model-windows");
  if (!response.ok) {
    throw new Error(await response.text());
  }
  store.claudeWindows = (
    (await response.json()) as { claude: Record<string, number> }
  ).claude;
}

export const models = {
  get offered(): ModelInfo[] {
    return modelsForHarness(catalog());
  },
  /** A harness's models; given `machineIds`, only what those machines run. */
  forHarness: (harness?: string, machineIds?: string[]): ModelInfo[] =>
    modelsForHarness(catalog(), harness, machineIds),
  /** Typed-in ids the offered list does not cover, newest first. */
  get recent(): string[] {
    const rows = catalog();
    return store.recent.filter((id) => !rows.some((row) => covers(row, id)));
  },
  get loading(): boolean {
    return store.loading;
  },
  get error(): string | null {
    return store.error;
  },
  /** Whether a session is up to ask through — what the refresh item is gated on. */
  get askable(): boolean {
    return hasLiveSession();
  },
  askableFor: (harness?: string): boolean =>
    liveByHarness().some(
      (row) => !harness || (row.harness ?? "claude") === harness
    ),
};

/**
 * Refreshes the list once per page, through whoever is running. Silent about
 * there being no session to ask through: opening a picker is not the moment to
 * complain that nothing is running. Each session is asked once per page,
 * whatever it answered; the reads are untracked so a caller's effect depends
 * only on what it reads itself, not on the store this changes.
 *
 * What was cached is a warm start, NOT a reason to stop asking. Stopping on a
 * non-empty list was wrong twice over. Most callers pass no harness, so ONE
 * harness's rows answered for every harness: a browser that had cached an
 * opencode list never asked a Claude session what it offers, and every Claude
 * session on the board read as a model nothing describes — no name, and no
 * effort scale, because the row that carries the scale was never fetched. And
 * the list comes from a harness binary that is upgraded under us, so even a
 * list of the right harness goes out of date. Neither had any invalidation but
 * a hand-clicked "Refresh models". One ask per harness per page is the price of
 * not having that.
 */
export function ensureModels(harness?: string): void {
  untrack(() => {
    if (!hasLiveSession()) {
      return;
    }
    // biome-ignore lint/complexity/noVoid: fire-and-forget by intent — ensureModels itself is synchronous, and the catch below already reports a refusal via store.error
    void ask(harness).catch((error: unknown) => {
      store.error = error instanceof Error ? error.message : String(error);
    });
  });
}

/** Asks again and replaces what was cached — the picker's "Refresh models". */
export async function refreshModels(harness?: string): Promise<void> {
  asked.clear();
  try {
    await ask(harness);
  } catch (error) {
    store.error = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

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
const CONTEXT_SUFFIX = /\[1m\]$/i;

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
 * Which lab makes a model, for the logo in a picker row or a delegate's header.
 * An id may carry a route prefix (`opencode-go/deepseek-v4-pro`), so the part
 * after the last `/` is what matches. Prefix-first and case-insensitive: a
 * single token decides a whole family, and anything else is not our call.
 *
 * Pure string work, so it lives in a plain module.
 */
// biome-ignore lint/performance/noBarrelFile: re-exports the one pure helper so callers import it beside modelLabel, not a module-graph barrel
export { providerOf } from "./provider";

/**
 * Remembers an id the user typed, so the next session can pick it off a list.
 * A typed id is, by definition, one the catalog does not offer — that is the
 * whole reason it was typed — so nothing here checks it against the catalog.
 * `models.recent` hides any that the catalog later comes to cover, and the
 * shortlist is capped, so a typo costs one slot until it scrolls off.
 */
export function rememberModel(model: string): void {
  const id = model.trim();
  if (!id) {
    return;
  }
  store.recent = [id, ...store.recent.filter((seen) => seen !== id)].slice(
    0,
    RECENT_LIMIT
  );
  writeJson(RECENT_KEY, store.recent);
}
