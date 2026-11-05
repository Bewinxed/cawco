<script lang="ts">
  /**
   * The design graph whole on the routine form's own states file, for its
   * design run's pages (`/dev/graph-dials`, GraphBench.stories.ts): the
   * real DesignGraph, its sheet read off RoutineForm.stories.ts (every
   * story, its name, its note, its width, its failure tag, the move into
   * Hub didn't answer), and in the stage's frame a stand-in for the stage
   * page: the routine form mounted in this page at the kept story's args
   * and width, answering the graph's reach, laying the drawing out, and
   * setting each dial on it (a `cssVar` on the drawing's root, an `arg`
   * on the form) as the stage page does from `cawco:stage-dials`. Each
   * dial's value as written is read off the drawing, as the page reads it.
   */
  import type { CanvasSpec, SheetOnPage, Story } from "@cawco/core/stage";
  import {
    STAGE_DIALS,
    STAGE_REACH,
    type StageDials,
    type StageReach,
  } from "@cawco/core/stage-graph";
  import { onMount, untrack } from "svelte";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import RoutineForm from "#lib/cawco/routines/RoutineForm.svelte";
  import DesignGraph from "../DesignGraph.svelte";
  import {
    cssValueOf,
    type DialValue,
    type DialValues,
    figureFrom,
    type GraphDial,
  } from "../dials";
  import { StageLink } from "../stage-link.svelte";

  let {
    dials = [],
    turned = {},
    dialsAt = "face",
    numberForm = "pill",
    face,
    also = [],
  }: {
    /** The agent's dials, as its canvas spec writes them. */
    dials?: GraphDial[];
    /** Dials already turned as the page opens, by name. */
    turned?: DialValues;
    dialsAt?: "face" | "glass";
    numberForm?: "pill" | "field" | "slider";
    /** The room's face it opens on. */
    face?: "dials";
    /** More states files under the ask, their sheets on their way: the title is the components' menu. */
    also?: string[];
  } = $props();

  const FILE = "apps/dashboard/src/lib/cawco/routines/RoutineForm.stories.ts";
  /** Each story's doc comment, as the stage reads it off the file. */
  const NOTES: Record<string, string> = {
    JustOpened: "Nothing typed yet. When starts at Every day, 09:00.",
    FilledIn: "Everything filled in, with a long prompt.",
    RunsAnOrchestrator:
      "Each run starts an orchestrator instead of a delegate.",
    EveryWeek: "Every week, on Mondays at 07:30.",
    EveryHour: "Every hour, so no day or time to choose.",
    CustomSchedule:
      "A custom schedule the hub could read: twice a day on weekdays.",
    InvalidSchedule:
      "A schedule written in words, “every weekday at 9”, which can't be read.",
    Creating: "Create routine pressed; the hub is still making it.",
    FailedSave: "Create routine pressed, and the hub didn't answer (502).",
    DelegateTypeRefused: "The hub knows no delegate type “research”.",
    TypesUnread:
      "The project's delegate types couldn't be read (502), so each run takes the hub's pick.",
    TypesReadAgain:
      "The hub answering again: Retry under the types it couldn't read reads them, and medium's line comes back.",
    LongestName:
      "The longest name the hub takes (48 characters), with the long prompt.",
    ShortestText:
      "The shortest a routine is written: a word for its name, a sentence for what it does.",
  };
  interface Written {
    args?: Record<string, unknown>;
    from?: string;
    name?: string;
    parameters?: { viewport?: number };
    play?: unknown;
    tags?: string[];
  }
  /** The routine form's states file, every export of it, as the stage loads it. */
  const [written] = Object.values(
    import.meta.glob("../../routines/RoutineForm.stories.ts", { eager: true })
  );
  const { default: meta, ...exports } = written as {
    default: { args: Record<string, unknown>; title: string };
  } & Record<string, Written>;
  /** The file's own text: its exports in its order (a module's exports come back sorted by name). */
  const [source = ""] = Object.values(
    import.meta.glob<string>("../../routines/RoutineForm.stories.ts", {
      eager: true,
      import: "default",
      query: "?raw",
    })
  );
  const lineOf = (name: string) =>
    source.slice(0, source.indexOf(`export const ${name} `)).split("\n").length;
  const stories: Story[] = Object.entries(exports)
    .sort(([a], [b]) => lineOf(a) - lineOf(b))
    .map(([name, one]) => ({
      name,
      display: one.name ?? null,
      label: NOTES[name] ?? null,
      line: lineOf(name),
      column: 0,
      args: one.args ?? {},
      code: {},
      component: null,
      form:
        one.parameters?.viewport === undefined
          ? null
          : { name: "custom", width: one.parameters.viewport },
      formUnread: null,
      from: one.from ?? null,
      play: !!one.play,
      readOnly: null,
      records: null,
      tags: one.tags ?? [],
    }));
  const sheet: SheetOnPage = {
    file: FILE,
    components: [],
    meta: { args: meta.args, code: {}, component: null, title: meta.title },
    stories,
  };
  const spec = $derived<CanvasSpec>({
    dials: dials as CanvasSpec["dials"],
  });

  /** The story the stand-in stage stands at, and the width the view picked. */
  let standing = $state("JustOpened");
  let picked = $state<number | null>(null);
  /** The dials as the graph last set them on the drawing. */
  let set = $state<DialValues>({});
  const link = new StageLink((message: object) => {
    const said = message as { type: string };
    if (said.type === STAGE_REACH) {
      const reach = message as StageReach & { type: string };
      standing = reach.to.story;
      requestAnimationFrame(() => {
        link.reached = { ask: reach.ask, move: null, on: reach.to };
      });
    } else if (said.type === "cawco:canvas-view") {
      const { view } = message as { view: { widths: number[] | null } };
      picked = view.widths?.[0] ?? null;
    } else if (said.type === STAGE_DIALS) {
      set = (message as StageDials).values;
    }
  });

  const story = $derived(stories.find((one) => one.name === standing));
  /** The story's own width, its viewport; the desk's when it names none. */
  const own = $derived(story?.form?.width ?? 1440);
  /** The arg dials as set: the form's props over its story's. */
  const argsSet = $derived(
    Object.fromEntries(
      dials.flatMap((dial) =>
        "arg" in dial.target && dial.name in set
          ? [[dial.target.arg, set[dial.name]]]
          : []
      )
    )
  );
  /** The variable dials as set, on the drawing's root. */
  const varsSet = $derived(
    dials
      .flatMap((dial) =>
        "cssVar" in dial.target && dial.name in set
          ? [`${dial.target.cssVar}: ${cssValueOf(dial, set[dial.name] ?? "")}`]
          : []
      )
      .join("; ")
  );

  let drawing = $state<HTMLElement | null>(null);
  /** The stand-in page's width, px, and its gutter. */
  let room = $state(0);
  let gutter = $state(0);
  /** The component's own measure: a component held to a measure (the form's `max-w-c-measure`) is that wide, else its story's width. */
  let held = $state<number | null>(null);
  const measure = $derived(Math.min(own, held ?? own));
  /** The width the page has for the drawing. */
  const space = $derived(room > 0 ? room - gutter : measure);
  /**
   * The width the drawing is laid out at: one he picked in the view card;
   * else its own measure, or the widest width that fits the page where the
   * measure doesn't (a fluid component lays itself out to it, at 1:1).
   */
  const width = $derived(picked ?? Math.min(measure, space));
  /** A width he picked wider than the page, scaled to fit it; 1:1 otherwise. */
  const fit = $derived(picked === null ? 1 : Math.min(1, space / picked));
  /** The drawing's height as laid out, px, for the box its scale stands in. */
  let tall = $state(0);
  // The drawing laid out: its measure the stage's split gives it, as the page says it.
  $effect(() => {
    const at = picked ?? measure;
    const scale = fit;
    const height = tall;
    untrack(() => {
      link.laid = { fit: null, need: at + gutter, scale, tall: height };
    });
  });

  /** A colour as the drawing resolves it (a token's light-dark() to the scheme's own), read off a probe on it. */
  const colourOn = (root: HTMLElement, raw: string): string => {
    const probe = document.createElement("span");
    probe.style.color = raw;
    root.append(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return resolved;
  };

  /** A dial's value as written, read off the drawing (a variable) or its story (an arg). */
  const writtenOn = (root: HTMLElement, dial: GraphDial): DialValue => {
    if ("arg" in dial.target) {
      const arg =
        story?.args[dial.target.arg] ?? sheet.meta.args[dial.target.arg];
      if (dial.kind === "toggle") {
        return arg === true;
      }
      return typeof arg === "number" ? arg : String(arg ?? "");
    }
    const raw = getComputedStyle(root)
      .getPropertyValue(dial.target.cssVar)
      .trim();
    if (dial.kind === "number") {
      return figureFrom(raw, dial.unit) ?? 0;
    }
    return dial.kind === "color" ? colourOn(root, raw) : raw;
  };

  onMount(() => {
    link.heardSheet(sheet);
    link.loaded();
    // Each dial's value as written, read off the drawing as the page reads it.
    requestAnimationFrame(() => {
      const root = drawing;
      if (root) {
        link.dialsWritten = Object.fromEntries(
          dials.map((dial) => [dial.name, writtenOn(root, dial)])
        );
      }
    });
  });
</script>

{#snippet frame()}
  <!-- The stand-in stage page: its gutter, the drawing at its width. -->
  <div
    class="h-full min-h-0 overflow-auto bg-surface-page p-space-5"
    {@attach frameSize((node: HTMLElement) => {
      room = node.clientWidth;
      gutter = 2 * Number.parseFloat(getComputedStyle(node).paddingInlineStart);
    })}
  >
    <!-- The box the drawing stands in is its size after its scale, so a
         scaled drawing leaves no 1:1 box behind to scroll across. -->
    <div
      class="w-(--box-w) h-(--box-h) overflow-clip"
      style="--box-w: {width * fit}px; --box-h: {tall * fit}px"
    >
      <div
        bind:this={drawing}
        class="w-(--drawing) max-w-none origin-top-left scale-(--fit)"
        data-cawco-story={standing}
        style="--drawing: {width}px; --fit: {fit}; {varsSet}"
        {@attach frameSize((node: HTMLElement) => {
          tall = node.offsetHeight;
          const form = node.firstElementChild;
          const most = form
            ? Number.parseFloat(getComputedStyle(form).maxWidth)
            : Number.NaN;
          held = Number.isFinite(most) ? most : null;
        })}
      >
        {#key standing}
          <RoutineForm
            {...meta.args}
            {...story?.args}
            {...argsSet}
            projectId="northwind"
            oncreated={() => undefined}
            oncancel={() => undefined}
          />
        {/key}
      </div>
    </div>
  </div>
{/snippet}

<div class="h-dvh min-h-0 bg-surface-page">
  <DesignGraph
    ask="Judge the routine form's dials"
    {dialsAt}
    files={[FILE, ...also]}
    {frame}
    {link}
    {numberForm}
    keptDials={turned}
    {spec}
    startFace={face}
  />
</div>
