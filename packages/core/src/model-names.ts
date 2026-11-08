/**
 * The one naming of a harness's models, wherever anything names one: the
 * hub's Who decides list (GET /api/decides) and the sentences settling says,
 * the dashboard's spawn picker, model menus and a session's model chip. One
 * name per model, no two alike, each saying what the model runs. Built from
 * what the harness reports (ModelInfo), composed only where its own words
 * fall short, in the words of decidesWords.modelNames:
 *
 * - Claude Code names a row by its alias ("Fable", "Haiku") and puts the
 *   model it runs first in its description ("Fable 5.1 · Most capable for …";
 *   its `haiku` row: "Sonnet 5 · Fastest for quick answers", resolvedModel
 *   `claude-sonnet-5`). That lead is the name when it spells the row's
 *   resolvedModel. A lead that does not ("Newer version available · select
 *   …", "Use the default model (currently Opus 5.5) · …") leaves the display
 *   name.
 * - Claude Code marks the 1M-context variant only by its id's suffix
 *   (`claude-fable-5-1[1m]`; its own errors say "sonnet[1m] for a 1M context
 *   window"), and gives it the plain model's display name, so it is said.
 * - The `default` row (every harness lists one: Claude Code's displayName
 *   "Default (recommended)", OpenCode's and pi's the model's own) is named
 *   by the model it runs (its resolvedModel's row), said as the default.
 * - Two rows still alike (OpenCode and pi list one model from several
 *   providers) are told apart by provider, else by id.
 */

import type { HarnessReport } from "./harness";
import {
  type HarnessKind,
  harnessNamed,
  type ModelInfo,
} from "./harness/kinds";
import { traitsOf } from "./harness/traits";
import { unhandled } from "./unhandled";
import { accountsWords } from "./words/accounts";
import { decidesWords } from "./words/decides";
import { spawnWords } from "./words/spawn";

export interface NamedModel {
  name: string;
  row: ModelInfo;
}

const words = decidesWords.modelNames;

/** Claude Code's mark on a 1M-context variant's id: `claude-opus-5-5[1m]`. */
export const LONG_CONTEXT = /\[1m\]$/iu;

/** The separator Claude Code's descriptions put between their parts. */
const PARTS = " · ";

/** The parts a name or an id is spelled in: `Fable 5.1` and `claude-fable-5-1` both give fable, 5, 1. */
const SPELLING = /[\s.\-/]+/u;

const spelled = (text: string): string[] =>
  text.toLowerCase().split(SPELLING).filter(Boolean);

/**
 * What the row's harness calls the model it runs: its description's lead
 * when that spells its resolvedModel (or, with none, extends its display
 * name), else its display name.
 */
const ownName = (row: ModelInfo): string => {
  const lead = row.description?.split(PARTS)[0]?.trim();
  if (!lead) {
    return row.displayName;
  }
  if (row.resolvedModel === undefined) {
    return lead.startsWith(`${row.displayName} `) ? lead : row.displayName;
  }
  const id = new Set(spelled(row.resolvedModel));
  return spelled(lead).every((part) => id.has(part)) ? lead : row.displayName;
};

/** The provider an `provider/model` id names, else none. */
export const providerOf = (value: string): string | undefined => {
  const slash = value.indexOf("/");
  return slash > 0 ? value.slice(0, slash) : undefined;
};

/**
 * The model a row runs, as an id: its resolvedModel (Claude Code's aliases
 * and every harness's `default` name the id they run there), with the
 * 1M-context mark its own id carries, which resolvedModel drops.
 */
export const modelRun = (row: ModelInfo): string =>
  row.resolvedModel === undefined
    ? row.value
    : `${row.resolvedModel}${row.value.match(LONG_CONTEXT)?.[0] ?? ""}`;

interface Draft {
  /** What the row's harness calls the model it runs. */
  model: string;
  /** What tells it from another row of that model ("1M context", "default"). */
  qualifiers: string[];
  row: ModelInfo;
}

const nameOf = ({ model, qualifiers }: Draft): string =>
  qualifiers.length === 0 ? model : words.qualified(model, qualifiers);

/** `row`'s model and its 1M-context mark, before any default or twin is said. */
const plain = (row: ModelInfo): Draft => ({
  row,
  model: ownName(row),
  qualifiers: LONG_CONTEXT.test(row.value) ? [words.longContext] : [],
});

/**
 * `rows` (one harness's list, possibly several machines' or accounts' copies)
 * once per id, in the order first listed, each with its name.
 */
export const namedModels = (rows: readonly ModelInfo[]): NamedModel[] => {
  const byValue = new Map<string, ModelInfo>();
  for (const row of rows) {
    if (!byValue.has(row.value)) {
      byValue.set(row.value, row);
    }
  }
  const listed = [...byValue.values()];
  const drafts = listed.map((row): Draft => {
    if (row.value !== "default") {
      return plain(row);
    }
    const runs = row.resolvedModel;
    const ran =
      runs === undefined
        ? undefined
        : listed.find(
            (other) =>
              other.value !== "default" &&
              (other.value === runs || other.resolvedModel === runs)
          );
    const model = ran
      ? plain(ran)
      : { row, model: runs ?? row.displayName, qualifiers: [] };
    return {
      row,
      model: model.model,
      qualifiers: [...model.qualifiers, words.harnessDefault],
    };
  });
  return drafts.map((draft) => {
    const twins = drafts.filter((other) => nameOf(other) === nameOf(draft));
    if (twins.length === 1) {
      return { row: draft.row, name: nameOf(draft) };
    }
    const provider = providerOf(draft.row.value);
    const apart =
      provider !== undefined &&
      twins.filter((twin) => providerOf(twin.row.value) === provider).length ===
        1;
    return {
      row: draft.row,
      name: nameOf({
        ...draft,
        qualifiers: [
          ...draft.qualifiers,
          apart ? words.fromProvider(provider) : draft.row.value,
        ],
      }),
    };
  });
};

/**
 * The name of model `id` in `rows`: the row listed under it, else the model
 * a row runs when `id` is what it resolves to (a session reports the wire id,
 * `claude-opus-5-5`, that its `opus` row runs; the 1M variant's id,
 * `claude-opus-5-5[1m]`, when only the plain model is listed). Null when no
 * row lists or runs it.
 */
export const modelNameIn = (
  rows: readonly ModelInfo[],
  id: string
): string | null => {
  const named = namedModels(rows);
  const listed = named.find((one) => one.row.value === id);
  if (listed) {
    return listed.name;
  }
  const base = id.replace(LONG_CONTEXT, "");
  const runs = named.filter((one) => one.row.value !== "default");
  const row = (
    runs.find((one) => one.row.value === base) ??
    runs.find((one) => one.row.resolvedModel === base) ??
    named.find((one) => one.row.resolvedModel === base)
  )?.row;
  return row
    ? nameOf({
        row,
        model: ownName(row),
        qualifiers: LONG_CONTEXT.test(id) ? [words.longContext] : [],
      })
    : null;
};

/**
 * The model aliases Claude Code takes for its `model` setting, as its model
 * configuration names them (https://code.claude.com/docs/en/model-config,
 * "Model aliases": `default`, `best`, `fable`, `sonnet`, `opus`, `haiku`,
 * `sonnet[1m]`, `opus[1m]`, `opusplan`; "the `fable` or `fable[1m]` alias").
 * Its picker lists only some of them (`opusplan` and `best` never), so they
 * are taken by name, not by its rows.
 */
const CLAUDE_ALIASES = new Set([
  "default",
  "best",
  "fable",
  "sonnet",
  "opus",
  "haiku",
  "opusplan",
  "fable[1m]",
  "sonnet[1m]",
  "opus[1m]",
]);

/**
 * A full Anthropic API model name, which Claude Code's `model` setting takes
 * beside its aliases ("Anthropic API: a full model name", model-config), in
 * the shape Claude Code itself admits an `availableModels` id to its picker
 * by (`/^claude-[a-z0-9-]+$/`, its 2.1.311 bundle), with the `[1m]` mark it
 * takes on any of them. Whether the account may run one is not readable: the
 * Agent SDK lists only the picker's rows (`supportedModels()`), and Claude
 * Code reads `/v1/models` only from a gateway.
 */
const CLAUDE_MODEL_ID = /^claude-[a-z0-9-]+$/u;

/** What each harness takes that no row lists; see {@link modelListed}. */
const UNLISTED_TAKEN: Record<
  HarnessKind,
  (id: string, rows: readonly ModelInfo[]) => boolean
> = {
  claude: (id) =>
    CLAUDE_ALIASES.has(id) ||
    CLAUDE_MODEL_ID.test(id.replace(LONG_CONTEXT, "")),
  opencode: () => false,
  pi: (id, rows) =>
    providerOf(id) === undefined &&
    rows.filter((row) => row.value.endsWith(`/${id}`)).length === 1,
};

/**
 * Whether a `harness` session may start on `id`, by what the harness takes:
 * the harness's default; a row listed under it or one that runs it
 * ({@link modelNameIn}: the wire ids Claude Code's rows run, the `[1m]`
 * variant of a listed model); on Claude Code its aliases
 * ({@link CLAUDE_ALIASES}) and any full model name ({@link CLAUDE_MODEL_ID});
 * and on pi a bare id unique among its providers' rows, which pi's own
 * resolver takes (agent pi-services.ts `resolvePiModel`). OpenCode drops a
 * bare id's model (agent opencode.ts `splitModel`), so it is listed only
 * with its provider.
 */
const modelListed = (
  harness: HarnessKind,
  rows: readonly ModelInfo[],
  id: string
): boolean => {
  if (id === "default" || modelNameIn(rows, id) !== null) {
    return true;
  }
  const takes = UNLISTED_TAKEN[harness];
  return takes ? takes(id, rows) : unhandled("harness", harness as never);
};

/** What splits a model id into words (`deepseek-v4.1-flash`: `deepseek`, …). */
const MODEL_ID_WORD = /[-.]/u;

/** How many listed models a refused model's refusal names. Ours: enough to choose from, short enough to read. */
const MODELS_NAMED = 12;

/**
 * What a harness lists on a machine: its rows once it has read them (none
 * when it read and lists none), or unread, with the machine's words on why
 * when it said them (`HarnessReport.modelsUnread`). A machine whose list is
 * unread (OpenCode just installed, its read failed) is not one that lists
 * nothing: neither admits a model it cannot judge.
 */
export type ModelListing =
  | { readonly read: true; readonly rows: readonly ModelInfo[] }
  | { readonly read: false; readonly why?: string };

/**
 * What `harness` lists on one machine, from what the hub and the dashboard
 * both hold of it: Claude Code's rows read once an account signed in there
 * has its catalog read (`catalogs`, the hub's account catalogs of those
 * accounts), else unread with the hub's fault reading one (`faults`);
 * OpenCode's and pi's read once the machine's `report` carries its `models`
 * (empty when it read none), else unread with its `modelsUnread`. Unread is
 * what a machine that just installed the harness, or whose read failed,
 * reports: never taken as a list to admit any model by.
 */
export const modelListingOn = (
  harness: HarnessKind,
  there: {
    readonly report?: Pick<HarnessReport, "models" | "modelsUnread">;
    readonly catalogs?: readonly (readonly ModelInfo[])[];
    readonly faults?: readonly string[];
  }
): ModelListing => {
  if (traitsOf(harness).modelCatalog === "account") {
    const read = there.catalogs ?? [];
    if (read.length > 0) {
      return { read: true, rows: read.flat() };
    }
    const why = there.faults?.[0];
    return { read: false, ...(why ? { why } : {}) };
  }
  if (there.report?.models) {
    return { read: true, rows: there.report.models };
  }
  const why = there.report?.modelsUnread;
  return { read: false, ...(why ? { why } : {}) };
};

/**
 * Whether a `harness` session may start on `model` where the harness lists
 * `listing`: the one test {@link unlistedModelRefusal} refuses by, for a
 * picker that offers only what a start there is admitted on.
 */
export const modelAdmitted = (
  harness: HarnessKind,
  model: string,
  listing: ModelListing
): boolean => modelListed(harness, listing.read ? listing.rows : [], model);

/**
 * Why a `harness` session on `machine` cannot run `model`, judged against
 * `listing`, the models the harness lists there ({@link modelListed}):
 * undefined when it lists it, and for what the harness takes with no list
 * (its default, Claude Code's aliases and full model names). Any other
 * model on a list not read yet is refused as unread, and one read empty
 * as listing none: a model no list admits never starts to fail at its
 * first send (niftybot.art's fresh OpenCode, `opencode/deepseek-v4.1-flash`,
 * 2026-11-06). A model from a provider it lists nothing from says that
 * provider has no sign-in or key there; any other names what it does list,
 * those from the asked id's provider and sharing its first word first. The
 * hub's refusal of a start (server.ts `modelRefusal`) and OpenCode's of a
 * send (agent opencode-session.ts, `provider.no-route`) say it in these
 * words.
 */
export const unlistedModelRefusal = (
  harness: HarnessKind,
  machine: string,
  model: string,
  listing: ModelListing
): string | undefined => {
  if (modelAdmitted(harness, model, listing)) {
    return;
  }
  const rows = listing.read ? listing.rows : [];
  const name = accountsWords.harnesses[harness];
  if (!listing.read) {
    return spawnWords.unlistedModel.unread(name, machine, model, listing.why);
  }
  const offered = [
    ...new Set(
      rows.map((one) => one.value).filter((value) => value !== "default")
    ),
  ];
  if (offered.length === 0) {
    return spawnWords.unlistedModel.noneListed(name, machine, model);
  }
  const provider = providerOf(model);
  if (
    provider !== undefined &&
    !offered.some((value) => providerOf(value) === provider)
  ) {
    return spawnWords.unlistedModel.noProvider(name, machine, model, provider);
  }
  const bare = provider ? model.slice(provider.length + 1) : model;
  const word = bare.split(MODEL_ID_WORD)[0] ?? "";
  const rank = (value: string): number =>
    (providerOf(value) === provider ? 0 : 2) +
    ((providerOf(value) ? value.slice(value.indexOf("/") + 1) : value)
      .toLowerCase()
      .startsWith(word.toLowerCase())
      ? 0
      : 1);
  const listed = offered
    .map((value, order) => ({ value, order }))
    .sort((a, b) => rank(a.value) - rank(b.value) || a.order - b.order)
    .map((one) => one.value);
  const shown = listed.slice(0, MODELS_NAMED);
  const refusal = spawnWords.unlistedModel.words(
    name,
    machine,
    model,
    shown,
    listed.length - shown.length
  );
  return harnessNamed(model)
    ? `${refusal} ${spawnWords.unlistedModel.harnessNamed(model)}`
    : refusal;
};
