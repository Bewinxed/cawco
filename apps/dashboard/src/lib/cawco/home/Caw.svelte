<script lang="ts" module>
  import type { Rive } from "@rive-app/canvas";
  import riveWasm from "@rive-app/canvas/rive.wasm?url";
  import rests from "../../../../../../assets/mascot/loops/rests.json";

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
   * Every file Caw is drawn from: a status's, or `peek`, his ledge peek,
   * which is not a status (assets/mascot/README.md, Contract).
   */
  export type CawFile = CawStatus | "peek";

  /**
   * Where the ledge runs across peek.riv's 512 still box, as a share of its
   * height from the top: above it all of him that shows, below it only the
   * wing tips that hang in front of the ledge.
   */
  const LEDGE_LINE = rests.peek.ledgeLine;

  /**
   * The files, as the build emits them: URLs only, so a file is fetched the
   * first time it is shown and never before. The dashboard's own copy of
   * assets/mascot/caw/, written by assets/mascot/scripts/build.mjs, so a new
   * Caw redeploys the dashboard.
   */
  const FILES = import.meta.glob<string>("../../assets/caw/*.riv", {
    query: "?url",
    import: "default",
    eager: true,
  });
  const fileUrl = (status: CawFile): string =>
    FILES[`../../assets/caw/${status}.riv`];

  /** Each file's bytes, fetched once and shared by every Caw. */
  const bytes = new Map<CawFile, Promise<ArrayBuffer>>();
  function fileBytes(status: CawFile): Promise<ArrayBuffer> {
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
    status: CawFile,
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
        for (let step = 0; step < 60; step += 1) {
          machine.advanceAndApply(1 / 60);
        }
        draw();
        rive.resolveAnimationFrame();
      },
      enter(landed) {
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
   * Drawn by Rive from his status's file, whose enter and loops play on
   * their own; this only sets the file's `Caw` view model and hears its
   * `entered` (assets/mascot/README.md, Contract). He comes in by his
   * status's drawn enter, or where it has none by a fade up from
   * --leave-scale over --dur-pop, and `onentered` says when that has ended,
   * so a place can keep him until then. He goes the same way from any
   * drawing: he holds the one he is on and fades out to --leave-scale over
   * --dur-fade, so what he stood in for is never under a looping Caw. With
   * `present` off `ongone` says when he has gone; on a status change the
   * new status's file comes in once the old one has, so one file is alive
   * at a time. With less motion there is no enter and no scale: he fades
   * (--dur-fade on --ease-out) in, across and out.
   *
   * `size` is the side of his still in px. His acting reaches past it, so
   * the canvases spill over the box unclipped and never take a pointer.
   *
   * With `ledge` he stands behind an edge: the slot is the part of his box
   * above peek.riv's ledge line, so the line sits on the slot's bottom edge,
   * and nothing of him draws below it. He comes in by peek.riv's own enter
   * whatever the status, and holds its rest. Each change of `status` after
   * that brings that status's file in the same box behind the same edge, by
   * the same leave and enter as anywhere else.
   *
   * With `still` each file holds his still once it has entered: the file's
   * `reducedMotion` is written for that Caw alone, as `stageCaw`'s rest does.
   */
  import { untrack } from "svelte";
  import {
    dur,
    ease,
    motionOk,
    numberOf,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { theme } from "#lib/theme.svelte.js";

  let {
    status,
    present = true,
    next = [],
    onentered,
    ongone,
    size = 160,
    ledge = false,
    still = false,
  }: {
    status: CawStatus;
    /** He peeks over an edge at the slot's bottom, clipped below it. */
    ledge?: boolean;
    /** Each file holds his still once it has entered. */
    still?: boolean;
    /**
     * Off once the place is done with him: he fades out at once and
     * `ongone` is called. The place keeps him mounted till then.
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
    /** Its fade, while one runs: in with no drawn enter or with less motion, or out. */
    fade?: Animation;
    id: number;
    /** His enter has ended (at once in a file with none): `still` may hold him. */
    landed: boolean;
    /** Fading out: whatever is asked for next comes in once he has gone. */
    leaving: boolean;
    rive?: Rive;
    shown: boolean;
    status: CawFile;
  }
  /** The Caw on screen and, while less motion fades one status across another, the one over him. */
  let layers = $state<Layer[]>([]);
  let nextId = 0;
  /** His first appearance has been reported. */
  let entered = false;

  const dark = $derived(theme.resolved === "dark");
  const reducedMotion = $derived(!motionOk.current);

  /**
   * The status his peek stands for: the one he was mounted with, behind a
   * ledge, until another is asked for.
   */
  let peekFor = untrack(() => (ledge ? status : undefined));
  function fileFor(asked: CawStatus): CawFile {
    if (asked !== peekFor) {
      peekFor = undefined;
    }
    return peekFor === undefined ? asked : "peek";
  }

  $effect(() => {
    const asked = status;
    const here = present;
    untrack(() => (here ? ask(fileFor(asked)) : leave()));
  });

  // Every live Caw follows the scheme and the motion setting, and `still`
  // once he has landed; their state machines do the rest.
  $effect(() => {
    for (const layer of layers) {
      if (layer.rive) {
        write(layer.rive, valuesFor(layer));
      }
    }
  });

  function valuesFor(layer: Layer) {
    return {
      dark,
      reducedMotion: reducedMotion || (still && layer.landed),
    };
  }

  function layerFor(incoming: CawFile): Layer {
    nextId += 1;
    return {
      id: nextId,
      status: incoming,
      asked: performance.now(),
      landed: false,
      leaving: false,
      shown: false,
    };
  }

  /**
   * Brings `incoming` on. The first Caw, or one whose file is still on its
   * way, is simply the file for it. A Caw on screen showing another status
   * fades out, and the new status's file comes in once he has gone; with
   * less motion the new one fades in over him.
   */
  function ask(incoming: CawFile) {
    const [current] = layers;
    if (!current?.shown) {
      if (current?.status !== incoming) {
        layers = [layerFor(incoming)];
      }
      return;
    }
    if (current.leaving && !reducedMotion) {
      // Asked for while he fades out: the status comes in once the fade ends.
      return;
    }
    if (reducedMotion) {
      // The Caw on top of those on screen stays under the new one; a file still loading goes.
      const top = layers.findLast((l) => l.shown) as Layer;
      top.fade?.finish();
      layers = top.status === incoming ? [top] : [top, layerFor(incoming)];
      return;
    }
    if (current.status !== incoming) {
      fadeOut(current);
    }
  }

  /** `present` went off: he fades out from the drawing he is on. */
  function leave() {
    const [current] = layers;
    if (!current?.shown) {
      layers = [];
      ongone?.();
      return;
    }
    layers = [current];
    if (!current.leaving) {
      fadeOut(current);
    }
  }

  /**
   * `layer`'s Caw goes: he holds the drawing he is on and fades out over
   * --dur-fade, shrinking to --leave-scale, from wherever a fade in had
   * brought him; with less motion the fade alone. Then the status asked
   * for comes in afresh, or with `present` off the page is left empty.
   */
  function fadeOut(layer: Layer) {
    layer.leaving = true;
    layer.rive?.pause();
    layer.fade?.commitStyles();
    layer.fade?.cancel();
    const end = reducedMotion
      ? { opacity: 0 }
      : { opacity: 0, transform: `scale(${numberOf("--leave-scale")})` };
    layer.fade = layer.canvas?.animate([end], {
      duration: dur("--dur-fade"),
      easing: ease("--ease-out"),
      fill: "forwards",
    });
    (layer.fade?.finished ?? Promise.resolve())
      .then(() => {
        performance.measure(`caw ${layer.status} gone`);
        layers = present ? [layerFor(fileFor(status))] : [];
        if (!present) {
          ongone?.();
        }
      })
      .catch(() => {
        // Cancelled: the canvas left the page before its fade ended.
      });
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
              const caw = rive.viewModelInstance;
              layer.landed = !(caw?.boolean("enters")?.value ?? false);
              write(rive, valuesFor(layer));
              caw?.trigger("entered")?.on(() => {
                layer.landed = true;
                reportEntered(layer);
              });
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
   * Shows `layer`, whose file has begun: his drawn enter is playing, and the
   * file says `entered` at its end. A file with no drawn enter (`enters`
   * off) has him there already, so the canvas fades in from --leave-scale
   * over --dur-pop; with less motion every file holds his still and the
   * canvas fades in over --dur-fade, across the Caw below.
   */
  function show(layer: Layer, canvas: HTMLCanvasElement) {
    const first = !layers.some((l) => l.shown);
    layer.canvas = canvas;
    layer.shown = true;
    if (first) {
      for (const upcoming of next) {
        fileBytes(upcoming).catch(() => {
          // Fetched again when that status is asked for.
        });
      }
    }
    // Rive's render loop draws him in the next frame.
    requestAnimationFrame(() => {
      performance.measure(`caw ${layer.status} first drawn`, {
        start: layer.asked,
      });
    });
    const enters =
      layer.rive?.viewModelInstance?.boolean("enters")?.value ?? false;
    if (enters && !reducedMotion) {
      return;
    }
    layer.fade = reducedMotion
      ? canvas.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: dur("--dur-fade"),
          easing: ease("--ease-out"),
        })
      : canvas.animate(
          [
            { opacity: 0, transform: `scale(${numberOf("--leave-scale")})` },
            { opacity: 1, transform: "none" },
          ],
          { duration: dur("--dur-pop"), easing: ease("--ease-out") }
        );
    layer.fade.finished
      .then(() => {
        layer.fade = undefined;
        layers = layers.filter((l) => l.id >= layer.id);
        reportEntered(layer);
      })
      .catch(() => {
        // Cancelled: he was asked to go, or the canvas left the page, before the fade ended.
      });
  }
</script>

<div
  aria-hidden="true"
  class="caw"
  style:--artboard="{(size * ARTBOARD) / BOX.side}px"
  style:--height="{ledge ? size * LEDGE_LINE : size}px"
  style:--left="{(-size * BOX.x) / BOX.side}px"
  style:--side="{size}px"
  style:--top="{(-size * BOX.y) / BOX.side}px"
  class:ledge
>
  {#each layers as layer (layer.id)}
    <canvas class:shown={layer.shown} {@attach mount(layer)}></canvas>
  {/each}
</div>

<style>
  .caw {
    position: relative;
    width: var(--side);
    height: var(--height);
    pointer-events: none;
    user-select: none;
  }
  /* Behind the edge: his acting still reaches past the box above and to
     the sides, and nothing of him draws below the slot's bottom. */
  .ledge {
    clip-path: inset(calc(var(--artboard) * -1) calc(var(--artboard) * -1) 0);
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
