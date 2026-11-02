/**
 * The names the hub gives a harness's models wherever it names one (Who
 * decides' picker, GET /api/decides, the sentences settling says): one name
 * per model, no two alike, each saying what the model is. They are built from
 * what the harness reports (ModelInfo), composed only where its own words
 * fall short, in the words of decidesWords.modelNames:
 *
 * - Claude Code names a row by its family ("Fable") and puts the version
 *   first in its description ("Fable 5.1 · Most capable for …"); that lead is
 *   the name when it extends the display name. A row the CLI writes for an
 *   older id ("Newer version available · select …") keeps its display name.
 * - Claude Code marks the 1M-context variant only by its id's suffix
 *   (`claude-fable-5-1[1m]`; its own errors say "sonnet[1m] for a 1M context
 *   window"), and gives it the plain model's display name, so it is said.
 * - The `default` row (every harness lists one: Claude Code's displayName
 *   "Default (recommended)", OpenCode's and pi's the model's own) is named
 *   by the model it runs (its resolvedModel's row), said as the default.
 * - Two rows still alike (OpenCode and pi list one model from several
 *   providers) are told apart by provider, else by id.
 */
import type { ModelInfo } from "@cawco/core/harness";
import { decidesWords } from "@cawco/core/words/decides";

export interface NamedModel {
  name: string;
  row: ModelInfo;
}

const words = decidesWords.modelNames;

/** Claude Code's mark on a 1M-context variant's id: `claude-opus-5-5[1m]`. */
const LONG_CONTEXT = /\[1m\]$/iu;

/** The separator Claude Code's descriptions put between their parts. */
const PARTS = " · ";

/** What the row's harness calls the model: its description's lead when that extends its display name. */
const ownName = (row: ModelInfo): string => {
  const lead = row.description?.split(PARTS)[0]?.trim();
  return lead?.startsWith(`${row.displayName} `) ? lead : row.displayName;
};

/** The provider an `provider/model` id names, else none. */
const providerOf = (value: string): string | undefined => {
  const slash = value.indexOf("/");
  return slash > 0 ? value.slice(0, slash) : undefined;
};

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
