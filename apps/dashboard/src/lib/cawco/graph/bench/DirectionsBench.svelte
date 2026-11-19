<script lang="ts">
  /**
   * The design graph with three directions of one design, for its design
   * run's pages (DirectionsBench.stories.ts): the real DesignGraph in the
   * artifact panel's card, its head the panel's own priority rule drawing
   * what the graph hands it (graph-head.ts `directionItems`: the switch in
   * the centre, Pick prominent), and in the stage's frame a stand-in for the
   * stage page that holds the real address trays (design 6ddc57c4), each
   * direction's tray at the kept state, the width and scheme picked, the
   * network dial set. As the stage page does, it loads no direction until
   * the graph asks for it (`cawco:stage-load`, a reach or a Compare naming
   * it), each after a cold load's wait, and says its sheet then; once the
   * first direction stands drawn, it loads the others as the page goes
   * idle, so a flip finds them ready. A flip to another direction
   * cross-fades, as the stage page's does, at once where motion is
   * reduced. Compare
   * mounts the compared tray hidden beside the kept one and reads what
   * differs by the names of their headings and buttons. His pick is kept
   * in this browser, as the artifact's doc keeps it in the panel.
   */
  import type { CanvasSpec } from "@cawco/core/stage";
  import {
    type DifferenceRead,
    STAGE_COMPARE,
    STAGE_DIALS,
    STAGE_LOAD,
    STAGE_REACH,
    type StageCompare,
    type StateRef,
  } from "@cawco/core/stage-graph";
  import { graphWords } from "@cawco/core/words/graph";
  import { flushSync, onMount, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { PHONE_QUERY } from "#lib/hooks/is-mobile.svelte.js";
  import { frameSize } from "#lib/platform/frame-observer.js";
  import { dur, ease, motionOk } from "#lib/platform/motion/curves.svelte.js";
  import { store, stored, unstore } from "#lib/platform/storage.js";
  import TrayView from "../../address/preview/TrayView.svelte";
  import { AddressTray, type Network } from "../../address/tray.svelte";
  import SideSurface from "../../side/SideSurface.svelte";
  import DesignGraph from "../DesignGraph.svelte";
  import type { GraphHead } from "../graph-head";
  import { directionItems } from "../graph-head";
  import { StageLink } from "../stage-link.svelte";
  import {
    TRAY_DIALS,
    TRAY_DIRECTIONS,
    TRAY_STATES,
    traySheet,
  } from "./directions";

  let {
    ask = "Judge the address tray's three directions, from the Family tray, and pick one",
  }: {
    /** The artifact's ask: the direction it names opens in front. */
    ask?: string;
  } = $props();

  /** Under 640px the panel is a phone's sheet: Close leads its head. */
  const phone = new MediaQuery(PHONE_QUERY);
  /** How long a direction takes to load cold, ms: a states file's module graph fetched and its stories read. */
  const COLD_MS = 600;
  /** Where his pick is kept in this browser (the panel keeps it in the artifact's doc). */
  const PICK_KEY = "cawco-bench-directions-picked";

  const spec: CanvasSpec = {
    name: "address-tray",
    dials: TRAY_DIALS,
    directions: TRAY_DIRECTIONS.map(({ file, name, line }) => ({
      file,
      name,
      line,
    })),
  };
  const files = TRAY_DIRECTIONS.map((one) => one.file);

  let head = $state<GraphHead | null>(null);
  let picked = $state<string | null>(stored("local", PICK_KEY));
  const pick = (file: string | null) => {
    picked = file;
    if (file) {
      store("local", PICK_KEY, file);
    } else {
      unstore("local", PICK_KEY);
    }
  };

  /** The directions the stand-in page has loaded, in the order it loaded them: said on the bench's root (`data-loaded`) for its press script. */
  let loaded = $state<string[]>([]);
  /** The state the stand-in stands at, and the one Compare draws hidden beside it. */
  let standing = $state<StateRef | null>(null);
  let compared = $state<StageCompare | null>(null);
  /** The width the view picked (none: the stage's own), its scheme, and the network dial as set. */
  let widthPicked = $state<number | null>(null);
  let dark = $state(false);
  /** The panel's Reduce motion is off. */
  let moving = true;
  let network = $state<Network>("tailscale");

  /**
   * A direction loaded as the stage page loads one: cold the first time
   * (its sheet said once it has), then each `then` run; at once once it
   * has loaded.
   */
  const waiting = new Map<string, (() => void)[]>();
  const load = (file: string, then: () => void = () => undefined) => {
    if (loaded.includes(file)) {
      then();
      return;
    }
    const queued = waiting.get(file);
    if (queued) {
      queued.push(then);
      return;
    }
    waiting.set(file, [then]);
    const direction = TRAY_DIRECTIONS.find((one) => one.file === file);
    setTimeout(() => {
      if (direction) {
        loaded = [...loaded, file];
        link.heardSheet(traySheet(direction));
      }
      for (const one of waiting.get(file) ?? []) {
        one();
      }
      waiting.delete(file);
    }, COLD_MS);
  };
  /**
   * The drawing swapped under a picture of the one it replaces, which
   * fades out over it (one --duration-fade on --ease-crossfade), as the
   * stage page swaps a direction (stage.ts `crossFade`).
   */
  const crossFade = (swap: () => void) => {
    const from = drawing;
    const leaving = from?.cloneNode(true);
    if (!(from?.parentElement && leaving instanceof HTMLElement)) {
      swap();
      return;
    }
    leaving.inert = true;
    leaving.setAttribute("aria-hidden", "true");
    leaving.className =
      "pointer-events-none absolute start-(--leave-x) top-(--leave-y) z-1 w-(--leave-w)";
    leaving.style.setProperty("--leave-x", `${from.offsetLeft}px`);
    leaving.style.setProperty("--leave-y", `${from.offsetTop}px`);
    leaving.style.setProperty("--leave-w", `${from.offsetWidth}px`);
    from.parentElement.append(leaving);
    swap();
    flushSync();
    const fade = leaving.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: dur("--duration-fade"),
      easing: ease("--ease-crossfade"),
      fill: "forwards",
    });
    const gone = () => leaving.remove();
    fade.addEventListener("finish", gone);
    fade.addEventListener("cancel", gone);
  };

  /** The other directions, loaded one at a time as the page goes idle once the first stands drawn, as the stage page does. */
  let restLoaded = false;
  const loadRest = () => {
    if (restLoaded) {
      return;
    }
    restLoaded = true;
    const next = (at: number) => {
      const file = files[at];
      if (file !== undefined) {
        requestIdleCallback(() => load(file, () => next(at + 1)));
      }
    };
    next(0);
  };

  /** The tray a ref draws: its direction and the view its story jumps to. */
  const trayOf = (ref: StateRef | null) => {
    const direction = TRAY_DIRECTIONS.find((one) => one.file === ref?.file);
    const state = TRAY_STATES.find((one) => one.name === ref?.story);
    return direction && state
      ? { direction: direction.tray, view: state.view }
      : null;
  };
  const kept = $derived(trayOf(standing));
  const against = $derived(trayOf(compared?.against ?? null));
  /** A tray held at its view on the network set: made anew as either changes. */
  const trayAt = (view: (typeof TRAY_STATES)[number]["view"], on: Network) => {
    const tray = new AddressTray({ network: on });
    tray.jump(view);
    return tray;
  };
  const keptTray = $derived(kept ? trayAt(kept.view, network) : null);
  const againstTray = $derived(against ? trayAt(against.view, network) : null);
  $effect(() => {
    const tray = keptTray;
    return () => tray?.dispose();
  });
  $effect(() => {
    const tray = againstTray;
    return () => tray?.dispose();
  });

  let drawing = $state<HTMLElement | null>(null);
  let hidden = $state<HTMLElement | null>(null);
  let room = $state(0);
  /** The drawing's width: the one picked, else the page's own. */
  const width = $derived(widthPicked ?? room);
  const form = $derived(width > 0 && width < 640 ? "phone" : "desk");

  /** The names a drawing shows (its headings and buttons, by their words): what Compare reads. */
  const namesIn = (root: HTMLElement | null): Map<string, string> => {
    const names = new Map<string, string>();
    for (const one of root?.querySelectorAll<HTMLElement>(
      "h1, h2, h3, h4, button, [role='status']"
    ) ?? []) {
      const words = (one.getAttribute("aria-label") ?? one.textContent ?? "")
        .replace(/\s+/gu, " ")
        .trim();
      const kind = one.matches("button") ? "Button" : "Heading";
      if (words) {
        names.set(`${kind} “${words.slice(0, 40)}”`, words);
      }
    }
    return names;
  };
  /** What differs between the kept drawing and the compared one, as the page lists it. */
  const differencesOf = (): DifferenceRead[] => {
    const mine = namesIn(drawing);
    const theirs = namesIn(hidden);
    const box = { x: 0, y: 0, w: 0, h: 0 };
    return [
      ...[...mine.keys()]
        .filter((name) => !theirs.has(name))
        .map((name) => ({
          box,
          kind: "came" as const,
          line: graphWords.cameIn(name),
          radius: "0px",
        })),
      ...[...theirs.keys()]
        .filter((name) => !mine.has(name))
        .map((name) => ({
          box,
          kind: "went" as const,
          line: graphWords.went(name),
          radius: "0px",
        })),
    ];
  };
  /** Both drawings laid out (two frames), then what differs told the graph for its Compare. */
  const tellDifferences = (asked: StageCompare) => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (compared?.ask !== asked.ask) {
          return;
        }
        const found = differencesOf();
        link.heardDifferences({
          ask: asked.ask,
          beside: false,
          found,
          same: found.length === 0,
        });
      })
    );
  };

  const link = new StageLink((message) => {
    if (message.type === STAGE_LOAD) {
      load(message.file);
    } else if (message.type === STAGE_REACH) {
      const asked = message;
      // A reach waits on its states file's load alone, as the page's does.
      load(asked.to.file, () => {
        const crossing =
          !!standing &&
          standing.file !== asked.to.file &&
          moving &&
          motionOk.current;
        if (crossing) {
          crossFade(() => {
            standing = asked.to;
          });
        } else {
          standing = asked.to;
        }
        loadRest();
        requestAnimationFrame(() => {
          link.reached = { ask: asked.ask, move: null, on: asked.to };
          if (!link.dialsWritten) {
            link.dialsWritten = { network };
          }
        });
      });
    } else if (message.type === STAGE_COMPARE) {
      compared = message.against ? message : null;
      const asked = message;
      if (asked.against) {
        load(asked.against.file, () => tellDifferences(asked));
      }
    } else if (message.type === "cawco:canvas-view") {
      widthPicked = message.view.widths?.[0] ?? null;
      moving = message.view.motion !== "reduce";
      dark = message.view.scheme === "dark";
    } else if (message.type === STAGE_DIALS) {
      const set = message.values.network;
      network = set === "headscale" || set === "netbird" ? set : "tailscale";
    }
  });
  // The drawing laid out at the width picked, 1:1 within the page.
  $effect(() => {
    const at = width;
    untrack(() => {
      link.laid = { fit: null, need: at, scale: 1, tall: 0 };
    });
  });
  onMount(() => {
    link.loaded();
  });
</script>

{#snippet frame()}
  <!-- The stand-in stage page: the kept tray at its width and scheme, its
       top clearing the stage's floating head; the compared tray drawn
       hidden beside it, as the page draws it, read for what differs. -->
  <div
    class={[
      "relative h-full min-h-0 overflow-auto bg-surface-page p-space-5",
      dark ? "scheme-dark dark" : "scheme-light",
    ]}
    {@attach frameSize(
      (node: HTMLElement) => node.clientWidth,
      (value) => {
        room = value;
      }
    )}
  >
    <div aria-hidden="true" class="h-(--stage-room,0px)"></div>
    {#if kept && keptTray}
      <div
        bind:this={drawing}
        class="mx-auto w-(--drawing) max-w-full"
        data-cawco-story={standing?.story}
        style:--drawing="{Math.min(width, 640)}px"
      >
        {#key `${standing?.file}:${standing?.story}:${network}`}
          <TrayView direction={kept.direction} {form} tray={keptTray} />
        {/key}
      </div>
    {/if}
    {#if against && againstTray}
      <div
        bind:this={hidden}
        aria-hidden="true"
        class="invisible absolute w-(--drawing) overflow-clip"
        inert
        style:--drawing="{Math.min(width, 640)}px"
      >
        {#key `${compared?.against?.file}:${compared?.against?.story}:${network}`}
          <TrayView direction={against.direction} {form} tray={againstTray} />
        {/key}
      </div>
    {/if}
  </div>
{/snippet}

<!-- In the artifact panel as a person meets it: the panel's card and its
     floating head (SideSurface), beside the page on a desk and a sheet's on
     a phone, the graph under the head as PreviewPane hosts it. -->
<div
  data-loaded={loaded.join(" ")}
  data-slot="directions-bench"
  class="flex h-dvh min-h-0 bg-surface-page p-space-2 *:flex-1 max-phone:p-0 in-data-cawco-headed:p-0"
>
  <SideSurface
    items={directionItems(head)}
    label="Preview"
    onclose={() => undefined}
    placement={phone.current ? "sheet" : "beside"}
    title="Address tray"
  >
    <div class="absolute inset-0" data-slot="graph-host">
      <DesignGraph
        bind:head
        {ask}
        {files}
        {frame}
        {link}
        memory="cawco-bench-directions"
        onpick={pick}
        {picked}
        {spec}
      />
    </div>
  </SideSurface>
</div>
