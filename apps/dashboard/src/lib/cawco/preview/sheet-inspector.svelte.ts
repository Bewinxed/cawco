/**
 * A sheet's inspector (live components spec §5): the person shapes a
 * component from its sheet without writing code. Its controls are the
 * chosen story's props, read by the stage's docgen and said by the sheet's
 * page (`cawco:sheet`); a change mounts the story again at once with the
 * new args (`cawco:story-args`, no write), and Save writes them into the
 * story's `args` in its file, through the hub to the stage (the same write
 * as the session's `artifact_update`, which the session is told of). The
 * story buttons add one from the current controls, duplicate, remove and
 * move one. Everything inside a component stays a pin.
 */
import type {
  ComponentDoc,
  PropMeta,
  SheetOnPage,
  Story,
  StoryOp,
} from "@cawco/core/stage";
import { failureWords } from "#lib/cawco/hub-read.js";
import type { SheetChange } from "../artifact-api";

/** What the inspector says to the sheet's page. */
type ToPage =
  | {
      args: Record<string, unknown> | null;
      story: string;
      type: "cawco:story-args";
    }
  | { story: string | null; type: "cawco:story-select" };

/** A story's name the file can take: an identifier starting with a capital (story-file.ts `STORY_NAME`). */
export const STORY_NAME = /^[A-Z][A-Za-z0-9_]{0,99}$/;

export class SheetInspector {
  /** The sheet as its page last said it; null until it has. */
  sheet = $state.raw<SheetOnPage | null>(null);
  /** The story the controls are for. */
  chosen = $state<string | null>(null);
  /** The person's values, by story, not saved yet. */
  edits = $state<Record<string, Record<string, unknown>>>({});
  /** The story's own args the person dropped back to the meta's or the default, by story. */
  drops = $state<Record<string, string[]>>({});
  /** A write under way: Save, or a story button's. */
  writing = $state<"save" | "op" | null>(null);
  /** Why the last write was refused, in the refuser's words. */
  problem = $state<string | null>(null);
  readonly #post: (message: ToPage) => void;
  readonly #write: (change: SheetChange) => Promise<unknown>;

  constructor(
    post: (message: ToPage) => void,
    write: (change: SheetChange) => Promise<unknown>
  ) {
    this.#post = post;
    this.#write = write;
  }

  /** The page said its sheet (a run, a props refresh): the choice kept while its story stands, and every unsaved story mounted with its values again. */
  heard(sheet: SheetOnPage): void {
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
      if (this.dirtyOf(name)) {
        this.#live(name);
      }
    }
  }

  choose(name: string): void {
    this.chosen = name;
    this.problem = null;
    this.#post({ type: "cawco:story-select", story: name });
  }

  get story(): Story | null {
    return this.sheet?.stories.find((one) => one.name === this.chosen) ?? null;
  }

  /** The component the chosen story mounts: its own, else the meta's. */
  get component(): ComponentDoc | null {
    const file = this.story?.component ?? this.sheet?.meta.component;
    return this.sheet?.components.find((one) => one.file === file) ?? null;
  }

  /** Whether story `name` holds values or drops not saved. */
  dirtyOf(name: string | null): boolean {
    return (
      !!name &&
      (Object.keys(this.edits[name] ?? {}).length > 0 ||
        (this.drops[name] ?? []).length > 0)
    );
  }

  get dirty(): boolean {
    return this.dirtyOf(this.chosen);
  }

  /** Prop `prop`'s value as the chosen story mounts it now: the person's, the story's, the meta's; undefined for the component's default. */
  value(prop: PropMeta): unknown {
    const { chosen: name, story } = this;
    if (!(name && story)) {
      return;
    }
    const edits = this.edits[name] ?? {};
    if (prop.name in edits) {
      return edits[prop.name];
    }
    if (
      !(this.drops[name] ?? []).includes(prop.name) &&
      prop.name in story.args
    ) {
      return story.args[prop.name];
    }
    return this.sheet?.meta.args[prop.name];
  }

  /** Prop `prop`'s value when it is code in the file (a fixture, a function): read-only here. */
  code(prop: PropMeta): string | null {
    const { story } = this;
    return (
      story?.code[prop.name] ??
      (story && !(prop.name in story.args)
        ? (this.sheet?.meta.code[prop.name] ?? null)
        : null)
    );
  }

  /** Whether the chosen story sets prop `prop` itself, or the person changed it: Reset is offered. */
  own(prop: PropMeta): boolean {
    const name = this.chosen;
    if (!name) {
      return false;
    }
    return (
      prop.name in (this.edits[name] ?? {}) ||
      (!!this.story &&
        prop.name in this.story.args &&
        !(this.drops[name] ?? []).includes(prop.name))
    );
  }

  /** The person set prop `prop` of the chosen story: mounted again at once, saved by Save. */
  set(prop: PropMeta, value: unknown): void {
    const name = this.chosen;
    if (!name) {
      return;
    }
    this.problem = null;
    this.edits = {
      ...this.edits,
      [name]: { ...(this.edits[name] ?? {}), [prop.name]: value },
    };
    this.drops = {
      ...this.drops,
      [name]: (this.drops[name] ?? []).filter((one) => one !== prop.name),
    };
    this.#live(name);
  }

  /** Prop `prop` back to the meta's or the component's default: the story's own arg dropped on Save. */
  reset(prop: PropMeta): void {
    const { chosen: name, story } = this;
    if (!(name && story)) {
      return;
    }
    const { [prop.name]: _gone, ...edits } = this.edits[name] ?? {};
    this.edits = { ...this.edits, [name]: edits };
    if (
      prop.name in story.args &&
      !(this.drops[name] ?? []).includes(prop.name)
    ) {
      this.drops = {
        ...this.drops,
        [name]: [...(this.drops[name] ?? []), prop.name],
      };
    }
    this.#live(name);
  }

  /** The chosen story's changes let go: it mounts from its file again. */
  discard(): void {
    const name = this.chosen;
    if (name) {
      this.#forget(name);
      this.#post({ type: "cawco:story-args", story: name, args: null });
    }
  }

  /** Save: the chosen story's values and drops written into its `args`; the page redraws from the file. */
  async save(): Promise<void> {
    const name = this.chosen;
    if (!(name && this.dirtyOf(name)) || this.writing) {
      return;
    }
    const values = { ...(this.edits[name] ?? {}) };
    const unset = [...(this.drops[name] ?? [])];
    this.writing = "save";
    this.problem = null;
    try {
      await this.#write({
        args: { story: name, values, ...(unset.length > 0 ? { unset } : {}) },
      });
      // The file holds them now; its edit runs the sheet again with no override.
      this.#forget(name);
    } catch (error) {
      this.problem = failureWords(error);
    } finally {
      this.writing = null;
    }
  }

  /**
   * A story button: a story added from the chosen one's current values,
   * duplicated, removed, or moved a place up or down. Answers whether it
   * was written; a refusal stands under the buttons.
   */
  async op(op: StoryOp): Promise<boolean> {
    if (this.writing) {
      return false;
    }
    this.writing = "op";
    this.problem = null;
    try {
      await this.#write({ story: op });
      if ("add" in op) {
        this.chosen = op.add;
      } else if ("duplicate" in op) {
        this.chosen = op.as;
      }
      return true;
    } catch (error) {
      this.problem = failureWords(error);
      return false;
    } finally {
      this.writing = null;
    }
  }

  /** The chosen story's args as they stand on screen, each literal one: what Add story writes. */
  current(): Record<string, unknown> {
    const props = this.component?.props ?? [];
    const out: Record<string, unknown> = {};
    for (const prop of props) {
      const value = this.value(prop);
      if (
        value !== undefined &&
        this.code(prop) === null &&
        prop.type.name !== "slot"
      ) {
        out[prop.name] = value;
      }
    }
    for (const [key, value] of Object.entries(this.sheet?.meta.args ?? {})) {
      if (out[key] === value) {
        delete out[key];
      }
    }
    return out;
  }

  /** A move of the chosen story by one place: up before the one above it, down after the one below it. */
  moveBy(by: -1 | 1): StoryOp | null {
    const names = this.sheet?.stories.map((one) => one.name) ?? [];
    const at = names.indexOf(this.chosen ?? "");
    if (at === -1 || at + by < 0 || at + by >= names.length) {
      return null;
    }
    const name = names[at] as string;
    return by === -1
      ? { move: name, before: names[at - 1] as string }
      : { move: name, before: names[at + 2] ?? null };
  }

  #forget(name: string): void {
    const { [name]: _edits, ...edits } = this.edits;
    const { [name]: _drops, ...drops } = this.drops;
    this.edits = edits;
    this.drops = drops;
  }

  /** Story `name` mounted again with the person's values over its file's args; a drop is the meta's value (or none). */
  #live(name: string): void {
    if (!this.dirtyOf(name)) {
      this.#post({ type: "cawco:story-args", story: name, args: null });
      return;
    }
    const story = this.sheet?.stories.find((one) => one.name === name);
    const args: Record<string, unknown> = { ...(story?.args ?? {}) };
    for (const key of this.drops[name] ?? []) {
      args[key] = this.sheet?.meta.args[key];
    }
    Object.assign(args, this.edits[name] ?? {});
    this.#post({ type: "cawco:story-args", story: name, args });
  }
}

/** A prop's own control: an enum's segments when few and short, else its list; a boolean's switch; a field; or read-only. */
export function controlOf(
  prop: PropMeta
): "segments" | "select" | "switch" | "text" | "number" | "slot" | "code" {
  switch (prop.type.name) {
    case "enum": {
      const options = prop.options ?? [];
      return options.length <= 4 &&
        options.every((one) => String(one).length <= 10)
        ? "segments"
        : "select";
    }
    case "boolean":
      return "switch";
    case "string":
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
