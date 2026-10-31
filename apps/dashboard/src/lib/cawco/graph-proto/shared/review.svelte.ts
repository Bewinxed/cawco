/**
 * The component under review, as every structure prototype reads it: the
 * task column's own states file (`TaskColumn.stories.ts`, its 60 tasks the
 * project's own through records_fixture), its stories in file order with
 * their doc comments as each state's account, the flow its `from`s declare,
 * and the agent's sequence, groups and links as an `artifact_create` would
 * carry them. Nothing is declared twice: names, accounts and moves come from
 * the file; only the agent's part (steps, group, edges) is written here.
 *
 * One `Review` is one visit: the kept state, the one previewed over it, the
 * view settings, the record count and the remarks, as the kept place would
 * hold them.
 */
import { humanize } from "@cawco/core/tool-presentation";
import type { ComponentProps } from "svelte";
import type { TaskSummary } from "#lib/cawco/project-tasks.js";
import type TaskColumn from "#lib/cawco/tasks/TaskColumn.svelte";
import source from "../../tasks/TaskColumn.stories.ts?raw";

export type ColumnArgs = ComponentProps<typeof TaskColumn>;

interface StoryExport {
  args?: Partial<ColumnArgs>;
  from?: string;
}

/** One state of the component under review. */
export interface ProtoState {
  args: ColumnArgs;
  /** The story its move starts from, where it declares one. */
  from: string | null;
  /** The agent's group it stands in. */
  group: string;
  /** Its name in words, as the product says it. */
  name: string;
  /** Its doc comment: the one-line account of what the state is. */
  note: string;
  story: string;
}

/** An arrow between two states: a move the file declares, or a link the agent drew. */
export interface ProtoLink {
  from: string;
  kind: "move" | "link";
  label: string | null;
  to: string;
}

/** The states file's own exports: its meta and its stories. */
const stories = Object.values(
  import.meta.glob<Record<string, StoryExport>>(
    "../../tasks/TaskColumn.stories.ts",
    { eager: true }
  )
)[0] as Record<string, StoryExport>;
const meta = stories.default as unknown as {
  args: Partial<ColumnArgs>;
  parameters?: { viewport?: number };
  title: string;
};
const base = meta.args as ColumnArgs;

/** The agent's part, as `artifact_create({ kind: "component", steps, group, edges })` carries it. */
const STEPS = ["Empty", "Arrived", "Several", "Picked", "Moving", "Refused"];
const GROUP: Record<string, string> = {
  Empty: "Filling up",
  Arrived: "Filling up",
  Several: "Filling up",
  Picked: "Moving a task",
  Moving: "Moving a task",
  Refused: "Moving a task",
  Over: "Taking a drop",
  Closed: "Taking a drop",
  Many: "Every task",
};
const EDGES: ProtoLink[] = [
  { from: "Refused", to: "Picked", kind: "link", label: "Try again" },
  { from: "Several", to: "Over", kind: "link", label: "A card dragged over" },
];
/** The agent's ask: the head's one line. */
export const ASK =
  "Judge the six steps of a task column filling and a move being refused; pin anything that reads wrong.";
/** The component's production width: its states file's `parameters.viewport`. */
export const PRODUCTION_WIDTH = meta.parameters?.viewport ?? 320;
export const COMPONENT_NAME = meta.title.split("/").at(-1) ?? "Task column";

/** Each story's doc comment, read off the file in file order. */
function storiesInOrder(): { note: string; story: string }[] {
  const found: { note: string; story: string }[] = [];
  const pattern =
    /\/\*\*\s*((?:(?!\*\/)[\s\S])*?)\s*\*\/\s*export const (\w+)/gu;
  for (const [, comment = "", story = ""] of source.matchAll(pattern)) {
    found.push({
      story,
      note: comment.replace(/\s*\n\s*\*\s?/gu, " ").trim(),
    });
  }
  return found;
}

export const STATES: ProtoState[] = storiesInOrder()
  .filter(({ story }) => story !== "default" && stories[story])
  .map(({ story, note }) => {
    const own = stories[story] as StoryExport;
    return {
      story,
      name: humanize(story),
      note,
      group: GROUP[story] ?? COMPONENT_NAME,
      from: own.from ?? null,
      args: { ...base, ...own.args } as ColumnArgs,
    };
  });

const byStory = new Map(STATES.map((one) => [one.story, one]));
export const stateOf = (story: string): ProtoState =>
  byStory.get(story) ?? (STATES[0] as ProtoState);

/** The moves the file declares, then the agent's links. */
export const LINKS: ProtoLink[] = [
  ...STATES.flatMap((one) =>
    one.from
      ? [{ from: one.from, to: one.story, kind: "move" as const, label: null }]
      : []
  ),
  ...EDGES,
];

export const SEQUENCE: string[] = STEPS.filter((one) => byStory.has(one));

/** The link from one state to the next, if any. */
export const linkBetween = (from: string, to: string): ProtoLink | null =>
  LINKS.find((one) => one.from === from && one.to === to) ?? null;

export const linksFrom = (story: string): ProtoLink[] =>
  LINKS.filter((one) => one.from === story);

/** A state no arrow reaches (the first step excepted), or none leaves (the last step excepted). */
export const noWayIn = (story: string): boolean =>
  story !== SEQUENCE[0] && !LINKS.some((one) => one.to === story);
export const noWayOn = (story: string): boolean =>
  story !== SEQUENCE.at(-1) && !LINKS.some((one) => one.from === story);

/** Every task the fixture holds (the Many story's list): what a count draws from. */
const ALL: TaskSummary[] = stateOf("Many").args.cards;

/** A remark on a state: on an element (its box's fraction) or the state as a whole. */
export interface Remark {
  /** Where on the stage it stands, as fractions of the component's box; null for the whole state. */
  at: { x: number; y: number } | null;
  /** The element's name in words. */
  element: string;
  id: number;
  scheme: "light" | "dark";
  story: string;
  width: number;
  words: string;
}

/** The remarks a visit opens with: the owner's two left on an earlier look. */
const EARLIER: Remark[] = [
  {
    id: 1,
    story: "Refused",
    at: { x: 0.62, y: 0.55 },
    element: "Try again",
    words:
      "The reason wraps under Try again at 320; keep the button on the reason's first line.",
    scheme: "light",
    width: 320,
  },
  {
    id: 2,
    story: "Moving",
    at: { x: 0.3, y: 0.34 },
    element: "Moving…",
    words: "Moving… sits too far under the card; it reads as the next card's.",
    scheme: "light",
    width: 320,
  },
];

export class Review {
  /** The kept state. */
  kept = $state(SEQUENCE[0] ?? "Empty");
  /** The state previewed over the kept one by a resting pointer or a held press. */
  peek = $state<string | null>(null);
  scheme = $state<"light" | "dark">("light");
  width = $state(PRODUCTION_WIDTH);
  reduced = $state(false);
  /** The kept state's record count; null is the state's own. */
  count = $state<number | null>(null);
  longest = $state(false);
  commenting = $state(false);
  remarks = $state<Remark[]>(EARLIER.map((one) => ({ ...one })));
  /** The states the person has stood on. */
  seen = $state<string[]>([]);

  constructor(kept?: string) {
    if (kept) {
      this.kept = kept;
    }
    this.seen = [this.kept];
  }

  keep(story: string): void {
    this.kept = story;
    this.peek = null;
    this.count = null;
    this.longest = false;
    if (!this.seen.includes(story)) {
      this.seen = [...this.seen, story];
    }
  }

  get keptState(): ProtoState {
    return stateOf(this.kept);
  }

  get at(): number {
    return SEQUENCE.indexOf(this.kept);
  }

  /** The kept state's list, where it holds one. */
  get list(): { count: number; of: number } | null {
    const own = this.keptState.args.cards;
    if (own.length === 0) {
      return null;
    }
    return { count: this.count ?? own.length, of: ALL.length };
  }

  /** A state's args as the stage stands them: the kept one at the count and order Adjust set. */
  argsOf(story: string): ColumnArgs {
    const state = stateOf(story);
    if (story !== this.kept || (this.count === null && !this.longest)) {
      return state.args;
    }
    const own = state.args.cards;
    const ids = new Set(own.map((one) => one.id));
    let cards = [...own, ...ALL.filter((one) => !ids.has(one.id))];
    if (this.longest) {
      cards = cards.toSorted((a, b) => b.title.length - a.title.length);
    }
    return { ...state.args, cards: cards.slice(0, this.count ?? own.length) };
  }

  remarksOn(story: string): Remark[] {
    return this.remarks.filter((one) => one.story === story);
  }

  remark(
    story: string,
    at: Remark["at"],
    element: string,
    words: string
  ): void {
    const id = Math.max(0, ...this.remarks.map((one) => one.id)) + 1;
    this.remarks = [
      ...this.remarks,
      {
        id,
        story,
        at,
        element,
        words,
        scheme: this.scheme,
        width: this.width,
      },
    ];
  }

  /** A state's path in words, under a remark: its group, its name, the scheme and width. */
  pathOf(remark: Remark): string {
    const state = stateOf(remark.story);
    return `${state.group} › ${state.name} · ${remark.scheme === "dark" ? "Dark" : "Light"} · ${remark.width}`;
  }
}
