<script lang="ts" module>
  import type { PairingStage } from "../hub-auth.svelte";

  /**
   * The screen's stage: the hub's (hub-auth `PairingStage`), and the moment
   * a paired phone has scanned the key and its person is deciding.
   */
  export type PanelStage =
    | PairingStage
    | {
        kind: "checking";
        expiresAt: number;
        userCode: string;
        verificationUriComplete: string;
      };
  /** How an approved key leaves: swallowed by the head, or flown up to Caw. */
  export type ApprovedTake = "swallow" | "fly";
  /** What an expired key leaves: a fresh one shuffling in, or New code. */
  export type ExpiredTake = "refresh" | "park";
</script>

<script lang="ts">
  /**
   * The pairing screen. One idea: the code is the key, Caw minds the door,
   * and every state is the key doing something.
   *
   * ANIMATION STORYBOARD (each beat in the house's tokens)
   *
   *   asking     the key's card and its six boxes stand as skeletons;
   *              Caw is loading
   *   arrive     the dots shuffle and lock (PairingQr) while the letters
   *              type in on the same beat; then the key waits
   *   waiting    a light sweeps the card's edge and the dots glint under
   *              it; no countdown until the last minute, when it appears
   *              and the light warms; Caw is ready
   *   checking   (the phone scanned it) the light stops, the key steps
   *              back, the letters pulse, the line asks to compare; Caw
   *              points to them (needs-you)
   *   approved   the key pours into the head (or flies up to Caw), Caw
   *              plays done, the card folds away (morph), and the
   *              dashboard opens: the screen never sits here
   *   denied     the dots burst and fall, the head squeezes and shakes,
   *              the letters fall, the key and its boxes close up (morph):
   *              "Your phone said no", Start again; Caw pleads (needs-you)
   *   expired    quiet: the dots drain from the edges in, the letters
   *              fall, the place closes; a fresh key shuffles straight in
   *              while the page is seen, or New code waits (the take)
   *   failed     no key and no boxes: Caw (needs-you), why in one line,
   *              Try again, and the hub's own words under Show details
   *
   * Every place opens and closes through morph(), so what is under it moves
   * with it and nothing jumps. Without motion, every beat is a fade.
   */
  import { untrack } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { Button } from "#lib/components/ui/button/index.js";
  import Caw, { type CawStatus } from "../home/Caw.svelte";
  import { dur } from "../motion/curves.svelte";
  import { morph } from "../motion/morph.svelte";
  import OtpCells, { type OtpTone } from "./OtpCells.svelte";
  import PairingQr, { type QrAct, type QrWait } from "./PairingQr.svelte";
  import SuccessCheck from "./SuccessCheck.svelte";
  import Swap from "./Swap.svelte";

  let {
    stage,
    now,
    payload,
    leaving = false,
    wait = "sweep",
    approved = "swallow",
    expired = "park",
    caw = true,
    onstart,
    onheld,
    onchangehub,
    watch,
  }: {
    stage: PanelStage;
    /** The time the countdown reads, a second at a time (motion/clock). */
    now: number;
    /** The key's text: its `verificationUriComplete` (core `PairingStart`). */
    payload: string | null;
    /** Approved: the screen leaves and the dashboard opens. */
    leaving?: boolean;
    wait?: QrWait;
    approved?: ApprovedTake;
    expired?: ExpiredTake;
    /** Caw over the words; off where a sheet shows the key alone. */
    caw?: boolean;
    onstart: () => void;
    /** Approved, once the key has gone and Caw has said so. */
    onheld?: () => void;
    /** Change hub, where there is another hub to go to (the app's). */
    onchangehub?: () => void;
    /** Its clock's watch: the clock runs while the screen is on show. */
    watch?: Attachment<Element>;
  } = $props();

  /** Caw's side, as on the empty fleet. */
  const CAW_SIZE = 80;
  /** Under a minute left, the countdown shows and the light warms. */
  const LAST_MINUTE = 60_000;

  const kind = $derived(stage.kind === "idle" ? "asking" : stage.kind);
  const dead = $derived(kind === "denied" || kind === "expired");
  const code = $derived("userCode" in stage ? stage.userCode : null);
  const left = $derived(
    "expiresAt" in stage ? Math.max(0, stage.expiresAt - now) : 0
  );
  const lastMinute = $derived(kind === "waiting" && left < LAST_MINUTE);

  type Words = "pair" | "check" | "paired" | "denied" | "expired" | "failed";
  const WORDS: Words[] = [
    "pair",
    "check",
    "paired",
    "denied",
    "expired",
    "failed",
  ];
  const words = $derived.by((): Words => {
    switch (kind) {
      case "checking":
        return "check";
      case "approved":
        return "paired";
      case "denied":
      case "expired":
      case "failed":
        return kind;
      default:
        return "pair";
    }
  });
  type Foot =
    "asking" | "quiet" | "clock" | "paired" | "again" | "new" | "retry";
  const FOOT: Foot[] = [
    "asking",
    "quiet",
    "clock",
    "paired",
    "again",
    "new",
    "retry",
  ];
  const foot = $derived.by((): Foot => {
    switch (kind) {
      case "asking":
        return "asking";
      case "waiting":
        return lastMinute ? "clock" : "quiet";
      case "approved":
        return "paired";
      case "denied":
        return "again";
      case "expired":
        return expired === "park" ? "new" : "quiet";
      case "failed":
        return "retry";
      default:
        return "quiet";
    }
  });
  /** Each way out's words: denied, expired (parked) and failed. */
  const WAY_OUT = {
    again: "Start again",
    new: "New code",
    retry: "Try again",
  } as const;
  const figure = $derived.by(() => {
    const seconds = Math.ceil(left / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  });

  /** Why a pairing didn't start, from the hub's answer; its own words under Show details. */
  const why = $derived.by(() => {
    if (stage.kind !== "failed") {
      return "";
    }
    if (stage.status === 409) {
      return "Pairing is off on this hub. Turn it on from a paired device in Configure › Devices.";
    }
    return stage.status === null
      ? "The hub didn't answer. Check that its machine is up and this device is online."
      : "The hub refused to start pairing.";
  });
  let details = $state(false);

  /* ── The beats ─────────────────────────────────────────────────────── */
  /** Where a state comes to rest, as drawn when it is the first thing seen. */
  function rest(state: string): {
    act: QrAct;
    card: boolean;
    cells: boolean;
    status: CawStatus;
  } {
    switch (state) {
      case "waiting":
        return { act: "wait", card: true, cells: true, status: "ready" };
      case "checking":
        return { act: "dim", card: true, cells: true, status: "needs-you" };
      case "approved":
        return { act: "swallow", card: false, cells: true, status: "done" };
      case "denied":
      case "failed":
        return { act: "burst", card: false, cells: false, status: "needs-you" };
      case "expired":
        return { act: "drain", card: false, cells: false, status: "idle" };
      default:
        return { act: "loading", card: true, cells: true, status: "loading" };
    }
  }
  const first = untrack(() => rest(kind));
  let act = $state<QrAct>(first.act);
  let card = $state(first.card);
  let cells = $state(first.cells);
  let falling = $state(false);
  let status = $state<CawStatus>(first.status);

  let was: string | null = null;
  $effect(() => {
    const to = kind;
    const from = was;
    was = to;
    if (from === null || from === to) {
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    const after = (ms: number, step: () => void) =>
      timers.push(setTimeout(step, ms));
    untrack(() => play(from, to, after));
    return () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
    };
  });

  function play(
    from: string,
    to: string,
    after: (ms: number, step: () => void) => void
  ): void {
    const settle = dur("--dur-settle");
    const panel = dur("--dur-panel");
    const pop = dur("--dur-pop");
    const fold = dur("--dur-morph");
    // A dead code's leaving: the dots, then the letters, then the places close.
    const breakUp = (leave: QrAct, then: CawStatus) => {
      act = leave;
      after(panel, () => {
        falling = true;
      });
      after(settle + panel + 5 * dur("--dur-stagger"), () => {
        card = false;
        cells = false;
        after(fold, () => {
          status = then;
          falling = false;
        });
      });
    };
    switch (to) {
      case "asking":
        falling = false;
        card = true;
        cells = true;
        act = "loading";
        status = "loading";
        return;
      case "waiting":
        card = true;
        cells = true;
        act = from === "checking" ? "wait" : "arrive";
        status = "ready";
        after(settle + panel, () => {
          act = "wait";
        });
        return;
      case "checking":
        act = "dim";
        status = "needs-you";
        return;
      case "approved":
        act = approved;
        after(panel, () => {
          status = "done";
        });
        after(panel + pop * 2, () => {
          card = false;
          after(fold + dur("--dur-hold"), () => onheld?.());
        });
        return;
      case "denied":
        breakUp("burst", "needs-you");
        return;
      case "expired":
        breakUp("drain", "idle");
        if (expired === "refresh") {
          after(settle + panel * 2 + 5 * dur("--dur-stagger") + fold, () => {
            if (document.visibilityState === "visible") {
              onstart();
            }
          });
        }
        return;
      case "failed":
        breakUp("drain", "needs-you");
        return;
      default:
        return;
    }
  }

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

  let starting = $state(false);
  $effect(() => {
    if (!(dead || kind === "failed")) {
      starting = false;
    }
  });
  function start(): void {
    starting = true;
    details = false;
    onstart();
  }
</script>

<main
  data-slot="pairing"
  class="pairing"
  data-leaving={leaving || undefined}
  {@attach watch}
>
  {#if caw}
    <div data-slot="caw-80" class="caw-80" data-caw={status}>
      <Caw size={CAW_SIZE} {status} />
    </div>
  {/if}
  <div data-slot="body" class="body">
    <div data-slot="words" class="words-cell">
      <Swap all={WORDS} value={words}>
        {#snippet children(one)}
          <span class="words">
            <span data-slot="title" class="title">
              {#if one === "check"}
                Check these match your phone
              {:else if one === "paired"}
                Paired
              {:else if one === "denied"}
                Your phone said no
              {:else if one === "expired"}
                That code expired
              {:else if one === "failed"}
                Pairing didn't start
              {:else}
                Scan with the CawCo app
              {/if}
            </span>
            {#if one === "failed"}
              <span class="line">{why}</span>
            {/if}
          </span>
        {/snippet}
      </Swap>
    </div>

    <div data-slot="qr-place" class="place" {@attach morph()}>
      {#if card}
        <div class="slot">
          <PairingQr
            {act}
            payload={kind === "asking" || kind === "failed" ? null : payload}
            {wait}
            warm={lastMinute}
          />
        </div>
      {/if}
    </div>

    <div data-slot="cells-place" class="place cells" {@attach morph()}>
      {#if cells}
        <div class="slot">
          <OtpCells
            code={kind === "asking" || kind === "failed" ? null : code}
            {falling}
            pulsing={kind === "checking"}
            {tone}
          />
          <span
            class="route"
            data-shown={kind === "asking" || kind === "waiting" || undefined}
          >
            Or approve it in Needs you, or Configure › Devices.
          </span>
        </div>
      {/if}
    </div>

    <div aria-live="polite" class="foot">
      <Swap all={FOOT} value={foot}>
        {#snippet children(one)}
          {#if one === "again" || one === "new" || one === "retry"}
            <Button
              label={WAY_OUT[one]}
              onclick={start}
              pending={starting}
              pendingLabel="Asking…"
            />
          {:else if one === "clock"}
            <span class="caption"
              >Expires in <span class="figure mono-figure"
                >{#each figure.split("") as char, at (at)}<span class="digit"
                    >{char}</span
                  >{/each}</span
              ></span
            >
          {:else if one === "paired"}
            <span class="caption mark-line"
              ><span class="dial" data-box><SuccessCheck /></span><span
                >Opening your dashboard…</span
              ></span
            >
          {:else if one === "asking"}
            <span class="caption">Asking the hub for a code…</span>
          {:else}
            <span class="caption"> </span>
          {/if}
        {/snippet}
      </Swap>
    </div>

    {#if stage.kind === "failed"}
      <div data-slot="details" class="details" {@attach morph()}>
        <button
          class="disclose"
          aria-expanded={details}
          onclick={() => {
            details = !details;
          }}
          type="button">{details ? "Hide details" : "Show details"}</button
        >
        {#if details}
          <p class="raw">{stage.message}</p>
        {/if}
      </div>
    {/if}

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
  /* The dashboard opening in place: the screen leaves as Caw does. */
  .pairing[data-leaving] {
    opacity: 0;
    scale: var(--leave-scale);
  }
  .caw-80 {
    display: grid;
    place-items: center;
    min-block-size: 80px;
  }
  /* A column of places. A place's room is inside it, so a closed place
     leaves no gap: the words and the foot stand space-7 apart then, as the
     key's places do from them when open. */
  .body {
    display: flex;
    flex-direction: column;
    align-items: center;
    inline-size: 100%;
    max-inline-size: 34rem;
  }
  .words-cell {
    inline-size: 100%;
    padding-block-end: var(--space-7);
  }
  .words {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    min-inline-size: 0;
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
    max-inline-size: 26rem;
    font: var(--type-body);
    color: var(--ink-muted);
    text-align: center;
    text-wrap: pretty;
  }
  .place {
    inline-size: 100%;
  }
  .slot {
    display: grid;
    justify-items: center;
    gap: var(--space-2);
    padding-block-end: var(--space-5);
  }
  /* The other way in, small under the letters while the key waits. */
  .route {
    max-inline-size: var(--c-pair-w);
    font: var(--type-meta);
    color: var(--ink-muted);
    text-align: center;
    text-wrap: pretty;
    opacity: 0;
    transition: opacity var(--dur-fade) var(--ease-out);
  }
  .route[data-shown] {
    opacity: 1;
  }
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
  }
  .figure {
    color: var(--data-warn);
    white-space: nowrap;
  }
  /* A clock: every character its own 1ch box, changed in place each
     second with nothing animating on a tick (motion/clock). */
  .digit {
    display: inline-block;
    inline-size: 1ch;
    text-align: center;
  }
  /* `dial`, not `ring`: Tailwind's `ring` draws a box round it. */
  .dial {
    display: inline-flex;
    align-self: center;
    color: var(--status-done-ink);
  }
  /* Failed: the hub's own words, inline, under the way out. */
  .details {
    display: grid;
    justify-items: center;
    gap: var(--space-2);
    inline-size: 100%;
    padding-block-start: var(--space-3);
  }
  .disclose {
    padding: 0;
    border: 0;
    background: none;
    font: var(--type-meta);
    color: var(--ink-muted);
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }
  .raw {
    max-inline-size: 26rem;
    margin: 0;
    font: var(--type-meta);
    font-family: var(--font-mono);
    color: var(--status-fail-ink);
    text-align: center;
    overflow-wrap: anywhere;
  }
  .body > :global(.change) {
    margin-block-start: var(--space-5);
  }
  @media (prefers-reduced-motion: reduce) {
    .pairing[data-leaving] {
      scale: 1;
    }
  }
</style>
