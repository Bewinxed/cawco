<script lang="ts" module>
  import type { Rive } from "@rive-app/canvas";
  import riveWasm from "@rive-app/canvas/rive.wasm?url";

  /** What Caw shows. Each status is its own file, assets/mascot/caw/<status>.riv. */
  export type CawStatus =
    | "ready"
    | "working"
    | "needs-you"
    | "idle"
    | "done"
    | "trying"
    | "loading"
    | "reconnecting"
    | "sleeping"
    | "compacted";

  /**
   * The status files, as the build emits them: URLs only, so a file is
   * fetched the first time its status is shown and never before. The
   * dashboard's own copy of assets/mascot/caw/, written by
   * assets/mascot/scripts/build.mjs, so a new Caw redeploys the dashboard.
   */
  const FILES = import.meta.glob<string>("../../assets/caw/*.riv", {
    query: "?url",
    import: "default",
    eager: true,
  });
  const fileUrl = (status: CawStatus): string =>
    FILES[`../../assets/caw/${status}.riv`];

  /** Each status file's bytes, fetched once and shared by every Caw. */
  const bytes = new Map<CawStatus, Promise<ArrayBuffer>>();
  function fileBytes(status: CawStatus): Promise<ArrayBuffer> {
    const cached = bytes.get(status);
    if (cached) {
      return cached;
    }
    const fetched = fetch(fileUrl(status)).then((response) => {
      if (!response.ok) {
        throw new Error(`${status}.riv: HTTP ${response.status}`);
      }
      return response.arrayBuffer();
    });
    // A failed fetch is not kept: the next appearance asks again.
    fetched.catch(() => bytes.delete(status));
    bytes.set(status, fetched);
    return fetched;
  }

  /**
   * Rive's web runtime, loaded when Caw is warmed or first appears, with its
   * WASM served from this app (the version the package pins) and no CDN: the
   * runtime's default URL and its jsdelivr fallback are both off.
   */
  let runtime: Promise<typeof import("@rive-app/canvas")> | undefined;
  function riveRuntime() {
    runtime ??= import("@rive-app/canvas").then((module) => {
      module.RuntimeLoader.setWasmUrl(riveWasm);
      module.RuntimeLoader.setWasmFallbackUrl(null);
      return module;
    });
    return runtime;
  }

  /**
   * What the page's head prefetches: Rive's WASM and the file of the Caw a
   * wait shows. They are needed only once a wait outlasts its grace, so an
   * idle-priority fetch into the HTTP cache is enough; the URLs are hashed and
   * immutable, and they are the very ones the runtime and fileBytes fetch.
   */
  export const PREFETCHES = [riveWasm, fileUrl("loading")];

  /** The files' 592 px artboard and the 512 px still box in it, at (43, 40). */
  const ARTBOARD = 592;
  const BOX = { x: 43, y: 40, side: 512 };

  /** Where his still's box goes on a canvas, in that canvas's own pixels. */
  export interface CawBox {
    side: number;
    x: number;
    y: number;
  }

  /**
   * Caw on a canvas the caller owns, for a place too small or too many for
   * a Caw of its own (a mark beside a word, on every row of a list): the
   * same runtime, WASM and file bytes as the component, driven through the
   * runtime's low-level API so the caller decides when he moves and when he
   * is drawn. His still's box is put at `box`; the rest of the artboard
   * draws past it as far as the canvas reaches.
   */
  export interface CawStage {
    dispose: () => void;
    /**
     * His coming in, played once on the runtime's frames. `landed` is called
     * in the frame he reaches his still, already drawn. Returns its stop.
     */
    enter: (landed: () => void) => () => void;
    /** His still, drawn once: the scheme's rim settled, nothing left to play. */
    rest: () => void;
  }

  export async function stageCaw(
    status: CawStatus,
    canvas: HTMLCanvasElement,
    box: CawBox,
    dark: boolean
  ): Promise<CawStage> {
    const [module, buffer] = await Promise.all([
      riveRuntime(),
      fileBytes(status),
    ]);
    const rive = await module.RuntimeLoader.awaitInstance();
    const file = await rive.load(new Uint8Array(buffer));
    const artboard = file.artboardByName("Caw");
    const machine = new rive.StateMachineInstance(
      artboard.stateMachineByName("CawStates"),
      artboard
    );
    const caw = file.defaultArtboardViewModel(artboard).defaultInstance();
    machine.bindViewModelInstance(caw);
    caw.boolean("dark").value = dark;
    const entered = caw.trigger("entered");
    const renderer = rive.makeRenderer(canvas);
    // Counted on the page's own timeline: how many are alive is a mark's
    // open count less its gone count.
    performance.mark(`caw stage ${status}`);
    const unit = box.side / BOX.side;
    const frame = {
      minX: box.x - BOX.x * unit,
      minY: box.y - BOX.y * unit,
      maxX: box.x + (ARTBOARD - BOX.x) * unit,
      maxY: box.y + (ARTBOARD - BOX.y) * unit,
    };
    const draw = () => {
      renderer.clear();
      renderer.save();
      renderer.align(
        rive.Fit.contain,
        rive.Alignment.center,
        frame,
        artboard.bounds
      );
      artboard.draw(renderer);
      renderer.restore();
      renderer.flush();
    };
    return {
      rest() {
        // With less motion the file holds his still; a second of its clock
        // lets the scheme's rim, which fades in over 200ms, settle.
        caw.boolean("reducedMotion").value = true;
        caw.enum("from").value = "none";
        for (let step = 0; step < 60; step += 1) {
          machine.advanceAndApply(1 / 60);
        }
        draw();
        rive.resolveAnimationFrame();
      },
      enter(landed) {
        caw.enum("from").value = "none";
        let last: number | undefined;
        let request = rive.requestAnimationFrame(function tick(now) {
          machine.advanceAndApply(last === undefined ? 0 : (now - last) / 1000);
          last = now;
          draw();
          if (entered.hasChanged) {
            landed();
            return;
          }
          request = rive.requestAnimationFrame(tick);
        });
        return () => rive.cancelAnimationFrame(request);
      },
      dispose() {
        performance.mark(`caw stage ${status} gone`);
        renderer.delete();
        machine.delete();
        artboard.delete();
        file.unref();
      },
    };
  }
</script>

<script lang="ts">
  /**
   * Caw, the CawCo crow, at a brand moment: an empty home, a detail area
   * with nothing open yet, a fleet still being read, a hub being reached
   * again. Never in a row, an error or a permission request.
   *
   * Drawn by Rive from his status's file, whose clips and loops play on
   * their own; this only sets the file's `Caw` view model and hears its
   * triggers (assets/mascot/README.md, Contract). He comes in by his enter
   * clip, and `onentered` says when it has ended, so a place can keep him
   * until then. On a status change the shown file is told to `leave`; once
   * it says he is back on his `still`, the new status's file takes over
   * with `from` naming the old one and plays his arrival from that very
   * drawing, so no frame is empty and at most two files are alive. With
   * `present` off he plays his exit and `ongone` says when the page is
   * empty. With less motion there are no clips: he fades (--dur-fade on
   * --ease-out) in, across and out.
   *
   * `size` is the side of his still in px. His acting reaches past it, so
   * the canvases spill over the box unclipped and never take a pointer.
   */
  import { untrack } from "svelte";
  import { dur, ease, motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import { theme } from "#lib/theme.svelte.js";

  let {
    status,
    present = true,
    next = [],
    onentered,
    ongone,
    size = 160,
  }: {
    status: CawStatus;
    /**
     * Off once the place is done with him: he goes back to his still, plays
     * his exit, and `ongone` is called. The place keeps him mounted till then.
     */
    present?: boolean;
    /**
     * Called once his first appearance has played to its end, or once his
     * file has failed to load, so whatever waits on him is never stuck.
     */
    onentered?: () => void;
    /** Called once he has left an empty page behind after `present` went off. */
    ongone?: () => void;
    /**
     * The statuses this place can change to. Their files are fetched once
     * Caw is on screen, so a change never waits on the network.
     */
    next?: CawStatus[];
    /** Side of Caw's still in px; the artboard around it draws past it. */
    size?: number;
  } = $props();

  interface Layer {
    /** When the status was asked for, for the performance marks. */
    asked: number;
    canvas?: HTMLCanvasElement;
    /** Its fade, while one runs (less motion only). */
    fade?: Animation;
    /** `none` on a first appearance, else the status he was showing. */
    from: "none" | CawStatus;
    id: number;
    rive?: Rive;
    shown: boolean;
    status: CawStatus;
    /** Told to leave and back on his still: the next file may take over. */
    still: boolean;
  }
  /** Bottom to top: the Caw on screen, and during a change the one taking over. */
  let layers = $state<Layer[]>([]);
  let nextId = 0;
  /** His first appearance has been reported. */
  let entered = false;

  const dark = $derived(theme.resolved === "dark");
  const reducedMotion = $derived(!motionOk.current);

  $effect(() => {
    const asked = status;
    const here = present;
    untrack(() => (here ? ask(asked) : leave()));
  });

  // Every live Caw follows the scheme and the motion setting; their state machines do the rest.
  $effect(() => {
    const values = { dark, reducedMotion };
    for (const layer of layers) {
      if (layer.rive) {
        write(layer.rive, values);
      }
    }
  });

  function layerFor(incoming: CawStatus, from: Layer["from"]): Layer {
    nextId += 1;
    return {
      id: nextId,
      status: incoming,
      from,
      asked: performance.now(),
      shown: false,
      still: false,
    };
  }

  const flag = (layer: Layer, name: "leave" | "exit", value: boolean) => {
    const property = layer.rive?.viewModelInstance?.boolean(name);
    if (property) {
      property.value = value;
    }
  };

  /**
   * Brings `incoming` on. The first Caw, or one whose file is still on its
   * way, is simply the file for it. A Caw on screen is told to leave and the
   * new file takes over from his still (`settle`); with less motion the new
   * one fades in over him.
   */
  function ask(incoming: CawStatus) {
    const [current] = layers;
    if (!current?.shown) {
      if (current?.status !== incoming) {
        layers = [layerFor(incoming, "none")];
      }
      return;
    }
    if (reducedMotion) {
      const top = layers.at(-1) as Layer;
      top.fade?.finish();
      layers =
        top.status === incoming ? [top] : [top, layerFor(incoming, top.status)];
      return;
    }
    settle();
  }

  /** Moves the Caw on screen towards the status asked for, one step at a time. */
  function settle() {
    const [current] = layers;
    if (!(current?.shown && present)) {
      return;
    }
    flag(current, "exit", false);
    if (current.status === status) {
      // Asked back before the change happened: he carries on.
      current.still = false;
      flag(current, "leave", false);
      layers = [current];
      return;
    }
    if (!current.still) {
      flag(current, "leave", true);
      return;
    }
    if (layers[1]?.status !== status) {
      layers = [current, layerFor(status, current.status)];
    }
  }

  /** `present` went off: his exit, then `ongone`. Unloaded or with less motion, at once or a fade. */
  function leave() {
    const [current] = layers;
    if (!current?.shown) {
      layers = [];
      ongone?.();
      return;
    }
    layers = [current];
    if (reducedMotion) {
      current.fade = current.canvas?.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: dur("--dur-fade"),
        easing: ease("--ease-out"),
        fill: "forwards",
      });
      (current.fade?.finished ?? Promise.resolve())
        .then(() => ongone?.())
        .catch(() => {
          // Cancelled: the canvas left the page before its fade ended.
        });
      return;
    }
    flag(current, "leave", true);
    flag(current, "exit", true);
  }

  function write(
    rive: Rive,
    values: { dark: boolean; reducedMotion: boolean }
  ) {
    const caw = rive.viewModelInstance;
    if (!caw) {
      return;
    }
    const darkProperty = caw.boolean("dark");
    const motionProperty = caw.boolean("reducedMotion");
    if (darkProperty) {
      darkProperty.value = values.dark;
    }
    if (motionProperty) {
      motionProperty.value = values.reducedMotion;
    }
  }

  function reportEntered(layer: Layer) {
    if (entered) {
      return;
    }
    entered = true;
    performance.measure(`caw ${layer.status} entered`, { start: layer.asked });
    onentered?.();
  }

  /** Hears the file's triggers: the end of his coming in, his still while leaving, his exit's end. */
  function listen(layer: Layer, rive: Rive) {
    const caw = rive.viewModelInstance;
    caw?.trigger("entered")?.on(() => reportEntered(layer));
    caw?.trigger("still")?.on(() => {
      layer.still = true;
      settle();
    });
    caw?.trigger("gone")?.on(() => {
      if (present) {
        // Asked back mid-exit: he comes in afresh.
        layers = [layerFor(status, "none")];
      } else {
        layers = [];
        ongone?.();
      }
    });
  }

  /** Draws `layer`'s Caw into its canvas once its file is in, then starts him. */
  function mount(layer: Layer) {
    return (canvas: HTMLCanvasElement) => {
      let gone = false;
      let rive: Rive | undefined;
      const failed = (error?: unknown) => {
        console.error(`Caw ${layer.status} did not load`, error ?? "");
        if (!layers.some((l) => l.shown)) {
          reportEntered(layer);
        }
      };
      Promise.all([riveRuntime(), fileBytes(layer.status)])
        .then(([{ Rive, Layout, Fit, Alignment }, buffer]) => {
          if (gone) {
            return;
          }
          rive = new Rive({
            canvas,
            buffer,
            stateMachine: "CawStates",
            autoBind: true,
            autoplay: true,
            layout: new Layout({
              fit: Fit.Contain,
              alignment: Alignment.Center,
            }),
            onLoadError: () => failed(),
            onLoad: () => {
              if (gone || !rive) {
                return;
              }
              rive.resizeDrawingSurfaceToCanvas();
              write(rive, { dark, reducedMotion });
              listen(layer, rive);
              layer.rive = rive;
              show(layer, canvas);
            },
          });
        })
        .catch(failed);
      return () => {
        gone = true;
        rive?.cleanup();
      };
    };
  }

  /**
   * Starts `layer`: `from` picks his enter or his arrival, which begins on
   * the drawing the Caw below holds, so that one goes once this one is drawn.
   * With less motion the file holds his still and the canvas fades in.
   */
  function show(layer: Layer, canvas: HTMLCanvasElement) {
    const first = !layers.some((l) => l.shown);
    const from = layer.rive?.viewModelInstance?.enum("from");
    if (from) {
      from.value = layer.from;
    }
    layer.canvas = canvas;
    layer.shown = true;
    if (first) {
      for (const upcoming of next) {
        fileBytes(upcoming).catch(() => {
          // Fetched again when that status is asked for.
        });
      }
    }
    if (reducedMotion) {
      layer.fade = canvas.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: dur("--dur-fade"),
        easing: ease("--ease-out"),
      });
      layer.fade.finished
        .then(() => {
          layer.fade = undefined;
          layers = layers.filter((l) => l.id >= layer.id);
          reportEntered(layer);
        })
        .catch(() => {
          // Cancelled: the canvas left the page before its fade ended.
        });
      return;
    }
    // Rive's render loop draws him in the next frame; the Caw below goes in the one after.
    requestAnimationFrame(() => {
      performance.measure(`caw ${layer.status} first drawn`, {
        start: layer.asked,
      });
      requestAnimationFrame(() => {
        layers = layers.filter((l) => l.id >= layer.id);
        // The status may have moved on while this file was loading.
        untrack(settle);
      });
    });
  }
</script>

<div
  aria-hidden="true"
  class="caw"
  style:--artboard="{(size * ARTBOARD) / BOX.side}px"
  style:--left="{(-size * BOX.x) / BOX.side}px"
  style:--side="{size}px"
  style:--top="{(-size * BOX.y) / BOX.side}px"
>
  {#each layers as layer (layer.id)}
    <canvas class:shown={layer.shown} {@attach mount(layer)}></canvas>
  {/each}
</div>

<style>
  .caw {
    position: relative;
    width: var(--side);
    height: var(--side);
    pointer-events: none;
    user-select: none;
  }
  canvas {
    position: absolute;
    left: var(--left);
    top: var(--top);
    width: var(--artboard);
    height: var(--artboard);
    opacity: 0;
  }
  canvas.shown {
    opacity: 1;
  }
</style>
