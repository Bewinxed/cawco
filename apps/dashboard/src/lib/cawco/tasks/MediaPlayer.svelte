<script lang="ts">
  import { madeWords } from "@cawco/core/words/made";
  /**
   * A clip or a sound, read from `src`, in CawCo's one player: a task's
   * output, a report's file (TaskOutput), a block's Video or Audio
   * (BlockVideo, BlockAudio). Its metadata alone loads until it is played.
   *
   * Built on Video.js 10 (`@videojs/html`, media-elements.ts): its player
   * holds the media's state, and its elements are the controls, with their
   * roles, names, keys and the scrubber's drag; every look is the tokens'.
   * The controls are bar items (MediaButton, BarItem's recipe) in a row
   * whose contour they take (DESIGN.md, The Glass Contour Rule): Play or
   * Pause, the scrubber (its track and loaded length on the paper ramp, what
   * has played in ink), the time played and the whole in tabular meta, and
   * Mute.
   * - A sound is that row alone, a raised capsule the reply's measure
   *   wide (content sits raised on the frame); replaced, its block stands
   *   as a still row in the recess (BlockAudio).
   * - A clip's row is the panel's glass (BarGlass) floating over its
   *   picture's foot, with Full screen last; it stands while the clip is
   *   paused or the pointer moves over it, and fades while it plays. A
   *   press on the picture plays or pauses it.
   *
   * One that can't play says why in the hub's words (media-problem.ts).
   */
  import type { Attachment } from "svelte/attachments";
  import { on } from "svelte/events";
  import { reveal } from "#lib/cawco/motion/curves.svelte.js";
  import { track } from "#lib/cawco/track.js";
  import { BarGlass } from "#lib/components/ui/bar-glass/index.js";
  import { placeItems } from "#lib/components/ui/bar-glass/place.js";
  import {
    IconExitFullScreenLinear,
    IconFullScreenLinear,
    IconPauseLinear,
    IconPlayLinear,
    IconReopenLinear,
    IconSoundLinear,
    IconSoundOffLinear,
  } from "#lib/icons.js";
  import { cn } from "#lib/utils.js";
  import MediaButton from "./MediaButton.svelte";
  import "./media-elements";
  import type { PlayerElement } from "./media-elements";
  import { mediaProblem } from "./media-problem";

  let {
    src,
    name,
    kind,
    class: className,
  }: {
    src: string;
    /** What it is called where it fails: its file's name. */
    name: string;
    kind: "video" | "audio";
    /** The picture's own sizing and edge (a clip's height cap, its outline). */
    class?: string;
  } = $props();

  let problem = $state<string | null>(null);
  $effect(() => {
    // A new file is tried fresh.
    track(src);
    problem = null;
  });

  /** The element's own error event, held as an attachment: no press on it. */
  const whenFailed: Attachment<HTMLMediaElement> = (node) =>
    on(node, "error", async () => {
      const at = src;
      const words = await mediaProblem(at, name);
      if (at === src) {
        problem = words;
      }
    });

  /** The player's state its controls' names and symbols follow. */
  let now = $state({
    paused: true,
    ended: false,
    muted: false,
    fullScreen: false,
  });

  /** Follows the player's store, from the moment it holds one. */
  const follows: Attachment<PlayerElement> = ({ store }) => {
    if (!store) {
      return;
    }
    const read = () => {
      const { paused, ended, muted, isFullscreen } = store;
      const fullScreen = Boolean(isFullscreen);
      // The store speaks on every tick of the clock: only a change of these is news.
      if (
        paused !== now.paused ||
        ended !== now.ended ||
        muted !== now.muted ||
        fullScreen !== now.fullScreen
      ) {
        now = { paused, ended, muted, fullScreen };
      }
    };
    read();
    return store.subscribe(read);
  };

  const play = $derived.by(() => {
    if (!now.paused) {
      return { label: madeWords.pause, icon: IconPauseLinear };
    }
    return now.ended
      ? { label: madeWords.playAgain, icon: IconReopenLinear }
      : { label: madeWords.play, icon: IconPlayLinear };
  });
  const sound = $derived(
    now.muted
      ? { label: madeWords.unmute, icon: IconSoundOffLinear }
      : { label: madeWords.mute, icon: IconSoundLinear }
  );
  const screen = $derived(
    now.fullScreen
      ? { label: madeWords.exitFullScreen, icon: IconExitFullScreenLinear }
      : { label: madeWords.fullScreen, icon: IconFullScreenLinear }
  );
</script>

{#snippet scrubber()}
  <!-- The scrubber: its thumb (the library's, which takes the focus and
       the keys) shows where it is taken; its track thickens under the
       pointer, focus or a drag. A drag draws the fill to the pointer. -->
  <media-time-slider
    class="group/scrub relative mx-space-2 coarse:mx-space-6 hit-gap-x-space-8 flex h-c-bar-item min-w-0 flex-1 items-center"
    label={madeWords.position}
  >
    <media-slider-track
      class="relative block h-c-scrub-h w-full overflow-clip rounded-pill bg-media-track transition-[height] duration-(--dur-control) ease-out group-data-interactive/scrub:h-c-scrub-h-active"
    >
      <media-slider-buffer
        class="absolute inset-y-0 start-0 block w-(--media-slider-buffer,0%) bg-media-buffered"
      ></media-slider-buffer>
      <media-slider-fill
        class="absolute inset-y-0 start-0 block w-(--media-slider-fill,0%) bg-media-fill group-data-dragging/scrub:w-(--media-slider-pointer,0%)"
      ></media-slider-fill>
    </media-slider-track>
    <media-slider-thumb
      class="absolute start-(--media-slider-fill,0%) top-1/2 block size-c-scrub-thumb -translate-x-1/2 rtl:translate-x-1/2 -translate-y-1/2 touch-hit rounded-full bg-media-fill opacity-0 transition-opacity duration-(--dur-control) ease-out group-data-interactive/scrub:opacity-100 group-data-dragging/scrub:start-(--media-slider-pointer,0%) coarse:opacity-100 focus-visible:opacity-100"
    ></media-slider-thumb>
  </media-time-slider>
{/snippet}

{#snippet time()}
  <media-time-group
    class={[
      "inline-flex flex-none items-center gap-space-1 pe-space-2 type-meta num whitespace-nowrap",
      // Over a picture the glass lets its light through: the time holds its contrast in the strong ink.
      kind === "video" ? "text-ink-strong" : "text-ink-muted",
    ]}
  >
    <media-time type="current"></media-time>
    <media-time-separator></media-time-separator>
    <media-time type="duration"></media-time>
  </media-time-group>
{/snippet}

{#snippet controls()}
  <MediaButton
    element="media-play-button"
    icon={play.icon}
    label={play.label}
  />
  {@render scrubber()}
  {@render time()}
  <MediaButton
    element="media-mute-button"
    icon={sound.icon}
    label={sound.label}
  />
{/snippet}

{#if problem}
  <p class="m-0 type-meta text-status-fail-ink wrap-anywhere">{problem}</p>
{:else if kind === "video"}
  <video-player class="contents" {@attach follows}>
    <media-container
      class="group/clip relative block overflow-clip rounded-sm bg-surface-recess"
      in:reveal
    >
      <!-- svelte-ignore a11y_media_has_caption: a file carries no caption track; the file is what there is -->
      <!-- biome-ignore lint/a11y/useMediaCaption: a file carries no caption track; the file is what there is -->
      <video
        class={cn("block w-full", className)}
        playsinline
        preload="metadata"
        {src}
        {@attach whenFailed}
      ></video>
      <!-- A press on the picture plays or pauses it; a finger's tap shows the controls instead (the library's). -->
      <media-gesture type="tap" action="togglePaused" pointer="mouse"
      ></media-gesture>
      <media-controls class="contents">
        <!-- Shown while paused or while the pointer moves over the clip,
             and while a control holds the keyboard's focus. -->
        <media-controls-content
          class="pointer-events-none absolute inset-x-space-2 bottom-space-2 block opacity-0 invisible transition-fade-hide data-visible:visible data-visible:opacity-100 data-visible:transition-fade-show has-focus-visible:visible has-focus-visible:opacity-100"
        >
          <div class="pointer-events-auto">
            <BarGlass form="group">
              {@render controls()}
              <MediaButton
                element="media-fullscreen-button"
                icon={screen.icon}
                label={screen.label}
              />
            </BarGlass>
          </div>
        </media-controls-content>
      </media-controls>
    </media-container>
  </video-player>
{:else}
  <audio-player class="contents" {@attach follows}>
    <!-- The row: a raised capsule its items stand concentric in, as a
         glass's do (design.css `concentric-row`), each marked by where it
         stands (placeItems). -->
    <media-container
      class={cn(
        "flex h-c-btn-h w-full min-w-0 items-center gap-c-bar-group-pad rounded-pill bg-surface-raised p-c-bar-group-pad shadow-tile outline-1 -outline-offset-1 outline-border-hairline concentric-row r-inset-c-bar-group-pad r-join-xs hit-gap-x-c-bar-group-pad coarse:gap-space-5 coarse:hit-gap-x-space-5",
        className
      )}
      data-glass
      style:--r-outer="calc(var(--c-btn-h) / 2)"
      {@attach placeItems}
      in:reveal
    >
      <!-- biome-ignore lint/a11y/useMediaCaption: a file carries no caption track; the file is what there is -->
      <audio preload="metadata" {src} {@attach whenFailed}></audio>
      {@render controls()}
    </media-container>
  </audio-player>
{/if}
