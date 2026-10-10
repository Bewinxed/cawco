<script lang="ts">
  /**
   * Caw's head in the top bar: the way into what needs the operator (the
   * home's Needs you: every parked ask, a workflow run's question, a project
   * past its cap; home-state `needs`, the rows Home's Needs you section shows).
   *
   * He is his compacted head (assets/mascot/README.md, `compacted`: a head
   * that fills its box, built for 18 px), the last item of the bar's icon
   * group, on the group's glass (Shell): borderless, as every item in it is.
   * His head's optical centre, not his drawing's box, stands at the item's
   * centre (CAW_HEAD_CENTRE), since his beak and note reach out to one side. The
   * count rides his corner in the bar's badge, morphing digit by digit,
   * while anything waits. When something new arrives he plays his needs-you
   * beat once (`head-beat`: he blinks, stretches up into his alert face,
   * holds it and settles back; his guide: "a gentle beat… never a hello")
   * and holds still again. With less motion only the badge changes.
   *
   * He smiles back at the operator's own pointer (owner: "show the smiling
   * ^^ caw's face/animation on hover and on click"): a pointer coming onto
   * him plays `head-smile`, his eyes squeezing into ^^, which holds while it
   * stays, and leaving plays `head-unsmile` back to rest; a press, by mouse or
   * finger, squashes his head once on --press-scale and smiles, then the
   * drawer opens as it always has. The beat, when one plays, goes first.
   * With less motion nothing plays: his face is simply the ^^ one while the
   * pointer is on him, and his resting one again once it leaves.
   *
   * Each move is a clip of the bar's own files (assets/mascot/README.md,
   * Contract), drawn on a canvas over his face: each opens on the drawing
   * his face shows, so the face stays up until the clip's first frame is
   * drawn, and in the frame it lands his face becomes the drawing it landed
   * on and the clip's Rive is gone. Every drawing keeps two device pixels
   * inside his glass circle (assets/mascot/scripts/head_circle.py).
   *
   * A tap on him opens his panel: the kit's popover (`kit-pop`), anchored
   * under his glass as the machines item beside him opens MachinesList
   * (MachinesButton). It is non-modal: no scrim, no focus trap, nothing of
   * the page made inert, so the transcript scrolls, the composer takes keys
   * and the rail's rows open while it stands. A click anywhere else closes
   * it and still lands where it was aimed; Escape closes it and focus comes
   * back to him. Inside (CawPanel), Needs you, longest wait first, then the
   * Notices; choosing a row closes it and opens what the row is.
   */
  import { mergeProps } from "bits-ui";
  import { untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Popover from "#lib/components/ui/popover/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { DRAWER_QUERY } from "#lib/hooks/is-mobile.svelte.js";
  import { browser } from "$app/env";
  import { page } from "$app/state";
  import { type CawFile, type CawHead, stageCaw } from "./home/Caw.svelte";
  import CawFace from "./home/CawFace.svelte";
  import CawPanel from "./home/CawPanel.svelte";
  import { cawNotices } from "./home/caw-notices.svelte";
  import {
    CAW_HEAD_CENTRE,
    CAW_STILL_BLEED,
    cawStill,
  } from "./home/caw-still.svelte";
  import { home } from "./home/home-state.svelte";
  import { dur, easeOut, motionOk } from "./motion/curves.svelte";

  /**
   * The phone bar, where his glass is his own (Shell). The server has the
   * width cookie's guess (`narrow`) for the first paint.
   */
  const phoneQuery = new MediaQuery(DRAWER_QUERY);
  const phone = $derived(
    browser ? phoneQuery.current : Boolean(page.data.narrow)
  );
  /**
   * His head's side, px: the compacted still fills it. In the wide bar's
   * group, a symbol's (`--c-bar-symbol`); on a phone, his own glass less the
   * same 4px margin (`--c-bar-caw-head-phone`).
   */
  const head = $derived(phone ? 24 : 20);
  /** Where the panel stands under the glass he stands on, px. */
  const GAP = 8;

  const needs = $derived(home.needs);
  const count = $derived(needs.length);
  const noticeCount = $derived(cawNotices.count);
  /**
   * What he says with nothing to count: "All caught up" only once the fleet
   * is read over a live hub (PRODUCT.md: an empty answer is only given when
   * it is known); before that, what he is waiting on, in StatusLine's words.
   */
  const quiet = $derived.by(() => {
    switch (home.status) {
      case "connected":
        return "All caught up";
      case "reading":
        return "Reading the fleet";
      case "connecting":
        return "Connecting…";
      default:
        return "Hub unreachable";
    }
  });
  /** "· 2 notices" after what he says, while any notice stands. */
  const noticeWords = $derived(
    noticeCount > 0
      ? ` · ${noticeCount} ${noticeCount === 1 ? "notice" : "notices"}`
      : ""
  );
  const label = $derived(
    `${count > 0 ? `Needs you, ${count}` : quiet}${noticeWords}`
  );

  /* ── The count ─────────────────────────────────────────────────────── */
  /**
   * His count is drawn on his circle's rim, never written on him (owner:
   * "lines along the rim of the circle that increase with the count, to a
   * limit"): an arc for each thing waiting, from 12 o'clock clockwise,
   * ARC° long with GAP° between, in the attention ink. Past ARCS the count
   * refills the same arcs on top in a second ink, the fail glyph (owner:
   * "for more than 9 dashes we can refill again with another color"), so
   * the tenth redraws the first; past two laps the ring closes whole in the
   * second ink, which says "a lot". Nothing of it leaves his circle, so nothing of it
   * leaves the screen. The number itself is in his label, his tooltip and
   * the drawer's head. His circle is the bar's control height across,
   * round his item's centre: the wide group's trailing end. On the phone
   * his glass is his own, a tab tucked into the screen's trailing edge,
   * round on its leading side and square on the edge's (Shell), and the
   * arcs run along that outline instead (`outlinePath`).
   * Apple's NeedsCawButton draws the same arcs.
   */
  const ARC = 30;
  const ARC_GAP = 8;
  const ARCS = 9;
  /** The ring's box: his circle, in px (`--c-btn-h`). */
  const RING_BOX = 36;
  /** The arcs' stroke, px (`--c-caw-ring`). */
  const RIM_STROKE = 2;
  /** The glass's own edge, px: its hairline border (Shell `.tools::before`). */
  const GLASS_EDGE = 1;
  /**
   * The arcs lie ON the glass's rim, a dial's ticks on its edge (owner:
   * "lines along the rim of the circle … just like a dial thing"): the
   * stroke's outer edge just inside the glass's hairline, so even one arc
   * reads as a tick on the rim and not a mark inside it. Laid across the
   * hairline itself, its outer half met the bar and read as cut off.
   */
  const RIM = RING_BOX / 2 - GLASS_EDGE - RIM_STROKE / 2;
  /** The first lap's arcs, the second lap's on top of them, and past both the closed ring. */
  const ringClosed = $derived(count > 2 * ARCS);
  const arcCount = $derived(ringClosed ? 0 : Math.min(count, ARCS));
  const lapCount = $derived(
    ringClosed ? 0 : Math.min(Math.max(count - ARCS, 0), ARCS)
  );
  /**
   * The arcs' slots, 0 up, keyed by their place on the rim. A list rather
   * than `{#each { length }, k (k)}`: Biome's Svelte parser takes no key
   * after an index without an `as`.
   */
  const slots = (n: number) => Array.from({ length: n }, (_, k) => k);
  const arcSlots = $derived(slots(arcCount));
  const lapSlots = $derived(slots(lapCount));
  const tipText = $derived(
    `${count > 0 ? `${count} need you` : quiet}${noticeWords}`
  );

  /** A point on the rim, `deg` clockwise from 12 o'clock. */
  const onRim = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    const c = RING_BOX / 2;
    return `${(c + RIM * Math.sin(rad)).toFixed(3)} ${(c - RIM * Math.cos(rad)).toFixed(3)}`;
  };
  /**
   * A round cap reaches half the stroke past its path's end: this many
   * degrees of the rim, taken off each end so the arc as seen, caps and
   * all, is ARC° long and the gaps are ARC_GAP°.
   */
  const CAP = ((RIM_STROKE / 2 / RIM) * 180) / Math.PI;
  /** Arc `k`, seen from k × (ARC + GAP)° clockwise for ARC°. */
  const arcPath = (k: number) => {
    const from = k * (ARC + ARC_GAP) + CAP;
    return `M ${onRim(from)} A ${RIM} ${RIM} 0 0 1 ${onRim(from + ARC - 2 * CAP)}`;
  };

  /*
   * The phone's glass (`--c-bar-caw-glass-phone`): a half circle at its
   * leading side and square at its trailing corners, centred in the rim's
   * box. The arcs' path is that outline drawn half the stroke in:
   * clockwise from 12 o'clock along the top edge, down the trailing edge,
   * back along the bottom edge, then round the half circle back to 12. Each
   * arc is ARC/360 of the outline's length and ARC_GAP/360 from the next,
   * as on the circle.
   */
  const MID = RING_BOX / 2;
  /** The phone's glass, px (`--c-bar-caw-glass-phone`). */
  const STAND_BOX = 32;
  /** The outline's half height on the path, half the stroke in from inside the glass's hairline. */
  const STAND = STAND_BOX / 2 - GLASS_EDGE - RIM_STROKE / 2;
  const OUTLINE_LENGTH = (4 + Math.PI) * STAND;
  /** The point `s` px along the outline from 12 o'clock. */
  function onOutline(s: number): [number, number] {
    if (s < STAND) {
      return [MID + s, MID - STAND];
    }
    if (s < 3 * STAND) {
      return [MID + STAND, MID - STAND + (s - STAND)];
    }
    if (s < 4 * STAND) {
      return [MID + STAND - (s - 3 * STAND), MID + STAND];
    }
    const rad = Math.PI + (s - 4 * STAND) / STAND;
    return [MID + STAND * Math.sin(rad), MID - STAND * Math.cos(rad)];
  }
  /** Arc `k` on the outline: caps and all, ARC/360 of it long. */
  const outlinePath = (k: number) => {
    const from = (k * (ARC + ARC_GAP) * OUTLINE_LENGTH) / 360 + RIM_STROKE / 2;
    const to = from + (ARC * OUTLINE_LENGTH) / 360 - RIM_STROKE;
    const points: string[] = [];
    for (let s = from; s < to; s += 0.5) {
      points.push(
        onOutline(s)
          .map((n) => n.toFixed(2))
          .join(" ")
      );
    }
    points.push(
      onOutline(to)
        .map((n) => n.toFixed(2))
        .join(" ")
    );
    return `M ${points.join(" L ")}`;
  };
  /** The whole outline, from 12 o'clock: the ring closed past two laps. */
  const OUTLINE = [
    `M ${MID} ${MID - STAND}`,
    `L ${MID + STAND} ${MID - STAND}`,
    `L ${MID + STAND} ${MID + STAND}`,
    `L ${MID} ${MID + STAND}`,
    `A ${STAND} ${STAND} 0 0 1 ${MID} ${MID - STAND}`,
  ].join(" ");

  /**
   * An arc drawing itself in along its own length, and retracting the same
   * way; with less motion, a fade. Each arc's path length is 1.
   */
  const drawn = (_node: Element) => ({
    duration: dur("--dur-panel"),
    easing: easeOut,
    css: (t: number) =>
      motionOk.current ? `stroke-dashoffset: ${1 - t}` : `opacity: ${t}`,
  });

  /* ── His head: the beat and the smile ─────────────────────────────── */
  /**
   * What his head is doing: resting, or playing one of the bar's clips
   * (`beat`, `in` to his ^^ face, `out` of it), or holding his ^^ face
   * (`smiled`). Each clip opens on the drawing his face shows and lands on
   * the one he rests on after it.
   */
  type Phase = "rest" | "beat" | "in" | "smiled" | "out";
  let phase = $state<Phase>("rest");
  /** The drawing his face shows: his resting head, or his ^^ one. */
  let face = $state<CawFile>("compacted");
  /** The clip playing over his face, a fresh id each time. */
  let clip = $state<{ file: CawHead; id: number } | null>(null);
  /** The clip's first frame is drawn: it stands in for his face. */
  let covering = $state(false);
  let clips = 0;
  /**
   * A beat came while he smiled: it plays the moment he is back at rest, so
   * every clip opens on the drawing his face shows (a cut from ^^ to the
   * beat's resting head would jump).
   */
  let beatNext = false;
  /** A fine pointer is on him. */
  let hovered = false;
  /** A press is down on him. */
  let pressing = false;
  /** A pressed head, squashed while the press lasts. */
  let pressed = $state(false);

  // His ^^ face is drawn ahead, so the frame a smile lands in can show it.
  $effect(() => {
    cawStill("head-smile", head).drawn.catch(() => {
      // Drawn again when he smiles.
    });
  });

  function play(file: CawHead, next: Phase) {
    clips += 1;
    covering = false;
    clip = { file, id: clips };
    phase = next;
  }

  /** The clip landed: his face becomes the drawing it landed on, in this frame. */
  function landed() {
    const from = phase;
    clip = null;
    covering = false;
    if (from === "in") {
      face = "head-smile";
      phase = "smiled";
      // A tap's smile: in, and out again once it has landed; and out before
      // a beat waiting on it.
      if (beatNext || !(hovered || pressing)) {
        smileOut();
      }
      return;
    }
    face = "compacted";
    phase = "rest";
    if (beatNext) {
      beatNext = false;
      play("head-beat", "beat");
      return;
    }
    // Still under the pointer when the beat ends, or back under it while the
    // smile went out: he smiles at it.
    if (hovered || pressing) {
      smileIn();
    }
  }

  /** Plays `file` once on this canvas over his face. */
  function playClip(file: CawHead) {
    return (canvas: HTMLCanvasElement) => {
      const still = untrack(() => cawStill(file, head));
      canvas.width = still.backing;
      canvas.height = still.backing;
      let here = true;
      let stop: (() => void) | undefined;
      let dispose: (() => void) | undefined;
      stageCaw(file, canvas, still.box, still.dark)
        .then((stage) => {
          if (!here) {
            stage.dispose();
            return;
          }
          dispose = () => stage.dispose();
          stop = stage.enter(landed, () => {
            covering = true;
          });
        })
        .catch((error: unknown) => {
          console.error(`Caw ${file} did not play`, error);
          landed();
        });
      return () => {
        here = false;
        stop?.();
        dispose?.();
      };
    };
  }

  /** What he has already seen, by key; null until the fleet is first read. */
  let seen: Set<string> | null = null;

  // A new ask, or a new notice: his beat, once. A notice draws nothing on
  // his rim (the arcs are needs you's), so the beat is how it arrives.
  $effect(() => {
    const keys = [...needs.map((item) => item.key), ...cawNotices.keys];
    if (!home.ready) {
      return;
    }
    untrack(() => {
      const before = seen;
      seen = new Set(keys);
      if (before && keys.some((key) => !before.has(key)) && motionOk.current) {
        beat();
      }
    });
  });

  /**
   * The beat goes first: it plays now from rest, and from a smile as soon as
   * his eyes are open again, whatever the pointer does meanwhile.
   */
  function beat() {
    if (phase === "rest") {
      play("head-beat", "beat");
    } else if (phase !== "beat") {
      beatNext = true;
      smileOut();
    }
  }

  function smileIn() {
    // During the beat he smiles once it lands; while the smile goes out, once
    // he is back at rest; never ahead of a beat.
    if (phase !== "rest" || beatNext) {
      return;
    }
    if (!motionOk.current) {
      face = "head-smile";
      phase = "smiled";
      return;
    }
    play("head-smile", "in");
  }

  function smileOut() {
    // A smile still coming in goes out once it has landed.
    if (phase !== "smiled") {
      return;
    }
    if (!motionOk.current) {
      face = "compacted";
      phase = "rest";
      return;
    }
    play("head-unsmile", "out");
  }

  function pointerOn(event: PointerEvent) {
    if (event.pointerType !== "mouse") {
      return;
    }
    hovered = true;
    smileIn();
  }

  function pointerOff(event: PointerEvent) {
    if (event.pointerType !== "mouse") {
      return;
    }
    hovered = false;
    if (!pressing) {
      smileOut();
    }
  }

  /** A press: one squash, and the smile; the panel is the popover's. */
  function press(event: PointerEvent) {
    if (!event.isPrimary || event.button > 0) {
      return;
    }
    pressing = true;
    pressed = true;
    smileIn();
    const lift = () => {
      pressing = false;
      pressed = false;
      window.removeEventListener("pointerup", lift);
      window.removeEventListener("pointercancel", lift);
      // A finger has no hover to hold the smile: it goes once it has landed.
      if (!hovered) {
        smileOut();
      }
    };
    window.addEventListener("pointerup", lift);
    window.addEventListener("pointercancel", lift);
  }

  /* ── The panel ─────────────────────────────────────────────────────── */
  let capsule = $state<HTMLButtonElement | null>(null);
  let content = $state<HTMLElement | null>(null);
  let open = $state(false);
  /**
   * The last thing that could open the panel was a pointer press, not a
   * key (MachinesButton's rule): focus goes in without the ring.
   */
  let byPointer = false;
  /** The panel is closing on a press outside it: the press keeps its focus. */
  let closedOutside = false;
  /**
   * How far the panel stands under him: GAP under the glass he stands on
   * (the bar's group, `data-bar-group`, or his own on a phone), read as it
   * opens.
   */
  let offset = $state(GAP);

  function measure() {
    if (!capsule) {
      return;
    }
    const own = capsule.getBoundingClientRect().bottom;
    const glass =
      capsule.closest("[data-bar-group]")?.getBoundingClientRect().bottom ??
      own;
    offset = GAP + Math.max(0, glass - own);
  }
</script>

<svelte:window
  onkeydowncapture={() => {
    byPointer = false;
  }}
  onpointerdowncapture={() => {
    byPointer = true;
  }}
/>

<Popover.Root
  bind:open={
    () => open,
    (value) => {
    if (value) {
      measure();
    }
    open = value;
  }
  }
>
  <Tip label={tipText}>
    {#snippet children(
      tip
    )}
      <Popover.Trigger>
        {#snippet child({
          props,
        })}
          <button
            {...mergeProps(props, tip, {
              onpointerdown: press,
              onpointerenter: pointerOn,
              onpointerleave: pointerOff,
            })}
            aria-label={label}
            class="capsule bar-item touch-hit press-tint"
            data-needs-caw
            type="button"
            bind:this={capsule}
          >
            <span class="mug" class:pressed={pressed}>
              <span
                class="face"
                data-caw-phase={phase}
                style:--bleed="{CAW_STILL_BLEED}px"
                style:--dx={0.5 - CAW_HEAD_CENTRE.x}
                style:--dy={0.5 - CAW_HEAD_CENTRE.y}
                style:--side="{head}px"
                class:covered={covering}
              >
                <CawFace size={head} status={face} />
                {#if clip}
                  {#key clip.id}
                    <canvas
                      aria-hidden="true"
                      {@attach playClip(clip.file)}
                    ></canvas>
                  {/key}
                {/if}
              </span>
            </span>
            <!-- What waits, on his rim: an arc each, a second lap on top in its
         own ink past ARCS, closed whole past two laps. -->
            <svg
              aria-hidden="true"
              class="rim"
              data-count={count}
              viewBox="0 0 {RING_BOX} {RING_BOX}"
            >
              <!-- The wide bar's circle, and the phone's standing outline: the
               one the width draws is shown (styles below). -->
              <g class="round">
                {#each arcSlots as k (k)}
                  <path
                    class="arc"
                    d={arcPath(k)}
                    pathLength="1"
                    transition:drawn
                  />
                {/each}
                {#each lapSlots as k (k)}
                  <path
                    class="arc lap"
                    d={arcPath(k)}
                    pathLength="1"
                    transition:drawn
                  />
                {/each}
                {#if ringClosed}
                  <circle
                    class="arc lap whole"
                    cx={MID}
                    cy={MID}
                    pathLength="1"
                    r={RIM}
                    transform="rotate(-90 {MID} {MID})"
                    transition:drawn
                  />
                {/if}
              </g>
              <g class="standing">
                {#each arcSlots as k (k)}
                  <path
                    class="arc"
                    d={outlinePath(k)}
                    pathLength="1"
                    transition:drawn
                  />
                {/each}
                {#each lapSlots as k (k)}
                  <path
                    class="arc lap"
                    d={outlinePath(k)}
                    pathLength="1"
                    transition:drawn
                  />
                {/each}
                {#if ringClosed}
                  <path
                    class="arc lap whole"
                    d={OUTLINE}
                    pathLength="1"
                    transition:drawn
                  />
                {/if}
              </g>
            </svg>
          </button>
        {/snippet}
      </Popover.Trigger>
    {/snippet}
  </Tip>
  <!-- Non-modal: no scrim, no trap; an outside press closes it and still
       lands (bits-ui's `interactOutsideBehavior` "close" prevents nothing). -->
  <Popover.Content
    align="end"
    aria-label="Needs you"
    class="caw-pop w-[min(380px,calc(100vw-24px))] gap-0"
    collisionPadding={phone ? 12 : 8}
    onCloseAutoFocus={(event) => {
      // Closed by a press elsewhere: the focus stays where that press put
      // it (the composer, a rail row). Escape and his own press bring it
      // back to him, as the popover does by itself.
      if (closedOutside) {
        event.preventDefault();
        closedOutside = false;
      }
    }}
    onInteractOutside={() => {
      closedOutside = true;
    }}
    onOpenAutoFocus={(event) => {
      // Opened by a press, focus goes into the list as it does from a key,
      // but without the ring: a script's focus would draw it after a press.
      if (byPointer) {
        event.preventDefault();
        content
          ?.querySelector<HTMLElement>("a.cover, button, .empty")
          ?.focus({ focusVisible: false, preventScroll: true } as FocusOptions);
      }
    }}
    side="bottom"
    sideOffset={offset}
    trapFocus={false}
    bind:ref={content}
  >
    <CawPanel
      onchoose={() => {
        open = false;
      }}
      {quiet}
    />
  </Popover.Content>
</Popover.Root>

<style>
  /* An item of the bar's group (Shell's `.bar-item` recipe draws its box,
     hover and focus). */
  .capsule {
    position: relative;
    display: grid;
    place-items: center;
    /* A circle whatever the strips' boxes: the beat's reaches past it. */
    inline-size: var(--c-bar-item);
    flex: none;
    padding: 0;
    -webkit-tap-highlight-color: transparent;
  }
  /* The panel rises 8px from 0.92 as it opens (kit-pop's own motion, on
     --dur-pop and the drawer curve; out on --dur-exit). */
  :global(.kit-pop.caw-pop) {
    --pop-scale: 0.92;
    --pop-rise: 8px;
  }
  /* On a phone his box is his own glass's (Shell). His touch area is a 44px
     square (Apple HIG, Buttons: "a hit region of at least 44x44 pt") at the
     screen's edge, centred on his glass, so none of it falls off the screen
     or under the transcript. */
  @media (max-width: 899px) and (pointer: coarse) {
    .capsule::after {
      inset: auto;
      inset-inline-end: 0;
      inset-block-start: calc((var(--c-bar-caw-glass-phone) - 44px) / 2);
      inline-size: 44px;
      block-size: 44px;
    }
  }
  /* What waits, on his circle's rim: his circle's box round his item's
     centre, the arcs a 2px round-capped attention stroke, each with a path
     length of 1 so it draws in and out along itself. (Not `.ring`: that is
     Tailwind's ring utility, a box-shadow round the box.) */
  .rim {
    position: absolute;
    inset-block-start: 50%;
    inset-inline-start: 50%;
    inline-size: var(--c-btn-h);
    block-size: var(--c-btn-h);
    overflow: visible;
    translate: -50% -50%;
    pointer-events: none;
  }
  .arc {
    fill: none;
    stroke: var(--status-attn-glyph);
    stroke-width: var(--c-caw-ring);
    stroke-linecap: round;
    stroke-dasharray: 1;
    stroke-dashoffset: 0;
  }
  /* The second lap, and the closed ring past it: the fail glyph's ink. */
  .arc.lap {
    stroke: var(--status-fail-glyph);
  }
  /* The phone's glass is the standing outline (Shell), the wide bar's the
     group's round end. */
  .standing {
    display: none;
  }
  @media (max-width: 899px) {
    .round {
      display: none;
    }
    .standing {
      display: inline;
    }
  }
  /* His head: his face and the clip playing over it in one cell, squashed
     once under a press (DESIGN.md, The Press Rule) with motion allowed. */
  .mug {
    display: grid;
    place-items: center;
    pointer-events: none;
    @media (prefers-reduced-motion: no-preference) {
      transition: transform var(--dur-toggle) var(--ease-out);
    }
  }
  .mug.pressed {
    @media (prefers-reduced-motion: no-preference) {
      transform: scale(var(--press-scale));
    }
  }
  /* His head's optical centre at the centre, not his box (CAW_HEAD_CENTRE): moved
     in layout, not by a transform, so his picture stays on whole pixels. */
  .face {
    position: relative;
    grid-area: 1 / 1;
    inset-inline-start: calc(var(--dx) * var(--side));
    inset-block-start: calc(var(--dy) * var(--side));
    display: grid;
  }
  /* A clip's first frame is drawn over him: it stands in for his face, which
     is drawn and ready under it for the frame the clip lands. */
  .face.covered > :global(.face) {
    visibility: hidden;
  }
  /* The clip, on his face's own canvas box: his box and its bleed. */
  .face canvas {
    position: absolute;
    inset: calc(var(--bleed) * -1);
    inline-size: calc(var(--side) + 2 * var(--bleed));
    block-size: calc(var(--side) + 2 * var(--bleed));
  }
</style>
