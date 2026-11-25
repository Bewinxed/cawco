<script lang="ts">
  import type { Unplaced } from "@cawco/core/comments/made-view";
  import type { Pin } from "@cawco/core/comments/model";
  import { named } from "@cawco/core/named";
  import type {
    CanvasSpec,
    PropMeta,
    SheetOnPage,
    Story,
  } from "@cawco/core/stage";
  import {
    type DifferenceRead,
    STAGE_COMPARE,
    STAGE_DIALS,
    STAGE_PAUSE,
    STAGE_PLAY,
    STAGE_REACH,
    STAGE_SEEK,
    type StageCompare,
    type StagePlay,
    shownName,
  } from "@cawco/core/stage-graph";
  import { commentWords } from "@cawco/core/words/comments";
  import { graphWords } from "@cawco/core/words/graph";
  import { onMount, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import RoutineForm from "#lib/cawco/routines/RoutineForm.svelte";
  import SideSurface from "#lib/cawco/side/SideSurface.svelte";
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
  import { PHONE_QUERY } from "#lib/hooks/is-mobile.svelte.js";
  import { frameSize } from "#lib/platform/frame-observer.js";
  import type { SheetChange } from "../../artifact-api";
  import PinCard from "../../preview/PinCard.svelte";
  import { showMadeAction } from "../../preview/pane-sheet.svelte";
  import { SheetInspector } from "../../preview/sheet-inspector.svelte";
  import { ComposerDraft } from "../../transcript/composer-draft.svelte";
  import DesignGraph from "../DesignGraph.svelte";
  import {
    cssValueOf,
    type DialValue,
    type DialValues,
    figureFrom,
    type GraphDial,
  } from "../dials";
  import { inspectKept, StageLink } from "../stage-link.svelte";
  import { moveInto } from "./moves";

  let {
    dials = [],
    turned = {},
    face,
    also = [],
    props = false,
    stale = false,
    pins = false,
  }: {
    /** The agent's dials, as its canvas spec writes them. */
    dials?: GraphDial[];
    /** Dials already turned as the page opens, by name. */
    turned?: DialValues;
    /** The room's face it opens on. */
    face?: "dials";
    /** More states files under the ask, their sheets on their way: the title is the components' menu. */
    also?: string[];
    /** The form's props on the Dials card, through the real SheetInspector. */
    props?: boolean;
    /** The hub's link down: the stage holds its last drawing (Not live). */
    stale?: boolean;
    /** Two pins made in views the graph doesn't open on, each in the real PinCard with its Show the pin (pane-sheet `showMadeAction`). */
    pins?: boolean;
  } = $props();

  /** Under 640px the panel is a phone's sheet: Close leads its head. */
  const phone = new MediaQuery(PHONE_QUERY);
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
  /** A states file's exports: its meta, and a story under each other name. */
  type StatesFile = {
    default: { args: Record<string, unknown>; title: string };
  } & Record<string, Written>;
  /** The routine form's states file, every export of it, as the stage loads it. */
  const [written] = Object.values(
    import.meta.glob<StatesFile>("../../routines/RoutineForm.stories.ts", {
      eager: true,
    })
  );
  const { default: meta, ...exports } = written;
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
  const COMPONENT = "apps/dashboard/src/lib/cawco/routines/RoutineForm.svelte";
  const flag = (name: string, description: string): PropMeta => ({
    name,
    type: { name: "boolean", raw: "boolean" },
    required: false,
    defaultValue: "false",
    description,
  });
  /** The form's props as the stage's docgen reads them. */
  const FORM_PROPS: PropMeta[] = [
    {
      name: "projectId",
      type: { name: "string", raw: "string" },
      required: true,
      defaultValue: null,
      description: null,
    },
    {
      name: "draft",
      type: { name: "object", raw: "Partial<RoutineDraft>" },
      required: false,
      defaultValue: "{}",
      description: null,
    },
    flag("saving", "Create was pressed and the hub is making it."),
    {
      name: "failure",
      type: { name: "string", raw: "string | null" },
      required: false,
      defaultValue: "null",
      description: "Why the hub refused the routine.",
    },
    flag(
      "attempted",
      "Create was pressed: every blank field says what it needs."
    ),
    flag("focus", "The name field takes focus as the form opens."),
  ];
  /** Whether the form's props stand on the Dials card: read once, as the bench opens. */
  const withProps = untrack(() => props);
  /** The states file as the bench's copy of it is written: Save and Save as new state rewrite it. */
  let file = $state.raw<SheetOnPage>({
    file: FILE,
    components: withProps
      ? [
          {
            file: COMPONENT,
            name: "RoutineForm",
            props: FORM_PROPS,
            types: "checked",
          },
        ]
      : [],
    meta: {
      args: { ...meta.args, projectId: "northwind" },
      code: { hub: "hub" },
      component: withProps ? COMPONENT : null,
      title: meta.title,
    },
    stories,
  });
  /** The args each story mounts with over its file's, as the inspector posts them (`cawco:story-args`). */
  let over = $state<Record<string, Record<string, unknown>>>({});
  /** A write to the states file, as the stage host makes it: a story's args, or a story added. */
  const writeFile = (change: SheetChange): Promise<unknown> => {
    const now = file;
    let next = now.stories;
    if ("args" in change) {
      const { story: name, values } = change.args;
      next = next.map((one) =>
        one.name === name ? { ...one, args: { ...one.args, ...values } } : one
      );
    } else if ("add" in change.story) {
      const { add, args = {} } = change.story;
      const last = next.at(-1);
      if (last) {
        next = [
          ...next,
          {
            ...last,
            name: add,
            display: null,
            label: null,
            from: null,
            play: false,
            tags: [],
            line: last.line + 8,
            args,
          },
        ];
      }
    }
    file = { ...now, stories: next };
    console.info(`[bench] states file ${JSON.stringify(change)}`);
    // The file's edit runs the sheet again, as the stage host's does.
    setTimeout(() => link.heardSheet(file), 0);
    return Promise.resolve({});
  };
  const inspector = withProps
    ? new SheetInspector(
        (message) => {
          if (message.type === "cawco:story-args") {
            const { [message.story]: _gone, ...rest } = over;
            over = message.args
              ? { ...rest, [message.story]: message.args }
              : rest;
          }
        },
        writeFile,
        (at, added) => link.want(at, added),
        (why) => console.warn(`[bench] refused: ${why}`)
      )
    : null;
  inspectKept(
    () => link,
    () => inspector
  );
  const spec = $derived<CanvasSpec>({
    dials,
  });

  /** The story the stand-in stage stands at, and the width the view picked. */
  let standing = $state("JustOpened");
  let picked = $state<number | null>(null);
  /** The view's Appearance: the stand-in page draws in its scheme, as the stage page does. */
  let dark = $state(false);
  /** The dials as the graph last set them on the drawing. */
  let set = $state<DialValues>({});
  /** Compare as the graph asked it: the state compared with, and which of the two the stage shows. */
  let compared = $state<StageCompare | null>(null);
  /** The move the last reach played, as the page reads it: the Animation face's clips. */
  let move = $state<ReturnType<typeof moveInto>>(null);
  /** The stand-in's clock: where the move stands, and the frame that runs it while it plays. */
  let clock = 0;
  let playing = 0;
  const tell = (t: number, on: boolean) => {
    link.heardTime({
      at: performance.now(),
      length: move?.length ?? 0,
      playing: on,
      t,
    });
  };
  const stop = () => {
    cancelAnimationFrame(playing);
    playing = 0;
  };
  /** The move played from `from` ms to its end, the page its clock, telling the time as it starts and ends. */
  const play = (asked: StagePlay) => {
    stop();
    const length = move?.length ?? 0;
    if (asked.still || length === 0) {
      clock = length;
      tell(clock, false);
      return;
    }
    const began = performance.now() - asked.from;
    tell(asked.from, true);
    const tick = (now: number) => {
      clock = Math.min(length, now - began);
      if (clock >= length) {
        playing = 0;
        tell(length, false);
        return;
      }
      playing = requestAnimationFrame(tick);
    };
    playing = requestAnimationFrame(tick);
  };

  /** What the form calls each of its draft's values, as the page names the part that shows it. */
  const PARTS: Record<string, string> = {
    name: "Field “Name”",
    prompt: "Field “What each run does”",
    cron: "Menu “When”",
    delegateType: "Field “Delegate type”",
    target: "Menu “Each run starts”",
  };
  /** A story's values the form shows, by part: its draft's own, one level down. */
  const valuesOf = (name: string): Map<string, string> => {
    const args = file.stories.find((each) => each.name === name)?.args ?? {};
    const draft = new Map<string, unknown>(
      typeof args.draft === "object" && args.draft !== null
        ? Object.entries(args.draft)
        : []
    );
    return new Map(
      Object.entries(PARTS).map(([key, part]) => {
        const value = draft.get(key);
        const words =
          value === undefined || value === null ? "" : String(value);
        return [part, words.length > 48 ? `${words.slice(0, 47)}…` : words];
      })
    );
  };
  /** The values that differ, as the page names a changed one (core words/graph.ts). */
  const differencesOf = (kept: string, against: string): DifferenceRead[] => {
    const one = valuesOf(kept);
    const two = valuesOf(against);
    return [...one]
      .filter(([part, value]) => value !== two.get(part))
      .map(([part, value]) => ({
        box: { x: 0, y: 0, w: 0, h: 0 },
        kind: "changed" as const,
        line: graphWords.changed(part, value, two.get(part) ?? ""),
        radius: "0px",
      }));
  };

  const link = new StageLink((message) => {
    if (message.type === STAGE_REACH) {
      standing = message.to.story;
      stop();
      move =
        message.play && message.from
          ? moveInto(message.from.story, message.to.story)
          : null;
      requestAnimationFrame(() => {
        link.reached = { ask: message.ask, move, on: message.to };
        if (move) {
          clock = move.length;
          tell(clock, false);
        }
      });
    } else if (message.type === STAGE_COMPARE) {
      compared = message.against ? message : null;
      if (message.against) {
        const found = differencesOf(standing, message.against.story);
        requestAnimationFrame(() => {
          link.heardDifferences({
            ask: message.ask,
            beside: false,
            found,
            same: found.length === 0,
          });
        });
      }
    } else if (message.type === STAGE_PLAY) {
      play(message);
    } else if (message.type === STAGE_PAUSE) {
      stop();
      tell(clock, false);
    } else if (message.type === STAGE_SEEK) {
      stop();
      clock = message.t;
      tell(clock, false);
    } else if (message.type === "cawco:canvas-view") {
      picked = message.view.widths?.[0] ?? null;
      dark = message.view.scheme === "dark";
    } else if (message.type === STAGE_DIALS) {
      set = message.values;
    }
  });

  /** The story drawn: the kept one, or the one compared with while Compare's flip shows it in its place. */
  const story = $derived(
    file.stories.find(
      (one) =>
        one.name ===
        (compared?.show === "compared" && compared.against
          ? compared.against.story
          : standing)
    )
  );
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
  /** The component's own measure: a component held to a measure (the form's `max-w-measure`) is that wide, else its story's width. */
  let held = $state<number | null>(null);
  const measure = $derived(Math.min(own, held ?? own));
  /** A device's width he picked; Adapt (the stage's own width, the page's whole) lays the drawing out to the page, as the stage page does. */
  const fixed = $derived(
    picked !== null && Math.abs(picked - room) > 1 ? picked : null
  );
  /** The width the page has for the drawing. */
  const space = $derived(room > 0 ? room - gutter : measure);
  /**
   * The width the drawing is laid out at: one he picked in the view card;
   * else its own measure, or the widest width that fits the page where the
   * measure doesn't (a fluid component lays itself out to it, at 1:1).
   */
  const width = $derived(fixed ?? Math.min(measure, space));
  /** A width he picked wider than the page, scaled to fit it; 1:1 otherwise. */
  const fit = $derived(fixed === null ? 1 : Math.min(1, space / fixed));
  /** A pin made on this states file at story `story`, `width` and `scheme`, on the form's name field. */
  const madePin = (
    id: string,
    number: number,
    madeOn: string,
    madeWidth: number,
    madeScheme: "light" | "dark"
  ): Pin => ({
    id,
    number,
    at: "2026-11-24T09:00:00.000Z",
    by: "person",
    kind: "comment",
    title: "Field “Name”",
    anchor: {
      selector: "#routine-name",
      source: null,
      text: "",
      sheet: {
        file: FILE,
        story: madeOn,
        state: {
          interaction: "rest",
          scheme: madeScheme,
          width: madeWidth,
        },
      },
    },
    elements: [],
    thread: [
      {
        id: `${id}-1`,
        at: "2026-11-24T09:00:00.000Z",
        by: "person",
        text: "This field should say what the name is for.",
      },
    ],
  });
  /** Pin 1 made on another state at a desk's width in the dark; pin 2 on the state the graph opens on, at a tablet's width in the dark. */
  const madePins: Pin[] = [
    madePin("bench-pin-1", 1, "FailedSave", 1440, "dark"),
    madePin("bench-pin-2", 2, "JustOpened", 768, "dark"),
  ];
  /**
   * Why the stand-in stage doesn't draw pin `pin` (overlay made-view.ts
   * `madeAway`, as this page's stand-in answers it): another story stands,
   * or its story at another width or scheme; none where it stands as made.
   */
  const awayOf = (pin: Pin): Unplaced | undefined => {
    const sheet = "selector" in pin.anchor ? pin.anchor.sheet : undefined;
    const state = sheet?.state;
    if (!(sheet && state)) {
      return;
    }
    if (sheet.story !== standing) {
      const one = file.stories.find((each) => each.name === sheet.story);
      return {
        why: "story",
        file: sheet.file,
        story: sheet.story,
        state: one ? shownName(one, file.stories) : sheet.story,
      };
    }
    if (state.width !== width || state.scheme !== (dark ? "dark" : "light")) {
      return {
        why: "elsewhere",
        made: { scheme: state.scheme, width: state.width },
      };
    }
  };
  const benchDraft = new ComposerDraft();
  /** The drawing's height as laid out, px, for the box its scale stands in. */
  let tall = $state(0);
  // The drawing laid out: its measure the stage's split gives it, as the page says it.
  $effect(() => {
    const at = fixed ?? measure;
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
        story?.args[dial.target.arg] ?? file.meta.args[dial.target.arg];
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
    link.heardSheet(file);
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
  {#if pins}
    <!-- Each pin made here stands on its element: the form's name field, marked as the overlay's pill would mark it. -->
    {#each madePins.filter((one) => !awayOf(one)) as one (one.id)}
      <span
        class="fixed top-space-2 left-space-2 z-10 rounded-full bg-accent px-space-2 text-on-accent type-meta"
        data-bench-pill={one.number}>{one.number}</span
      >
    {/each}
  {/if}
  <!-- The stand-in stage page: its gutter, the drawing at its width, its top
       clearing the stage's floating head (`--stage-room`), as the stage page
       pads its own by the room the graph tells it. -->
  <div
    class={[
      "h-full min-h-0 overflow-auto bg-bg p-space-4 scroll-timeline-transcript-head",
      dark ? "scheme-dark" : "scheme-light",
    ]}
    {@attach frameSize(
      (node: HTMLElement) =>
        [
          node.clientWidth,
          2 * Number.parseFloat(getComputedStyle(node).paddingInlineStart),
        ] as const,
      ([width, inset]) => {
        room = width;
        gutter = inset;
      }
    )}
  >
    <div aria-hidden="true" class="h-(--stage-room,0px)"></div>
    <!-- The box the drawing stands in is its size after its scale, so a
         scaled drawing leaves no 1:1 box behind to scroll across. -->
    <div
      class="h-(--box-h) w-(--box-w) overflow-clip"
      style="--box-w: {width * fit}px; --box-h: {tall * fit}px"
    >
      <div
        bind:this={drawing}
        class="w-(--drawing) max-w-none origin-top-left scale-(--fit)"
        data-cawco-story={standing}
        style="--drawing: {width}px; --fit: {fit}; {varsSet}"
        {@attach frameSize(
          (node: HTMLElement) => {
            const form = node.firstElementChild;
            const most = form
              ? Number.parseFloat(getComputedStyle(form).maxWidth)
              : Number.NaN;
            return {
              tall: node.offsetHeight,
              held: Number.isFinite(most) ? most : null,
            };
          },
          (measured) => {
            ({ tall, held } = measured);
          }
        )}
      >
        <!-- A pick sets the next story's args on the form where it stands,
             as the stage does for a reach within one states file (agent
             stage-host canvas stage.ts `actOn`): the form morphs to it, its
             read-back changing in place, never mounted afresh. -->
        <RoutineForm
          {...meta.args}
          {...story?.args}
          {...story ? over[story.name] : {}}
          {...argsSet}
          projectId="northwind"
          oncreated={() => undefined}
          oncancel={() => undefined}
        />
      </div>
    </div>
  </div>
{/snippet}

<!-- Shown in CawCo's own artifact panel (the overlay's `data-cawco-headed`),
     the card fills the frame edge to edge. -->
<!-- In the artifact panel as a person meets it: the panel's card and its
     floating head (SideSurface), beside the page on a desk and a sheet's
     on a phone, the graph under the head as PreviewPane hosts it. -->
<div
  class="flex h-dvh min-h-0 bg-bg p-space-2 in-data-cawco-headed:p-0 max-phone:p-0 [&>*]:flex-1"
>
  <SideSurface
    label="Preview"
    onclose={() => undefined}
    placement={phone.current ? "sheet" : "beside"}
    title="Routine form, every state"
  >
    {#if pins}
      <!-- The pins' cards, as the pane opens them: the real PinCard, its Show the pin the pane's own action. -->
      <div
        class="absolute right-space-2 bottom-space-2 z-20 flex w-80 flex-col gap-space-2"
        data-slot="bench-pins"
      >
        {#each madePins as one (one.id)}
          {@const away = awayOf(one)}
          <div data-bench-card={one.number}>
            <PinCard
              agentName={named("The session")}
              {away}
              draft={benchDraft}
              link={`#comment-${one.number}`}
              name={away ? commentWords.offPage(away) : (one.title ?? "")}
              onclose={() => undefined}
              ondelete={() => Promise.resolve()}
              onfind={() => undefined}
              onhold={() => undefined}
              onplace={() => undefined}
              onreply={() => undefined}
              onresolve={() => undefined}
              onretry={() => undefined}
              onshowmade={showMadeAction(link, one, away)}
              parent={null}
              pin={away ? { ...one, movedAt: one.at } : one}
              placing={false}
              problem={null}
              whyNotSent={null}
            />
          </div>
        {/each}
      </div>
    {/if}
    <div class="absolute inset-0" data-slot="graph-host">
      <DesignGraph
        ask="Judge the routine form's dials"
        files={[FILE, ...also]}
        {frame}
        {inspector}
        {link}
        keptDials={turned}
        {spec}
        {stale}
        startFace={face}
      />
    </div>
  </SideSurface>
</div>
