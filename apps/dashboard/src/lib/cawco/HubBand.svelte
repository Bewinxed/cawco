<script lang="ts" module>
  /**
   * What the band says, one state at a time: the only place the dashboard
   * speaks of its hub connection (JOURNEY.md: "a fleet error sits in the
   * connection band that already carries the retry countdown").
   *
   * - `updating`: the hub said it restarts for an update (`hub.restart`),
   *   until the deadline it gave; calm, nothing to press.
   * - `lost`: the socket dropped and the next try is counted down.
   * - `retrying`: a try is out now.
   * - `refused`: this page has never reached the hub; its address shows.
   * - `back`: the hub answered again after the band showed, for --dur-hold.
   * - `older`: the page is on an older wire than the hub's (reload.svelte).
   */
  export type BandState =
    | { kind: "updating"; until: number; version: string | null }
    | { kind: "lost" | "refused" | "retrying" }
    | { kind: "back"; updated: string | null | undefined }
    | { kind: "older"; hold: ReloadHold };

  import type { ReloadHold } from "./reload.svelte";
</script>

<script lang="ts">
  /**
   * The connection band: one strip under the top bar, a row of the page's
   * own column, so it covers none of the page: the page moves down as it
   * opens and back up as it leaves, with it, never jumping (owner: the band
   * hid "No limits yet" under it on a phone). Its row opens from nothing on
   * the band's own clock while the band slides down from under the bar,
   * over --dur-panel on the drawer curve, and both go back up over
   * --dur-exit on ease-out (DESIGN.md, The Fast Exit Rule), as CSS
   * transitions on its own `data-open`, so a socket that blips turns it
   * back from where it is drawn (The Interruptible Rule). With less motion
   * it fades in place. While it leaves it keeps the words it had, so it
   * never empties on its way out. Its words change through MorphText (The
   * Steady Swap Rule), and it is one height in every state at a width (one
   * button's height, two lines on a phone), so a state that follows another
   * moves nothing; a longer sentence (a refused address) grows it through
   * the house morph.
   *
   * Under the drawer's line, where the bar is the phone's one row, the band
   * stands at the top of the screen, over the bar, on every screen
   * (JOURNEY.md: "The connection band persists at the top of the viewport
   * across all mobile surfaces"): where the bar floats over a
   * conversation's tabs, the bar and the tabs move down together under it.
   *
   * The first connection is not a fault: `status` starts `disconnected`, a
   * socket not made yet reads like one that failed, so the band waits for
   * evidence. Disconnected or errored, it shows once an attempt has failed
   * or the grace has run out, and on a page that has never had the hub it
   * holds through every try after; merely connecting on a page that has
   * had the hub, once the grace has run out.
   */
  import { connectionWords } from "@cawco/core";
  import { onMount, untrack } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { browser } from "$app/env";
  import { cawco, hubSocketUrl, reconnectNow } from "./client.svelte";
  import { dur } from "./motion/curves.svelte";
  import { morph } from "./motion/morph.svelte";

  /** Whether this tab has ever had the hub: a drop retries, a first miss is a wrong address. */
  let everConnected = $state(false);
  $effect(() => {
    if (cawco.status === "connected") {
      everConnected = true;
    }
  });

  const CONNECT_GRACE = 4000;
  let graceOver = $state(false);
  onMount(() => {
    const timer = setTimeout(() => {
      graceOver = true;
    }, CONNECT_GRACE);
    return () => clearTimeout(timer);
  });

  /** The socket's fault, once there is evidence of one; null while none. */
  const fault = $derived.by((): "lost" | "refused" | "retrying" | null => {
    const s = cawco.status;
    if (s === "connected") {
      return null;
    }
    // A page that has never had the hub reads every state the same way, so
    // its band stays open through each try (`connectFailed` holds until the
    // hub answers) instead of shutting each time a try goes out.
    const shown =
      s === "disconnected" || s === "error" || !everConnected
        ? cawco.connectFailed || graceOver
        : graceOver;
    if (!shown) {
      return null;
    }
    if (!everConnected) {
      return "refused";
    }
    return s === "connecting" ? "retrying" : "lost";
  });

  /**
   * The hub answered after the band had something to say: "back" stands for
   * --dur-hold. `updated` is the build an announced update went to (null
   * when unnamed); undefined after any other outage.
   */
  let back = $state<{ updated: string | null | undefined } | null>(null);
  let wasDown: { updated: string | null | undefined } | null = null;
  let backTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const connected = cawco.status === "connected";
    const { restart } = cawco;
    const down = !connected && (fault !== null || restart !== null);
    untrack(() => {
      if (down) {
        wasDown = { updated: restart ? restart.version : undefined };
        clearTimeout(backTimer);
        back = null;
      } else if (connected && wasDown) {
        back = wasDown;
        wasDown = null;
        clearTimeout(backTimer);
        backTimer = setTimeout(() => {
          back = null;
        }, dur("--dur-hold"));
      }
    });
  });
  onMount(() => () => clearTimeout(backTimer));

  const band = $derived.by((): BandState | null => {
    if (!browser) {
      return null;
    }
    if (cawco.reloadHold) {
      return { kind: "older", hold: cawco.reloadHold };
    }
    const { restart } = cawco;
    if (restart) {
      return { kind: "updating", ...restart };
    }
    if (fault) {
      return { kind: fault };
    }
    return back ? { kind: "back", updated: back.updated } : null;
  });

  /** The last state shown: the band keeps its words while it leaves. */
  let held = $state<BandState | null>(null);
  /**
   * Each time the band opens from closed: its words start fresh, never
   * morphing from the last time's (a reopened band once showed "Hub
   * reconnected." crossing into the update's words).
   */
  let episode = $state(0);
  let wasOpen = false;
  // Before the DOM is updated, so the frame the band opens on already
  // draws its new words.
  $effect.pre(() => {
    if (band) {
      held = band;
    }
    if (band && !wasOpen) {
      episode += 1;
    }
    wasOpen = band !== null;
  });
  /** What the band draws: its state now, or while it leaves, the last one. */
  const shown = $derived(band ?? held);

  // The countdowns are a clock, not a frame: a quarter second is never seen stuck.
  let now = $state(Date.now());
  $effect(() => {
    if (!band || band.kind === "back" || band.kind === "older") {
      return;
    }
    const timer = setInterval(() => {
      now = Date.now();
    }, 250);
    return () => clearInterval(timer);
  });
  const retryIn = $derived(
    cawco.retryAt ? Math.max(0, Math.ceil((cawco.retryAt - now) / 1000)) : 0
  );
  /** How long an update has left, in whole seconds. */
  const left = (until: number): number =>
    Math.max(0, Math.ceil((until - now) / 1000));

  /** The retry, as the countdown or the try that is out now. */
  const retry = $derived(
    cawco.status === "connecting" || retryIn === 0
      ? "retrying now"
      : `retrying in ${retryIn}s`
  );

  /**
   * A build's name kept on one line: a word joiner (U+2060, zero width and
   * read as nothing) after each hyphen, where a line may otherwise break
   * ("9.9.9-" / "probe"), while the sentence around it still balances.
   */
  const unbroken = (version: string): string =>
    version.replaceAll("-", "-\u2060");

  /** The words a refused page leads with, before the hub's address. */
  const REFUSED = "Can't reach the hub at";

  const words = $derived.by((): string => {
    switch (shown?.kind) {
      case "updating":
        return connectionWords.updating(
          shown.version ? unbroken(shown.version) : null,
          left(shown.until)
        );
      case "lost":
      case "retrying":
        return `Hub unreachable — ${retry}.`;
      case "refused":
        return `— ${retry}.`;
      case "back":
        return shown.updated === undefined
          ? "Hub reconnected."
          : connectionWords.updated(
              shown.updated ? unbroken(shown.updated) : null
            );
      case "older":
        return {
          busy: "CawCo updated — this page has stopped updating. It reloads once you're not using it.",
          unkept:
            "CawCo updated — this page has stopped updating. Reload it to catch up.",
          build:
            "CawCo updated — this page has stopped updating. It reloads when the dashboard serves the new build.",
        }[shown.hold];
      case undefined:
        break;
    }
    return "";
  });

  /** What the band says, plain: its visible words and its live region's. */
  const said = $derived(
    shown?.kind === "refused" ? `${REFUSED} ${hubSocketUrl()} ${words}` : words
  );

  /** Its tint: a fault in the fail or attention pair, the update live, the return done. */
  const tone = $derived.by(() => {
    switch (shown?.kind) {
      case "refused":
        return "fail";
      case "updating":
        return "live";
      case "back":
        return "done";
      case "lost":
      case "older":
      case "retrying":
      case undefined:
        break;
    }
    return "attn";
  });

  const pressable = $derived(
    shown?.kind === "lost" ||
      shown?.kind === "retrying" ||
      shown?.kind === "refused"
  );
</script>

<!-- Its slot is a row of the page's column under the bar, clipped at the
     bar's foot, so the band is uncovered from under the bar and closes back
     into it while the row opens and shuts under it: a row shut until the
     band opens, opening from nothing as the band slides down on the band's
     own clock, so the band's foot and the page's top move as one edge. The
     bar's foot is the band's top edge: it travels up under the bar, and its
     shadow still falls on the page. Under the drawer's line (DRAWER_QUERY)
     it stands at the top of the screen, over the bar: the same place on
     every phone screen. -->
<!-- literal: 0fr, 1fr (the row shut and open); inset(0 -100vw -100vw) (the bar's foot) -->
<div
  data-slot="hub-band-slot"
  class="pointer-events-none relative z-10 grid flex-none grid-rows-(--row-shut) clip-path-(--slot-clip) @container/hub-band has-[>*>[data-open]]:grid-rows-(--row-open) max-desk:-order-1 motion-safe:not-has-[>*>[data-open]]:transition-band-row-shut motion-safe:has-[>*>[data-open]]:transition-band-row-open"
  style:--row-open="1fr"
  style:--row-shut="0fr"
  style:--slot-clip="inset(0 -100vw -100vw)"
>
  <!-- The live region stands from the first markup, so assistive tech has
       it registered before its words change; it says the band's words
       plain, without MorphText's letters (MDN, ARIA live regions: "Establish
       the live region before updating its content"; `status` with a
       redundant `aria-live="polite"`). The band's own words are hidden
       from it, so they are read once. -->
  <p class="sr-only" aria-live="polite" data-hub-band-said role="status">
    {band ? said : ""}
  </p>
  {#if browser}
    <!-- The row's one item: it shuts to nothing, the band drawn whole inside
         it, held up under the bar. -->
    <div data-slot="hub-band-row" class="min-h-0">
      <!-- The sentence and its button on one row, the row at least the
           button's height whether a state has one or not, and two lines tall
           where a phone wraps the sentence: every state is one height at a
           width. -->
      <!-- literal: minmax(0, 1fr) auto (the sentence and its button); minmax(var(--c-btn-h-sm), auto), minmax(max(var(--c-btn-h-sm), 2lh), auto) (the row's height, and on a phone two lines) -->
      <div
        data-slot="hub-band"
        class="pointer-events-auto invisible grid auto-rows-(--band-rows) grid-cols-(--band-cols) items-center gap-x-space-3 border-b border-border-hairline bg-status-attn-bg py-space-2 ps-space-7 pe-space-6 text-size-body font-normal text-status-attn-ink tabular-nums opacity-0 shadow-tile @max-phone/hub-band:auto-rows-(--band-rows-phone) data-open:visible data-open:opacity-100 data-[tone=done]:bg-status-done-bg data-[tone=done]:text-status-done-ink data-[tone=fail]:bg-status-fail-bg data-[tone=fail]:text-status-fail-ink data-[tone=live]:bg-status-live-bg data-[tone=live]:text-status-live-ink motion-reduce:not-data-open:transition-band-hide motion-reduce:data-open:transition-band-show motion-safe:not-data-open:-translate-y-full motion-safe:not-data-open:transition-band-slide-hide motion-safe:data-open:translate-y-0 motion-safe:data-open:transition-band-slide-show"
        aria-hidden={band ? undefined : "true"}
        data-open={band ? "" : undefined}
        data-tone={tone}
        inert={!band}
        style:--band-cols="minmax(0, 1fr) auto"
        style:--band-rows="minmax(var(--c-btn-h-sm), auto)"
        style:--band-rows-phone="minmax(max(var(--c-btn-h-sm), 2lh), auto)"
        {@attach morph()}
      >
        <!-- The sentence morphs as a paragraph (`wrap`): its countdown ticks
             each second, and a morph on one line would fold a phone's two
             lines into one clipped line for every tick. The refused address
             stands inline before it, so that one morphs on its line. The
             sentence takes the room, so the countdown ticking in it never
             moves the button at its end; with no button it takes the row. It
             wraps balanced, never leaving a word or two on a line of their
             own, and a long address breaks rather than spilling. -->
        <p
          data-slot="sentence"
          class="m-0 min-w-0 wrap-anywhere text-balance last:col-span-full"
          aria-hidden="true"
        >
          {#if shown?.kind === "refused"}
            {REFUSED}
            <code class="font-mono text-size-label">{hubSocketUrl()}</code>{" "}
          {/if}{#key episode}<MorphText
              text={words}
              wrap={shown?.kind !== "refused"}
            />{/key}
        </p>
        {#if pressable}
          <!-- Pending in place while an attempt is out, whoever started it. -->
          <Button
            failed={cawco.status !== "connecting"}
            label="Reconnect now"
            onclick={reconnectNow}
            pending={cawco.status === "connecting"}
            pendingLabel="Reconnecting…"
            size="sm"
            variant="outline"
          />
        {/if}
      </div>
    </div>
  {/if}
</div>
