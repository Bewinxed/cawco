<script lang="ts">
  /**
   * The pairing screen as drawn, from its stage (hub-auth `PairingStage`);
   * PairingScreen feeds it the browser's own. In the shape of the empty
   * fleet (MachinesEmpty): Caw at 80px over a title and one line, then the
   * QR a paired iPhone or iPad scans, the code's six cells under it at the
   * QR's width for the person to match by eye instead (RFC 8628 §5.4), and
   * a foot saying how long the code has left, or offering to start again
   * (round-2 design §3e).
   *
   * Every part has one place, the same in every state, so nothing on
   * screen moves or is cut as the stage changes: the words and the foot
   * each swap in a cell as tall as the tallest thing it ever holds
   * (Swap), the QR card stays and only its code comes and goes, and the
   * cells change their letters. Each change is a transitions-dev recipe in
   * the house's tokens: Text states swap for words, Skeleton loader and
   * reveal for the QR, Number pop-in for the code and the countdown, Success
   * check for approval, Error state shake for a denial.
   */
  import { untrack } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { Button } from "#lib/components/ui/button/index.js";
  import Caw from "../home/Caw.svelte";
  import type { PairingStage } from "../hub-auth.svelte";
  import { dur } from "../motion/curves.svelte";
  import TaskRing from "../TaskRing.svelte";
  import OtpCells, { type OtpArrival, type OtpTone } from "./OtpCells.svelte";
  import PairingQr, { type QrState } from "./PairingQr.svelte";
  import SuccessCheck from "./SuccessCheck.svelte";
  import Swap from "./Swap.svelte";

  let {
    stage,
    now,
    payload,
    arrive = "pop",
    leaving = false,
    onstart,
    onheld,
    onchangehub,
    watch,
  }: {
    stage: PairingStage;
    /** The time the countdown reads, a second at a time (motion/clock). */
    now: number;
    /** The code's QR text: its `verificationUriComplete` (core `PairingStart`). */
    payload: string | null;
    arrive?: OtpArrival;
    /** Approved and held: the screen leaves (T4). */
    leaving?: boolean;
    onstart: () => void;
    /** Approved, once the moment has been held for dur-hold. */
    onheld?: () => void;
    /** Change hub, where there is another hub to go to (the app's). */
    onchangehub?: () => void;
    /** Its clock's watch: the clock runs while the screen is on show. */
    watch?: Attachment<Element>;
  } = $props();

  /** Caw's side, as on the empty fleet. */
  const CAW_SIZE = 80;
  /** A code lives ten minutes (hub hub-auth.ts): the ring is full at ten. */
  const LIFE = 10 * 60_000;
  /** Under a minute left, the countdown takes the warn hue. */
  const LAST_MINUTE = 60_000;

  type Words = "pair" | "denied" | "expired" | "failed";
  type Foot = "asking" | "waiting" | "approved" | "start";
  const WORDS: Words[] = ["pair", "denied", "expired", "failed"];
  const FOOT: Foot[] = ["asking", "waiting", "approved", "start"];

  const kind = $derived(stage.kind === "idle" ? "asking" : stage.kind);
  const code = $derived("userCode" in stage ? stage.userCode : null);
  const answered = $derived(
    kind === "denied" || kind === "expired" || kind === "failed"
  );
  const tone = $derived.by((): OtpTone => {
    switch (kind) {
      case "asking":
        return "skeleton";
      case "approved":
        return "done";
      case "denied":
        return "fail";
      case "expired":
        return "stale";
      case "failed":
        return "empty";
      default:
        return "code";
    }
  });
  const qr = $derived.by((): QrState => {
    if (kind === "asking") {
      return "loading";
    }
    // Approved, the code stands through its hold: the screen leaves next.
    return kind === "waiting" || kind === "approved" ? "code" : "gone";
  });
  const words = $derived<Words>(answered ? (kind as Words) : "pair");
  const foot = $derived<Foot>(
    answered ? "start" : (kind as Exclude<Foot, "start">)
  );

  /** The hub's words for a pairing that didn't start, kept for the cell's size. */
  let refused = $state("");
  $effect(() => {
    if (stage.kind === "failed") {
      refused = stage.message;
    }
  });

  /* The time left, held where it stopped once the code no longer waits. */
  let lastLeft = 0;
  const left = $derived.by(() => {
    if (stage.kind === "waiting") {
      lastLeft = Math.max(0, stage.expiresAt - now);
    }
    return lastLeft;
  });
  /** m:ss, a character a box, so only what changed pops in. */
  const figure = $derived.by(() => {
    const seconds = Math.ceil(left / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  });

  /* The ring draws from 12 o'clock to its share as the code arrives (T2). */
  let drawn = $state(false);
  $effect(() => {
    if (kind !== "waiting") {
      drawn = false;
      return;
    }
    const frame = requestAnimationFrame(() => {
      drawn = true;
    });
    return () => cancelAnimationFrame(frame);
  });

  /* Denied: the cells shake as the fail ink lands (T5). */
  let shakes = $state(0);
  let was: string | null = null;
  $effect(() => {
    if (was === "waiting" && kind === "denied") {
      untrack(() => {
        shakes += 1;
      });
    }
    was = kind;
  });

  /* Approved: the moment is held for dur-hold, then the screen may go. */
  $effect(() => {
    if (kind !== "approved" || !onheld) {
      return;
    }
    const held = onheld;
    const timer = setTimeout(held, dur("--dur-hold"));
    return () => clearTimeout(timer);
  });

  let starting = $state(false);
  $effect(() => {
    if (!answered) {
      starting = false;
    }
  });
  function start(): void {
    starting = true;
    onstart();
  }
</script>

<main
  data-slot="pairing"
  class="pairing"
  data-leaving={leaving || undefined}
  {@attach watch}
>
  <div data-slot="caw-80" class="caw-80">
    <Caw next={["ready", "idle"]} size={CAW_SIZE} status="idle" />
  </div>
  <div data-slot="body" class="body">
    <div data-slot="words" class="words-cell">
      <Swap all={WORDS} value={words}>
        {#snippet children(one)}
          <span class="words">
            {#if one === "denied"}
              <span data-slot="title" class="title">Pairing was denied</span>
              <span class="line">
                A paired device denied this browser. If that was a mistake,
                start again and approve the new code.
              </span>
            {:else if one === "expired"}
              <span data-slot="title" class="title">The code expired</span>
              <span class="line">
                Nobody approved it within 10 minutes. Start again for a new
                code.
              </span>
            {:else if one === "failed"}
              <span data-slot="title" class="title">Pairing didn't start</span>
              <span class="line refused" role="alert"
                >The hub refused to start pairing. {refused}</span
              >
            {:else}
              <span data-slot="title" class="title">Pair this browser</span>
              <span class="line">
                This hub requires paired devices. Scan this with the CawCo app
                on a paired iPhone or iPad, or approve the code in Needs you or
                Configure › Devices.
              </span>
            {/if}
          </span>
        {/snippet}
      </Swap>
    </div>

    <!-- The code, as a QR and as letters, and its countdown: one group. -->
    <div data-slot="code" class="code">
      <PairingQr
        payload={kind === "asking" || kind === "failed" ? null : payload}
        state={qr}
      />

      <div class="cells">
        <OtpCells
          {arrive}
          code={kind === "asking" ? null : code}
          shake={shakes}
          {tone}
        />
      </div>

      <div aria-live="polite" class="foot">
        <Swap all={FOOT} value={foot}>
          {#snippet children(one)}
            {#if one === "start"}
              <Button
                label="Start pairing"
                onclick={start}
                pending={starting}
                pendingLabel="Starting…"
              />
            {:else}
              <span
                class="caption mark-line"
                data-warn={one === "waiting" && left < LAST_MINUTE
                  ? ""
                  : undefined}
              >
                {#if one === "waiting"}
                  <span class="dial" data-box
                    ><TaskRing
                      done={drawn ? left : 0}
                      size="sm"
                      total={LIFE}
                    /></span
                  >
                  <span
                    >Waiting for approval… The code expires in <span
                      class="figure mono-figure"
                      >{#each figure.split("") as one, at (at)}<span
                          class="digit">{one}</span
                        >{/each}</span
                    ></span
                  >
                {:else if one === "approved"}
                  <span class="dial done" data-box><SuccessCheck /></span>
                  <span>Approved.</span>
                {:else}
                  <span>Asking the hub for a code…</span>
                {/if}
              </span>
            {/if}
          {/snippet}
        </Swap>
      </div>
    </div>

    {#if onchangehub}
      <Button class="change" onclick={onchangehub} size="sm" variant="link"
        >Change hub</Button
      >
    {/if}
  </div>
</main>

<style>
  .pairing {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    min-block-size: 100dvh;
    padding: var(--space-8) var(--space-5);
    background: var(--background);
    transition:
      opacity var(--dur-fade) var(--ease-out),
      scale var(--dur-fade) var(--ease-out);
  }
  /* Approved and held: the screen leaves as Caw does, the app arriving. */
  .pairing[data-leaving] {
    opacity: 0;
    scale: var(--leave-scale);
  }
  .caw-80 {
    display: grid;
    place-items: center;
    min-block-size: 80px;
  }
  /* One column of groups, space-7 apart: the words, the code (its QR, its
     letters and its countdown, space-3 apart), Change hub. Between groups
     is more than twice the space within one. */
  .body {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-7);
    inline-size: 100%;
    max-inline-size: 34rem;
  }
  .words-cell,
  .code {
    inline-size: 100%;
  }
  .code {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
  }
  .words {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    min-inline-size: 0;
  }
  .words > * {
    max-inline-size: 100%;
  }
  /* The hub's words, whole, in the fail ink. */
  .refused {
    color: var(--status-fail-ink);
    overflow-wrap: anywhere;
  }
  .title {
    margin: 0;
    font: var(--type-title);
    letter-spacing: var(--track-title);
    color: var(--ink-strong);
    text-align: center;
    text-wrap: balance;
  }
  .line {
    margin: 0;
    max-inline-size: 26rem;
    font: var(--type-body);
    color: var(--ink-muted);
    text-align: center;
    text-wrap: pretty;
  }
  .cells {
    inline-size: 100%;
  }
  /* The foot: the countdown, the approval or Start pairing, centred in a
     place as tall as the tallest of them. */
  .foot {
    display: grid;
    justify-items: center;
    inline-size: 100%;
  }
  .foot :global(.swap > span) {
    align-self: center;
    justify-self: center;
  }
  .caption {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: var(--space-2);
    font: var(--type-meta);
    color: var(--ink-muted);
    text-align: center;
    text-wrap: pretty;
  }
  /* The ring and the figure: muted, and the warn hue under a minute (T3). */
  .dial,
  .figure {
    color: var(--ink-muted);
    transition: color var(--dur-panel) var(--ease-out);
  }
  .dial {
    display: inline-flex;
    align-self: center;
  }
  .dial.done {
    color: var(--status-done-ink);
  }
  .figure {
    white-space: nowrap;
  }
  [data-warn] .dial,
  [data-warn] .figure {
    color: var(--data-warn);
  }
  /* A clock: every character its own 1ch box, changed in place each
     second with nothing animating on a tick (motion/clock), so no digit
     ever moves another. */
  .digit {
    display: inline-block;
    inline-size: 1ch;
    text-align: center;
  }
  @media (prefers-reduced-motion: reduce) {
    .pairing[data-leaving] {
      scale: 1;
    }
  }
</style>
