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
    | "reconnecting";

  /**
   * The status files, as the build emits them: URLs only, so a file is
   * fetched the first time its status is shown and never before.
   */
  const FILES = import.meta.glob<string>(
    "../../../../../../assets/mascot/caw/*.riv",
    { query: "?url", import: "default", eager: true }
  );
  const fileUrl = (status: CawStatus): string =>
    FILES[`../../../../../../assets/mascot/caw/${status}.riv`];

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
   * Rive's web runtime, loaded the first time Caw appears, with its WASM
   * served from this app (the version the package pins) instead of the
   * runtime's default CDN.
   */
  let runtime: Promise<typeof import("@rive-app/canvas")> | undefined;
  function riveRuntime() {
    runtime ??= import("@rive-app/canvas").then((module) => {
      module.RuntimeLoader.setWasmUrl(riveWasm);
      return module;
    });
    return runtime;
  }
</script>

<script lang="ts">
  /**
   * Caw, the CawCo crow, at a brand moment: an empty home, a detail area
   * with nothing open yet, a fleet still being read, a hub being reached
   * again. Never in a row, an error or a permission request.
   *
   * Drawn by Rive from his status's file, whose loops take turns on their
   * own; this sets only the file's `Caw` view model: `dark` (the cream rim)
   * and `reducedMotion` (his still). A status change loads the new file and
   * fades its Caw in over the shown one (--dur-fade on --ease-out), which
   * stays fully drawn underneath until the fade ends, so no frame is empty.
   * At most two Caws are alive at once.
   *
   * `size` is the side of his still in px. His acting reaches past it, so
   * the canvases spill over the box unclipped and never take a pointer.
   */
  import { untrack } from "svelte";
  import { dur, ease, motionOk } from "$lib/cawco/motion/curves.svelte";
  import { theme } from "$lib/theme.svelte";

  let {
    status,
    next = [],
    size = 160,
  }: {
    status: CawStatus;
    /**
     * The statuses this place can change to. Their files are fetched once
     * Caw is on screen, so a change fades in without waiting on the network.
     */
    next?: CawStatus[];
    /** Side of Caw's still in px; the artboard around it draws past it. */
    size?: number;
  } = $props();

  /** The files' 592 px artboard and the 512 px still box in it, at (43, 40). */
  const ARTBOARD = 592;
  const BOX = { x: 43, y: 40, side: 512 };

  interface Layer {
    /** When the status was asked for, for the fade's start mark. */
    asked: number;
    /** Its fade in, while it runs. */
    fade?: Animation;
    id: number;
    rive?: Rive;
    shown: boolean;
    status: CawStatus;
  }
  /** Bottom to top: the Caw on screen, and during a change the one fading in over it. */
  let layers = $state<Layer[]>([]);
  let nextId = 0;

  const dark = $derived(theme.resolved === "dark");
  const reducedMotion = $derived(!motionOk.current);

  $effect(() => {
    const asked = status;
    untrack(() => ask(asked));
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

  /**
   * Puts `incoming` on the way in. A Caw still loading for an earlier change
   * is dropped, and during a fade the one below goes and the one fading in is
   * drawn fully at once, so with the new one there are never more than two.
   */
  function ask(incoming: CawStatus) {
    const top = layers.filter((l) => l.shown).at(-1);
    top?.fade?.finish();
    if (top?.status === incoming) {
      layers = [top];
      return;
    }
    nextId += 1;
    layers = [
      ...(top ? [top] : []),
      { id: nextId, status: incoming, asked: performance.now(), shown: false },
    ];
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

  /** Draws `layer`'s Caw into its canvas once its file is in, then fades it in. */
  function mount(layer: Layer) {
    return (canvas: HTMLCanvasElement) => {
      let gone = false;
      let rive: Rive | undefined;
      Promise.all([riveRuntime(), fileBytes(layer.status)])
        .then(([{ Rive, Layout, Fit, Alignment }, buffer]) => {
          if (gone) {
            return;
          }
          rive = new Rive({
            canvas,
            buffer,
            stateMachines: "CawStates",
            autoBind: true,
            autoplay: true,
            layout: new Layout({
              fit: Fit.Contain,
              alignment: Alignment.Center,
            }),
            onLoad: () => {
              if (gone || !rive) {
                return;
              }
              rive.resizeDrawingSurfaceToCanvas();
              write(rive, { dark, reducedMotion });
              layer.rive = rive;
              show(layer, canvas);
            },
          });
        })
        .catch((error: unknown) => {
          console.error(`Caw ${layer.status} did not load`, error);
        });
      return () => {
        gone = true;
        rive?.cleanup();
      };
    };
  }

  /** Fades `layer` in; once it is fully drawn, the Caw below it goes. */
  function show(layer: Layer, canvas: HTMLCanvasElement) {
    const settled = layers.some((l) => l.shown);
    performance.measure(`caw ${layer.status} fades in`, { start: layer.asked });
    layer.shown = true;
    if (!settled) {
      for (const upcoming of next) {
        fileBytes(upcoming).catch(() => {
          // Fetched again when that status is asked for.
        });
      }
      return;
    }
    layer.fade = canvas.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: dur("--dur-fade"),
      easing: ease("--ease-out"),
    });
    layer.fade.finished
      .then(() => {
        layer.fade = undefined;
        layers = layers.filter((l) => l.id >= layer.id);
      })
      .catch(() => {
        // Cancelled: the canvas left the page before its fade ended.
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
