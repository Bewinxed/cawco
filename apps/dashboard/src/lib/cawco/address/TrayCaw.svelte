<script lang="ts">
  /**
   * Caw in the address tray, in whichever of his drawn files the state
   * asks for (tray.svelte.ts `pose`): a status file through `Caw` (his
   * enters, loops and leaves are the file's own), and a file that is not
   * a status (`climb`, the bar's `head-*` moves) staged on a canvas of its
   * own through `stageCaw`, its drawn enter played once and its last
   * drawing held. A pose is a list: each plays once the one before has
   * landed (`climb`, then `idle`).
   *
   * `ledge`: he stands behind the tray's top edge, the slot's bottom: the
   * peek and the climb draw their own wing tips in front of it; a status
   * file is clipped at it, so only what stands above the edge shows; a
   * head stands on it, its height the slot's. Without a ledge he stands
   * whole in a slot of his size, a head at the same height a body's head
   * stands.
   *
   * Between a status and a file (or one file and another) the one leaving
   * holds its drawing and fades to --leave-scale over --dur-fade, out of
   * the flow, while the next comes in by its own enter (assets/mascot
   * README.md, Contract).
   */
  import Caw, {
    ARTBOARD,
    BOX,
    type CawFile,
    type CawStatus,
    LEDGE_LINE,
    stageCaw,
  } from "#lib/cawco/home/Caw.svelte";
  import { deviceRatio } from "#lib/cawco/home/device-ratio.svelte.js";
  import {
    dur,
    easeOut,
    lifting,
    motionOk,
    numberOf,
    pinned,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { theme } from "#lib/theme.svelte.js";
  import type { TrayPose } from "./tray.svelte";

  let {
    pose,
    size,
    ledge = false,
  }: {
    /** The files in the order they play: each once the one before has landed. */
    pose: TrayPose[];
    /** Side of his still box in px. */
    size: number;
    ledge?: boolean;
  } = $props();

  const STATUSES: readonly TrayPose[] = [
    "ready",
    "idle",
    "loading",
    "done",
    "needs-you",
  ];

  /** Without a ledge to climb from, the climb is his idle. */
  const files = $derived(
    pose.map((one) => (!ledge && one === "climb" ? "idle" : one))
  );
  /** Which of `files` plays now. */
  let at = $state(0);
  let playing = $state("");
  $effect.pre(() => {
    const said = files.join(" ");
    if (said !== playing) {
      playing = said;
      at = 0;
    }
  });
  const file = $derived(files[Math.min(at, files.length - 1)]);
  /**
   * What mounts him: the peek (a ready Caw behind the ledge), any other
   * status (one `Caw` that changes its own file), or a file of its own.
   */
  const family = $derived.by(() => {
    if (STATUSES.includes(file)) {
      return ledge && file === "ready" ? "peek" : "status";
    }
    return file;
  });
  const isHead = $derived(file.startsWith("head-"));

  /** The slot's height: the part of him above the edge, or his whole box. */
  const height = $derived(ledge ? size * LEDGE_LINE : size);
  /** A head stands as tall as the slot behind a ledge, as a body's head does without one. */
  const headSide = $derived(size * LEDGE_LINE);

  function landed(): void {
    if (at < files.length - 1) {
      at += 1;
    }
  }

  /** The one leaving: out of the flow where it stands, fading to --leave-scale. */
  function leave(node: HTMLElement) {
    if (!(node.checkVisibility() && motionOk.current)) {
      return { duration: 0 };
    }
    const scale = numberOf("--leave-scale");
    return lifting(node, pinned(node), {
      duration: dur("--dur-fade"),
      easing: easeOut,
      css: (t: number) => `opacity: ${t}; scale: ${scale + (1 - scale) * t}`,
    });
  }

  /** A file that is no status, on its own canvas: its enter once, then its last drawing held. */
  function stage(staged: CawFile, side: number, dark: boolean) {
    return (canvas: HTMLCanvasElement) => {
      const ratio = deviceRatio.current;
      const backing = Math.round(((side * ARTBOARD) / BOX.side) * ratio);
      canvas.width = backing;
      canvas.height = backing;
      const unit = (side * ratio) / BOX.side;
      let gone = false;
      let stop: (() => void) | undefined;
      let held: Awaited<ReturnType<typeof stageCaw>> | undefined;
      stageCaw(
        staged,
        canvas,
        { x: BOX.x * unit, y: BOX.y * unit, side: side * ratio },
        dark
      )
        .then((one) => {
          if (gone) {
            one.dispose();
            return;
          }
          held = one;
          if (motionOk.current) {
            stop = one.enter(landed);
          } else {
            one.rest();
            landed();
          }
        })
        .catch((error: unknown) => {
          console.error(`Caw ${staged} did not draw`, error);
          landed();
        });
      return () => {
        gone = true;
        stop?.();
        held?.dispose();
      };
    };
  }
</script>

<div
  aria-hidden="true"
  class="pointer-events-none relative h-(--height) w-(--side) select-none"
  data-slot="tray-caw"
  data-caw-file={file}
  style:--height="{height}px"
  style:--side="{size}px"
>
  {#key family}
    <div
      class="absolute inset-x-0 bottom-0 flex h-(--height) justify-center data-behind:clip-path-(--behind-clip)"
      data-behind={(ledge && family === "status") || undefined}
      style:--behind-clip={"inset(-100vh -100vw 0)"}
      out:leave
    >
      {#if family === "peek"}
        <Caw
          ledge
          next={["idle", "loading", "done", "needs-you"]}
          onentered={landed}
          {size}
          status="ready"
        />
      {:else if family === "status"}
        <!-- One Caw for every status in a row: the file changes, he stays. -->
        <div class="absolute top-0 start-0">
          <Caw
            next={["idle", "loading", "done", "needs-you"]}
            onentered={landed}
            {size}
            status={file as CawStatus}
          />
        </div>
      {:else}
        {@const side = isHead ? headSide : size}
        <!-- His still box at `side`, its artboard drawing past it unclipped:
             a head stands on the slot's foot, the climb's box where the
             peek's stands. -->
        <div
          class={[
            "absolute start-1/2 size-(--box) -translate-x-1/2",
            isHead ? "bottom-0" : "top-0",
          ]}
          style:--box="{side}px"
        >
          <canvas
            class="absolute top-(--top) start-(--left) size-(--artboard)"
            style:--artboard="{(side * ARTBOARD) / BOX.side}px"
            style:--left="{(-side * BOX.x) / BOX.side}px"
            style:--top="{(-side * BOX.y) / BOX.side}px"
            {@attach stage(file as CawFile, side, theme.resolved === "dark")}
          ></canvas>
        </div>
      {/if}
    </div>
  {/key}
</div>
