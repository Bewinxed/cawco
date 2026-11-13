/**
 * The props of the state on a component canvas's stage, as the person tunes
 * them on the Dials card (live components spec §5; the owner's pick,
 * 2026-11-10: the artifact panel's Inspect folds into Dials). Its props are
 * the state's story's, read by the stage's docgen and said by the sheet's
 * page (`cawco:sheet`); a change mounts the story again at once with the
 * new args (`cawco:story-args`, no write), and Save writes them into the
 * story's `args` in its file, through the hub to the stage (the same write
 * as the session's `artifact_update`, which the session is told of). Save
 * as new state adds a story from them. Everything inside a component stays
 * a pin.
 */
import type { FrameSays } from "@cawco/core/page-wire";
import {
  type ComponentDoc,
  fileSets,
  inspectedProps,
  type PropMeta,
  type SheetOnPage,
  type Story,
  type StoryOp,
} from "@cawco/core/stage";
import { failureWords } from "#lib/platform/hub-read.js";
import type { SheetChange } from "../artifact-api";

/** What the inspector says to the sheet's page. */
type ToPage = Extract<
  FrameSays,
  { type: "cawco:story-args" | "cawco:story-select" }
>;

/** A story's name the file can take: an identifier starting with a capital (story-file.ts `STORY_NAME`). */
const STORY_NAME = /^[A-Z][A-Za-z0-9_]{0,99}$/u;
/** A name's figures at its end: a new state's name counts on from them. */
const TRAILING_FIGURES = /\d+$/u;

export class SheetInspector {
  /** The sheet as its page last said it; null until it has. */
  sheet = $state.raw<SheetOnPage | null>(null);
  /** The story the props are for: the state on the stage. */
  chosen = $state<string | null>(null);
  /** The person's values, by story, not saved yet. */
  edits = $state<Record<string, Record<string, unknown>>>({});
  /** A write under way: Save, or Save as new state. */
  writing = $state<"save" | "new" | null>(null);
  readonly #post: (message: ToPage) => void;
  readonly #write: (change: SheetChange) => Promise<unknown>;
  readonly #chose: (file: string, story: string) => void;
  readonly #refused: (why: string) => void;

  /**
   * `chose`: a story was added here: the design graph keeps its state, so
   * the stage stands at the story the props edit. `refused`: a write was
   * refused, in the refuser's words.
   */
  constructor(
    post: (message: ToPage) => void,
    write: (change: SheetChange) => Promise<unknown>,
    chose: (file: string, story: string) => void,
    refused: (why: string) => void
  ) {
    this.#post = post;
    this.#write = write;
    this.#chose = chose;
    this.#refused = refused;
  }

  /**
   * The design graph keeps a state: the props follow the story the stage
   * stands at, in its states file's sheet, so an edit lands on the drawing
   * the person sees.
   */
  follow(sheet: SheetOnPage, name: string): void {
    if (sheet !== this.sheet) {
      this.#heard(sheet);
    }
    if (this.chosen !== name) {
      this.#show(name);
    }
  }

  get story(): Story | null {
    return this.sheet?.stories.find((one) => one.name === this.chosen) ?? null;
  }

  /** Why the chosen story's args are read-only (story-file.ts `storyRead`); null when its props write them. */
  get readOnly(): Story["readOnly"] {
    return this.story?.readOnly ?? null;
  }

  /** The component the chosen story mounts: its own, else the meta's; none when the reader couldn't follow the story, whose component the file builds in code. */
  get component(): ComponentDoc | null {
    if (this.readOnly && !this.readOnly.read) {
      return null;
    }
    const file = this.story?.component ?? this.sheet?.meta.component;
    return this.sheet?.components.find((one) => one.file === file) ?? null;
  }

  /**
   * The component's props the person tunes for the chosen story: each whose
   * value the file writes as a literal or not at all (one it sets as code, a
   * fixture or a function, stays a pin), a pass-through one (`class`,
   * `style`; core `PASS_THROUGH_PROPS`) only where its file sets it or the
   * person changed it, so a story that draws with one shows why.
   */
  get props(): PropMeta[] {
    const { chosen: name, story, sheet } = this;
    if (!(name && story && sheet)) {
      return [];
    }
    const edited = this.edits[name] ?? {};
    return inspectedProps(
      this.component?.props ?? [],
      (prop) => fileSets(prop, story, sheet.meta) || prop in edited
    ).filter(
      (prop) =>
        !(prop.name in story.code) &&
        (prop.name in story.args || !(prop.name in sheet.meta.code))
    );
  }

  /** The chosen story's args as its file writes them: its own over the meta's. */
  get saved(): Record<string, unknown> {
    return { ...this.sheet?.meta.args, ...this.story?.args };
  }

  /** The person's values for the chosen story, not saved yet. */
  get edited(): Record<string, unknown> {
    return this.edits[this.chosen ?? ""] ?? {};
  }

  /** The person set `values` and took `back` to as saved, on the chosen story: mounted again at once, saved by Save. */
  change(values: Record<string, unknown>, back: readonly string[] = []): void {
    const name = this.chosen;
    if (!name || this.readOnly) {
      return;
    }
    const kept = Object.entries(this.edits[name] ?? {}).filter(
      ([prop]) => !back.includes(prop)
    );
    this.edits = {
      ...this.edits,
      [name]: { ...Object.fromEntries(kept), ...values },
    };
    this.#live(name);
  }

  /** Save: the chosen story's values written into its `args`; the page redraws from the file. */
  async save(): Promise<void> {
    const name = this.chosen;
    if (!(name && this.#dirty(name)) || this.writing) {
      return;
    }
    const values = { ...this.edits[name] };
    this.writing = "save";
    try {
      await this.#write({ args: { story: name, values } });
      // The file holds them now; its edit runs the sheet again with no override.
      this.#forget(name);
    } catch (error) {
      this.#refused(failureWords(error));
    } finally {
      this.writing = null;
    }
  }

  /**
   * Save as new state: a story added after the file's others from the
   * chosen one's values as they stand, under its name counted on (`Waiting`
   * `Waiting2`); the stage goes to it, and the chosen story mounts from its
   * file again.
   */
  async saveNew(): Promise<void> {
    const { chosen: from, sheet } = this;
    if (!(from && sheet && this.#dirty(from)) || this.writing) {
      return;
    }
    const add = newName(
      from,
      sheet.stories.map((one) => one.name)
    );
    const op: StoryOp = { add, args: this.#current() };
    this.writing = "new";
    try {
      await this.#write({ story: op });
      this.#forget(from);
      this.#post({ type: "cawco:story-args", story: from, args: null });
      this.#show(add);
      this.#chose(sheet.file, add);
    } catch (error) {
      this.#refused(failureWords(error));
    } finally {
      this.writing = null;
    }
  }

  /** The page said its sheet (a run, a props refresh): the choice kept while its story stands, and every unsaved story mounted with its values again. */
  #heard(sheet: SheetOnPage): void {
    this.sheet = sheet;
    const names = sheet.stories.map((one) => one.name);
    if (!(this.chosen && names.includes(this.chosen))) {
      this.chosen = names[0] ?? null;
    }
    for (const name of Object.keys(this.edits)) {
      if (!names.includes(name)) {
        this.#forget(name);
      }
    }
    this.#post({ type: "cawco:story-select", story: this.chosen });
    for (const name of names) {
      if (this.#dirty(name)) {
        this.#live(name);
      }
    }
  }

  #show(name: string): void {
    this.chosen = name;
    this.#post({ type: "cawco:story-select", story: name });
  }

  #dirty(name: string): boolean {
    return Object.keys(this.edits[name] ?? {}).length > 0;
  }

  /** The chosen story's args as they stand on screen, each literal one the meta doesn't already set: what Save as new state writes. */
  #current(): Record<string, unknown> {
    const { saved, edited } = this;
    const meta = this.sheet?.meta.args ?? {};
    const out: Record<string, unknown> = {};
    for (const prop of this.props) {
      const value = prop.name in edited ? edited[prop.name] : saved[prop.name];
      if (
        value !== undefined &&
        prop.type.name !== "slot" &&
        meta[prop.name] !== value
      ) {
        out[prop.name] = value;
      }
    }
    return out;
  }

  #forget(name: string): void {
    const { [name]: _edits, ...edits } = this.edits;
    this.edits = edits;
  }

  /** Story `name` mounted again with the person's values over its file's args. */
  #live(name: string): void {
    if (!this.#dirty(name)) {
      this.#post({ type: "cawco:story-args", story: name, args: null });
      return;
    }
    const story = this.sheet?.stories.find((one) => one.name === name);
    const args = { ...story?.args, ...this.edits[name] };
    this.#post({ type: "cawco:story-args", story: name, args });
  }
}

/** A new story's name from `from`'s, counted on past every name in `taken`, kept to what the file takes (`STORY_NAME`). */
function newName(from: string, taken: readonly string[]): string {
  const base = STORY_NAME.test(from)
    ? from.replace(TRAILING_FIGURES, "") || "State"
    : "State";
  for (let count = 2; ; count += 1) {
    const figures = String(count);
    const name = `${base.slice(0, 100 - figures.length)}${figures}`;
    if (!taken.includes(name)) {
      return name;
    }
  }
}

/** A prop's own control: an enum's choice; a boolean's switch; a field (a token-typed one offering the system's names); or none (a slot, code). */
export function controlOf(
  prop: PropMeta
): "choice" | "switch" | "text" | "number" | "slot" | "code" {
  switch (prop.type.name) {
    case "enum":
      return "choice";
    case "boolean":
      return "switch";
    case "string":
    case "token-color":
    case "token-size":
    case "token-font":
      return "text";
    case "number":
      return "number";
    case "slot":
      return "slot";
    case "array":
    case "function":
    case "object":
    case "other":
      break;
  }
  return "code";
}
