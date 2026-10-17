<script lang="ts">
  /**
   * The glass's one card (DESIGN.md, "The glass's cards"): a HangCard on the
   * top bar's glass that shows whichever of Caw's panel, the machines and
   * the Jump palette is open (bar-glass `open`). It hangs right-aligned under
   * the glass, flush with its trailing flank, comes down out of the glass as
   * the first of them opens and goes back up into it as the last closes
   * (motion/hang).
   *
   * Opening another while one hangs never folds the card: it stays hung and
   * changes in place, as the session card glides from tab to tab. What it
   * shows cross-fades, the outgoing out over --dur-exit on --ease-out (The
   * Fast Exit Rule) and the incoming in over --dur-morph on --ease-drawer,
   * the morph's own clock; and its box tweens from the size it is drawn at
   * to the new one's (motion/morph, width and height, over --dur-morph on
   * --ease-drawer). The outgoing contents are lifted out of the flow where
   * they stand as they start to fade, so the card's natural size is the
   * incoming's alone. Right-aligned, the card's trailing edge, its top, the
   * cut and the glass's join stay where they are; only its leading edge and
   * its foot move. A switch caught mid-way retargets from where it is drawn:
   * the box from its drawn size, each face's fade from its drawn opacity, and
   * contents still fading out come back if they are asked for again.
   *
   * Jump from the keyboard (⌘K) stands open at once, leaves at once, and a
   * swap into it lands at once, with no fade and no tween (Emil Kowalski:
   * "Never animate keyboard-initiated actions"; bar-glass `instant`). With
   * less motion the box takes its new size at once and the contents still
   * cross-fade.
   *
   * Focus goes where the new contents put it: Jump's field, the machines'
   * first row, Caw's first row (without the ring after a press). A press
   * elsewhere, or on the glass, leaves the focus where it put it; Escape,
   * and every other close, gives it back to what had it before the first
   * card opened, or, opened from inside the phone's sheet, which goes as it
   * opens, to what invoked the sheet: the burger (bar-glass `invoker`).
   * ⌘K in Jump's own field closes it (Shell). Jump's Escape is the finder's:
   * it folds an open peek first and closes only with nothing folded open.
   * Non-modal: no scrim, no trap, and a press outside closes it
   * and still lands; the glass's own items open, swap or shut it themselves.
   *
   * Mounted from the start and kept (`forceMount`), up behind the cut and
   * inert while shut: placing and painting it on a press held the press's
   * frame back in WebKit (owner: "the pressing on caw is very laggy when it
   * opens"), so it is opened once, unseen, just after the page has loaded,
   * and Caw's panel is what it holds at rest.
   *
   * It is placed `fixed`, as the bar it hangs from stands. bits-ui places a
   * card only while it is open (use-floating: no `autoUpdate` while shut),
   * so the shut card keeps the place it had with the face it closed on:
   * Jump's, 756px wide from a tablet's 12px, while it now holds Caw's 380px,
   * its neck still measured from the glass at the screen's trailing edge,
   * flared 12px past it. Placed `absolute`, that stale box was the page's
   * own (the page scrolled sideways, 780px in a 768px screen, Chromium and
   * Firefox alike, J9); a fixed box is never part of the page's scroll.
   */
  import { untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { HangCard } from "#lib/components/ui/hang-card/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { DRAWER_QUERY } from "#lib/hooks/is-mobile.svelte.js";
  import { browser } from "$app/env";
  import { page } from "$app/state";
  import {
    barGlass,
    type GlassCard as Card,
    glassElement,
    glassPlacement,
  } from "./bar-glass.svelte";
  import FinderCard from "./find/FinderCard.svelte";
  import CawPanel from "./home/CawPanel.svelte";
  import { liveFeed } from "./home/caw-feed.svelte";
  import MachinesList from "./MachinesList.svelte";
  import { dur, ease } from "./motion/curves.svelte";
  import { FOLDED, GROWN, standsOpen } from "./motion/hang";
  import { cawQuiet } from "./NeedsCaw.svelte";

  const phoneQuery = new MediaQuery(DRAWER_QUERY);
  const phone = $derived(
    browser ? phoneQuery.current : Boolean(page.data.narrow)
  );
  /** The card asked for. A phone keeps the machines in its sidebar (Shell). */
  const asked = $derived(
    barGlass.open === "machines" && phone ? null : barGlass.open
  );

  let glass = $state<HTMLElement | null>(null);
  $effect(() => {
    glass = glassElement();
  });
  const placement = $derived(glassPlacement(glass, phone));
  let content = $state<HTMLElement | null>(null);

  /* ── What it shows ─────────────────────────────────────────────────── */
  /** The face standing, and any still fading out (`leaving`). */
  let faces = $state<{ card: Card; leaving: boolean }[]>([
    { card: "caw", leaving: false },
  ]);
  const shown = $derived(faces.find((face) => !face.leaving)?.card ?? "caw");
  /** Each card's own frame: its width, its padding (their components). */
  const FRAME = {
    caw: "caw-pop gap-0",
    machines: "machines-pop w-[min(20rem,calc(100vw-16px))] gap-0",
    jump: "jump-pop gap-0",
  } as const satisfies Record<Card, string>;
  const LABEL = {
    caw: "Needs you",
    machines: "Machines",
    jump: "Jump to",
  } as const satisfies Record<Card, string>;
  /** Where each one puts the focus as it comes in. */
  const FOCUS = {
    caw: "a.cover, button, .empty",
    machines: ".row",
    jump: "input",
  } as const satisfies Record<Card, string>;

  /** Each face's element, and the fade running on it. */
  const faceAt = new Map<Card, HTMLElement>();
  const fades = new WeakMap<HTMLElement, Animation>();
  /** The face about to mount by a swap: whether it fades in. */
  let arriving: { card: Card; fade: boolean } | null = null;

  /** What had the focus before the first card opened. */
  let returnTo: HTMLElement | null = null;
  /** It is closing on a press outside it, or on the glass: the focus stays. */
  let closedOutside = false;
  /** It is folding back into the glass, still drawn. */
  let folding = false;

  function focusIn(card: Card, node: HTMLElement) {
    node.querySelector<HTMLElement>(FOCUS[card])?.focus({
      preventScroll: true,
      // After a press, no ring: a script's focus would draw it.
      ...(barGlass.byPointer && card !== "jump" ? { focusVisible: false } : {}),
    } as FocusOptions);
  }
  /** Focus into a face that came in by a swap; Caw's a task after its frame. */
  function focusSwapped(card: Card, node: HTMLElement) {
    if (card !== "caw") {
      focusIn(card, node);
      return;
    }
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (asked === "caw" && node.isConnected) {
          focusIn(card, node);
        }
      });
    });
  }

  const drop = (card: Card) => {
    faces = faces.filter((face) => face.card !== card);
  };

  /**
   * A face starts to leave: lifted out of the flow where it stands, at the
   * size it is drawn at, and faded out from its drawn opacity; gone once
   * the fade ends. Without a fade it is gone at once.
   */
  function leave(card: Card, fade: boolean) {
    const node = faceAt.get(card);
    if (!(fade && node)) {
      drop(card);
      return;
    }
    const { offsetTop, offsetLeft, offsetWidth, offsetHeight } = node;
    // From the card's trailing side, where it is right-aligned: as the box
    // tweens, its leading edge moves over the face and the face stays put.
    const trailing =
      (node.offsetParent?.clientWidth ?? offsetLeft + offsetWidth) -
      offsetLeft -
      offsetWidth;
    const from = getComputedStyle(node).opacity;
    fades.get(node)?.cancel();
    node.inert = true;
    node.style.position = "absolute";
    node.style.top = `${offsetTop}px`;
    node.style.right = `${trailing}px`;
    node.style.width = `${offsetWidth}px`;
    node.style.height = `${offsetHeight}px`;
    const face = faces.find((one) => one.card === card);
    if (face) {
      face.leaving = true;
    }
    const out = node.animate([{ opacity: from }, { opacity: 0 }], {
      duration: dur("--dur-exit"),
      easing: ease("--ease-out"),
      fill: "forwards",
    });
    fades.set(node, out);
    out.finished
      .then(() => {
        if (fades.get(node) === out) {
          faces = faces.filter((one) => !(one.card === card && one.leaving));
        }
      })
      .catch(() => undefined);
  }

  /** A face still fading out is asked for again: it comes back from there. */
  function comeBack(card: Card, fade: boolean) {
    const node = faceAt.get(card);
    const face = faces.find((one) => one.card === card);
    if (face) {
      face.leaving = false;
    }
    if (!node) {
      return;
    }
    const from = getComputedStyle(node).opacity;
    fades.get(node)?.cancel();
    node.inert = false;
    for (const prop of ["position", "top", "right", "width", "height"]) {
      node.style.removeProperty(prop);
    }
    if (fade) {
      fades.set(
        node,
        node.animate([{ opacity: from }, { opacity: 1 }], {
          duration: dur("--dur-morph"),
          easing: ease("--ease-drawer"),
        })
      );
    }
    focusSwapped(card, node);
  }

  /** The card shows `to` at once, with nothing else in it (it is shut). */
  function settle(to: Card) {
    if (faces.length === 1 && faces[0].card === to && !faces[0].leaving) {
      return;
    }
    arriving = null;
    faces = [{ card: to, leaving: false }];
  }

  /** The card, standing, changes in place to `to`. */
  function swap(to: Card, fade: boolean) {
    for (const face of [...faces]) {
      if (face.card !== to && !face.leaving) {
        leave(face.card, fade);
      }
    }
    if (faces.some((face) => face.card === to)) {
      comeBack(to, fade);
      return;
    }
    arriving = { card: to, fade };
    faces.push({ card: to, leaving: false });
  }

  /** Mounts a face: one that came in by a swap fades in and takes the focus. */
  const mountFace = (card: Card) => (node: HTMLElement) => {
    faceAt.set(card, node);
    const coming = arriving?.card === card ? arriving : null;
    if (coming) {
      arriving = null;
      if (coming.fade) {
        fades.set(
          node,
          node.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: dur("--dur-morph"),
            easing: ease("--ease-drawer"),
          })
        );
      }
      focusSwapped(card, node);
    }
    return () => {
      fades.get(node)?.cancel();
      if (faceAt.get(card) === node) {
        faceAt.delete(card);
      }
    };
  };

  /**
   * Before the page draws the change: the face leaving is read where it is
   * drawn now, before anything about the card has changed.
   */
  let was: Card | null = null;
  function change(from: Card | null, to: Card | null) {
    if (to === null) {
      // Its contents stay until it is back behind the cut (FOLDED).
      folding = from !== null && barGlass.joined;
      return;
    }
    closedOutside = false;
    if (from === to) {
      return;
    }
    barGlass.instant = to === "jump" && !barGlass.byPointer;
    if (from === null && !folding) {
      settle(to);
      return;
    }
    // Opened again while it folds: it turns back and changes as it does.
    folding = false;
    swap(to, !barGlass.instant);
  }
  $effect.pre(() => {
    const to = asked;
    untrack(() => change(was, to));
    was = to;
  });

  // Back behind the cut: Caw's panel is what it holds at rest, so his next
  // open finds it ready.
  $effect(() => {
    const node = content;
    if (!node) {
      return;
    }
    const folded = () => {
      folding = false;
      if (asked === null) {
        settle("caw");
      }
    };
    node.addEventListener(FOLDED, folded);
    return () => node.removeEventListener(FOLDED, folded);
  });

  /* ── The rehearsal ─────────────────────────────────────────────────── */
  /**
   * The card opens and shuts once, unseen, just after the page has loaded:
   * its whole open, placed, drawn down out of the glass with the join armed
   * (`hang`, the box's morph), and folded back, while it is hidden and
   * inert, the focus stays where it is, and the card keeps its join to
   * itself (`rehearsalJoined`, which arms the morph as `barGlass.joined`
   * does): the glass draws none, and a card another page hangs from the
   * glass (the caw-notices bench) keeps the join it set. A first press found all of that cold: a
   * popover's first open (its first placement, its layers' first run) cost
   * a first press 30–45 ms frames, and with the card only placed ahead of
   * it, the first press's frame still took 21–28 ms of WebKit's main thread
   * against 13–15 for every later one (probe-kit webkit-caw); rehearsed
   * whole, 15. A real open while it lasts ends it there: the card shows,
   * and the join it stands in is the glass's.
   */
  let rehearsing = $state(false);
  let rehearsalOpen = $state(false);
  let rehearsalJoined = false;
  let rehearsed = false;
  const endRehearsal = () => {
    if (rehearsalJoined) {
      barGlass.joined = true;
    }
    rehearsalJoined = false;
    rehearsing = false;
    rehearsalOpen = false;
  };
  $effect(() => {
    const node = content;
    if (rehearsed || !node || !glass) {
      return;
    }
    rehearsed = true;
    // Grown out of the glass, it shuts; folded back behind the cut, done.
    const grown = () => {
      rehearsalOpen = false;
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      timer = setTimeout(() => {
        if (asked !== null) {
          return;
        }
        node.addEventListener(GROWN, grown, { once: true });
        node.addEventListener(FOLDED, endRehearsal, { once: true });
        rehearsing = true;
        rehearsalOpen = true;
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      node.removeEventListener(GROWN, grown);
      node.removeEventListener(FOLDED, endRehearsal);
    };
  });
  $effect.pre(() => {
    if (asked !== null && untrack(() => rehearsing)) {
      endRehearsal();
    }
  });

  const close = () => {
    barGlass.open = null;
  };
</script>

<svelte:window
  onkeydowncapture={() => {
    barGlass.byPointer = false;
  }}
  onpointerdowncapture={() => {
    barGlass.byPointer = true;
  }}
/>

<Popover.Root
  bind:open={
    () => asked !== null || rehearsalOpen,
    (value) => {
      if (!value) {
        rehearsalOpen = false;
        close();
      }
    }
  }
>
  <HangCard
    align="end"
    anchor={glass}
    aria-label={LABEL[shown]}
    class={[FRAME[shown], rehearsing && "invisible"]}
    data-glass-card-frame={FRAME[shown]}
    collisionPadding={placement.collisionPadding}
    customAnchor={glass}
    escapeKeydownBehavior={shown === "jump" ? "ignore" : "close"}
    folded={() => barGlass.instant}
    forceMount
    glass
    held={() => barGlass.instant}
    inert={asked === null || rehearsing}
    morphs={{
      width: true,
      // It tweens only standing open (a face swapped in place) or folding
      // back: at once from the keyboard, behind the cut, and while it comes
      // down out of the glass, which is translate alone (motion/hang); what
      // arrives mid-slide (Jump's first answer) lands at once, and the
      // slide, a percentage of the card's own box, follows it.
      still: () =>
        barGlass.instant ||
        !(folding || (content !== null && standsOpen(content))),
    }}
    onCloseAutoFocus={(event) => {
      event.preventDefault();
      if (rehearsing) {
        return;
      }
      // Shut by a press elsewhere, or by a press on the glass that took the
      // focus: it stays where that press put it.
      const pressedGlass =
        document.activeElement instanceof Element &&
        glass?.contains(document.activeElement);
      if (!(closedOutside || pressedGlass) && returnTo?.isConnected) {
        returnTo.focus({ preventScroll: true });
      }
      closedOutside = false;
      returnTo = null;
    }}
    onInteractOutside={(event) => {
      // The glass's own items open, swap or shut it themselves; bits-ui
      // tells of a press on one after its click has already done so.
      if (
        event.target instanceof Element &&
        event.target.closest("[data-bar-group]")
      ) {
        event.preventDefault();
        return;
      }
      closedOutside = true;
    }}
    onOpenAutoFocus={(event) => {
      event.preventDefault();
      // Rehearsed (opened with nothing asked), the focus stays where it is.
      if (asked === null) {
        return;
      }
      // What invoked it, or what invoked the opener that has gone (the
      // phone's sheet hands over its burger, bar-glass `invoker`).
      returnTo =
        barGlass.invoker ??
        (document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null);
      barGlass.invoker = null;
      const card = asked;
      const node = content?.querySelector<HTMLElement>(`[data-face="${card}"]`);
      if (!node) {
        return;
      }
      if (card === "caw" && barGlass.byPointer) {
        // Once it stands open, and in a task after the frame it landed in:
        // taken in the press's own task, the style and layout it forced
        // held back the open's first frame, and taken in the landing's, its
        // last.
        content?.addEventListener(
          GROWN,
          () => {
            setTimeout(() => {
              if (asked === "caw") {
                focusIn(card, node);
              }
            });
          },
          { once: true }
        );
        return;
      }
      focusIn(card, node);
    }}
    side="bottom"
    sideOffset={placement.sideOffset}
    strategy="fixed"
    trapFocus={false}
    bind:joined={
      () => barGlass.joined,
      (joined) => {
        if (rehearsing) {
          rehearsalJoined = joined;
        } else {
          barGlass.joined = joined;
        }
      }
    }
    bind:ref={content}
  >
    {#each faces as one (one.card)}
      <div
        data-slot="glass-face"
        class="glass-face"
        data-face={one.card}
        {@attach mountFace(one.card)}
      >
        {#if one.card === "caw"}
          <CawPanel feed={liveFeed} onchoose={close} quiet={cawQuiet()} />
        {:else if one.card === "machines"}
          <MachinesList onleave={close} />
        {:else}
          <FinderCard onclose={close} {phone} />
        {/if}
      </div>
    {/each}
  </HangCard>
</Popover.Root>

<style>
  /* One card's contents, as they stood straight in the card: a column that
     gives its own scroller (Caw's list, Jump's results) the card's bounds.
     As wide as the card, and standing on its trailing edge: while the box
     tweens (motion/morph holds the face at its own width) the card's
     leading edge moves over it and clips it, and its rows never rewrap. */
  .glass-face {
    display: flex;
    min-block-size: 0;
    flex: 1 1 auto;
    flex-direction: column;
    align-self: flex-end;
    inline-size: 100%;
    border-radius: inherit;
  }
</style>
