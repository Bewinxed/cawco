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
import type { ModelInfo } from "./harness";
import { decidesWords } from "./words/decides";

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
