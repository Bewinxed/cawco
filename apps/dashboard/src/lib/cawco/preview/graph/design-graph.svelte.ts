/**
 * A component canvas's design graph (Projects spec §5.10, "The design
 * graph"): what its page holds (`cawco:graph`, core design-graph.ts
 * `GraphModel`), the tab shown, the state kept in each states file and the
 * one a hover previews; each change asks the page what to stand on its
 * stage (`cawco:stage`). The kept states are kept per session, as the
 * canvas's view is, so the graph opens on the state kept last.
 */
import {
  type GraphModel,
  type GraphSection,
  graphOf,
  type SectionGraph,
  type StagePoint,
  samePoint,
} from "@cawco/core/design-graph";
import type { Interaction } from "@cawco/core/stage";
import { store, stored } from "../../storage";

const INTERACTIONS = new Set<Interaction>(["rest", "hover", "focus", "pressed"]);

/** What a session keeps of its graph: the tab and each file's kept state. */
interface Kept {
  file: string | null;
  kept: Record<string, StagePoint>;
}

function keptOf(key: string): Kept {
  try {
    const raw = JSON.parse(stored("local", key) ?? "null") as Kept | null;
    const kept = Object.fromEntries(
      Object.entries(raw?.kept ?? {}).filter(
        ([, point]) =>
          typeof point?.file === "string" &&
          typeof point.story === "string" &&
          INTERACTIONS.has(point.interaction)
      )
    );
    return { file: typeof raw?.file === "string" ? raw.file : null, kept };
  } catch {
    return { file: null, kept: {} };
  }
}

/** A section's first state, at rest: where its graph opens before anything was kept. */
const firstOf = (section: GraphSection, graph: SectionGraph): StagePoint => ({
  file: section.file,
  story:
    graph.machines[0]?.states[0]?.story ?? section.stories[0]?.name ?? "",
  interaction: "rest",
});

/** Whether a point names a story its section holds, at an interaction that story reaches. */
const holds = (section: GraphSection, point: StagePoint): boolean => {
  const story = section.stories.find((one) => one.name === point.story);
  return (
    !!story &&
    (point.interaction === "rest" ||
      story.interactions.includes(point.interaction))
  );
};

export class DesignGraph {
  model = $state.raw<GraphModel | null>(null);
  /** The tab: the states file whose graph and kept state stand. */
  file = $state<string | null>(null);
  kept = $state<Record<string, StagePoint>>({});
  /** What a hover or a held press previews on the page, over the kept state. */
  peek = $state.raw<StagePoint | null>(null);
  /** The panel shown, or folded into its Show pill. */
  open = $state(true);

  /** The section of the tab shown. */
  section = $derived(
    this.model?.sections.find((one) => one.file === this.file) ?? null
  );
  /** Its graph: machines, states, variations and links. */
  graph = $derived(
    this.section && this.model
      ? graphOf(this.section, this.model.group, this.model.edges)
      : null
  );
  /** The state kept in the tab shown. */
  keptHere = $derived(this.file ? (this.kept[this.file] ?? null) : null);

  readonly #key: string;
  readonly #post: (message: object) => void;
  #room = { end: 0, bottom: 0 };
  #said = "";

  /** `post`: to the page, on its own origin (the pane's). */
  constructor(instanceId: string, post: (message: object) => void) {
    this.#key = `cawco-design-graph:${instanceId}`;
    this.#post = post;
    const kept = keptOf(this.#key);
    this.file = kept.file;
    this.kept = kept.kept;
  }

  /** The page said what it holds: the tab and every file's kept state stand where they still can. */
  heard(model: GraphModel): void {
    this.model = model;
    if (!model.sections.some((one) => one.file === this.file)) {
      this.file = model.sections[0]?.file ?? null;
    }
    const kept = { ...this.kept };
    for (const section of model.sections) {
      const had = kept[section.file];
      // A section still on its way keeps what was kept: its stories aren't all known yet.
      if (section.state === "drawn" && had && !holds(section, had)) {
        delete kept[section.file];
      }
      if (!kept[section.file]) {
        kept[section.file] = firstOf(
          section,
          graphOf(section, model.group, model.edges)
        );
      }
    }
    this.kept = kept;
    if (this.peek && !this.section?.stories.some((one) => one.name === this.peek?.story)) {
      this.peek = null;
    }
    this.#keep();
    // Said on each word from the page: a page loaded anew has to be told again.
    this.again();
  }

  /** A press on a state or a chip: it is kept, its tab shown. */
  keepAt(point: StagePoint): void {
    this.kept = { ...this.kept, [point.file]: point };
    this.file = point.file;
    this.peek = null;
    this.#keep();
    this.ask();
  }

  /** A hover or a held press previews a state over the kept one; null lets it go. */
  preview(point: StagePoint | null): void {
    const next = point && !samePoint(point, this.keptHere) ? point : null;
    if (samePoint(next, this.peek) || (next === null && this.peek === null)) {
      return;
    }
    this.peek = next;
    this.ask();
  }

  /** Another tab: its kept state stands. */
  show(file: string): void {
    if (file === this.file) {
      return;
    }
    this.file = file;
    this.peek = null;
    this.#keep();
    this.ask();
  }

  /** The room the panel and dock take from the page, in CSS px: its inline end and its foot. */
  room(end: number, bottom: number): void {
    const next = { end: Math.round(end), bottom: Math.round(bottom) };
    if (next.end === this.#room.end && next.bottom === this.#room.bottom) {
      return;
    }
    this.#room = next;
    this.ask();
  }

  /** The page asked again (a new load said hello): it stands what stands now. */
  again(): void {
    this.#said = "";
    this.ask();
  }

  /** Asks the page to stand the state kept, or the one previewed, in the room left. */
  ask(): void {
    const kept = this.keptHere;
    if (!kept) {
      return;
    }
    const message = {
      type: "cawco:stage",
      kept,
      peek: this.peek,
      room: this.#room,
    };
    const said = JSON.stringify(message);
    if (said === this.#said) {
      return;
    }
    this.#said = said;
    this.#post(message);
  }

  #keep(): void {
    store(
      "local",
      this.#key,
      JSON.stringify({ file: this.file, kept: this.kept })
    );
  }
}
