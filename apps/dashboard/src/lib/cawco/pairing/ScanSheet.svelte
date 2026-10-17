<script lang="ts" module>
  /**
   * Where a scan stands: the camera looking, a waiting request matched,
   * approved, or a code that matches nothing waiting on this hub.
   */
  export type ScanPhase = "idle" | "matched" | "approved" | "nomatch";
</script>

<script lang="ts">
  /**
   * The app's scanner (round-2 design §3f), drawn in the house's sheet: the
   * camera's square well with its corner marks, then the same six cells the
   * pairing screen shows, then one line saying what the scan found. The
   * well and the cells are c-pair-w wide, their edges on each other's, as
   * the pairing screen's QR and cells are. Opened from Scan code in Needs
   * you's head on an iPhone or iPad; the web gets no scanner, and this
   * drawing is the app's to match.
   *
   * A match fills the cells (pop-in or reel, as the screen's). With `ask`
   * the person then answers in the foot, Deny and Approve at opposite ends;
   * its place is the sheet's from the first frame, so the sheet never
   * changes height. Without it the scan approves at once. Approved, the
   * letters take the done ink and the check arrives (Success check); no
   * match, the fail ink and the shake, then the boxes empty and the camera
   * keeps looking. The line swaps in a cell as tall as its longest words.
   */
  import Close from "#lib/components/icons/Close.svelte";
  import Tick from "#lib/components/icons/Tick.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import OtpCells, { type OtpArrival, type OtpTone } from "./OtpCells.svelte";
  import PairingQr from "./PairingQr.svelte";
  import SuccessCheck from "./SuccessCheck.svelte";
  import Swap from "./Swap.svelte";

  let {
    phase,
    ask,
    code,
    device,
    seen,
    arrive = "pop",
    shake = 0,
    onapprove,
    ondeny,
    onclose,
  }: {
    phase: ScanPhase;
    /** A match shows the code and asks (B), or approves at once (A). */
    ask: boolean;
    /** The code read, while it stands in the cells. */
    code: string | null;
    /** The waiting request it matched: "CawCo on iPad". */
    device: string;
    /** What the camera sees: the other device's QR text. */
    seen: string;
    arrive?: OtpArrival;
    /** Each rise replays the cells' shake. */
    shake?: number;
    onapprove: () => void;
    ondeny: () => void;
    onclose: () => void;
  } = $props();

  const tone = $derived.by((): OtpTone => {
    switch (phase) {
      case "matched":
        return "code";
      case "approved":
        return "done";
      case "nomatch":
        return "fail";
      default:
        return "empty";
    }
  });
  type Said = "looking" | "matched" | "asking" | "approved" | "nomatch";
  const SAID: Said[] = ["looking", "matched", "asking", "approved", "nomatch"];
  const said = $derived.by((): Said => {
    switch (phase) {
      case "matched":
        return ask ? "asking" : "matched";
      case "approved":
        return "approved";
      case "nomatch":
        return "nomatch";
      default:
        return "looking";
    }
  });
  const answering = $derived(ask && phase === "matched");
</script>

<section data-slot="scan-sheet" aria-labelledby="scan-title" class="sheet">
  <span
    aria-hidden="true"
    class="h-1.5 w-[100px] shrink-0 self-center rounded-[var(--radius-pill)] bg-muted"
  ></span>
  <header class="kit-sheet-head mark-line">
    <h2 class="title" id="scan-title">Scan a pairing code</h2>
    <button
      aria-label="Close"
      class="kit-sheet-close touch-hit"
      data-box
      onclick={onclose}
      type="button"><Close aria-hidden="true" /></button
    >
  </header>
  <div data-slot="camera" class="well">
    <div class="view"><PairingQr payload={seen} state="code" /></div>
    <span aria-hidden="true" class="corner"></span>
    <span aria-hidden="true" class="corner"></span>
    <span aria-hidden="true" class="corner"></span>
    <span aria-hidden="true" class="corner"></span>
  </div>
  <OtpCells {arrive} {code} {shake} {tone} />
  <p aria-live="polite" class="meta" data-tone={phase}>
    <Swap all={SAID} value={said}>
      {#snippet children(one)}
        <span class="said mark-line">
          {#if one === "approved"}
            <span class="dial" data-box><SuccessCheck /></span>
            <span>Approved {device}.</span>
          {:else if one === "matched" || one === "asking"}
            <span
              >{device} ·
              <span class="code">{code}</span>{#if one === "asking"}. Approve
                only if it's the code on that device.{/if}</span
            >
          {:else if one === "nomatch"}
            <span
              >No waiting request matches this code. Ask the device to start
              pairing again.</span
            >
          {:else}
            <span>Point the camera at the code on the other device.</span>
          {/if}
        </span>
      {/snippet}
    </Swap>
  </p>
  {#if ask}
    <div class="peers" data-shown={answering || undefined}>
      <Button
        aria-label="Deny {device}, code {code}"
        class="peer deny"
        disabled={!answering}
        icon={Close}
        label="Deny"
        onclick={ondeny}
        size="sm"
        variant="secondary"
      />
      <Button
        aria-label="Approve {device}, code {code}"
        class="peer approve"
        disabled={!answering}
        icon={Tick}
        label="Approve"
        onclick={onapprove}
        size="sm"
        variant="secondary"
      />
    </div>
  {/if}
</section>

<style>
  /* The kit's bottom sheet (ui/drawer): the raised surface, its hairline
     along the top edge, its top corners rounded, the grabber over its head. */
  .sheet {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-4) var(--space-5);
    border-block-start: 1px solid var(--border);
    border-start-start-radius: var(--radius-lg);
    border-start-end-radius: var(--radius-lg);
    background: var(--surface-raised);
    color: var(--ink-strong);
  }
  /* The head on the column's edges, the well's and the cells'. */
  .kit-sheet-head {
    inline-size: var(--c-pair-w);
    max-inline-size: 100%;
    padding-block-end: 0;
  }
  .title {
    margin: 0;
    font: var(--type-title);
    letter-spacing: var(--track-title);
  }
  /* The camera: a square well c-pair-w wide, its edges on the cells', the
     corner marks of the canvas's grip standing in from each corner. Here,
     what it sees is the other device's QR. */
  .well {
    position: relative;
    display: grid;
    /* A definite track, so the view's share is of the well, not of the QR. */
    grid-template: minmax(0, 1fr) / minmax(0, 1fr);
    place-items: center;
    box-sizing: border-box;
    inline-size: var(--c-pair-w);
    max-inline-size: 100%;
    aspect-ratio: 1;
    border-radius: var(--radius-lg);
    background: var(--surface-recess);
    overflow: hidden;
  }
  /* The other device's QR at a camera's distance: below its own width
     (min-inline-size 0, or a grid item stays as wide as its content). */
  .view {
    inline-size: 64%;
    min-inline-size: 0;
  }
  .corner {
    position: absolute;
    inline-size: calc(var(--c-corner-grip-leg) * 2);
    block-size: calc(var(--c-corner-grip-leg) * 2);
    border: 0 solid var(--border-control);
  }
  .corner:nth-of-type(1) {
    inset-block-start: calc(var(--c-corner-grip-inset) * 4);
    inset-inline-start: calc(var(--c-corner-grip-inset) * 4);
    border-block-start-width: var(--c-corner-grip-stroke);
    border-inline-start-width: var(--c-corner-grip-stroke);
  }
  .corner:nth-of-type(2) {
    inset-block-start: calc(var(--c-corner-grip-inset) * 4);
    inset-inline-end: calc(var(--c-corner-grip-inset) * 4);
    border-block-start-width: var(--c-corner-grip-stroke);
    border-inline-end-width: var(--c-corner-grip-stroke);
  }
  .corner:nth-of-type(3) {
    inset-block-end: calc(var(--c-corner-grip-inset) * 4);
    inset-inline-start: calc(var(--c-corner-grip-inset) * 4);
    border-block-end-width: var(--c-corner-grip-stroke);
    border-inline-start-width: var(--c-corner-grip-stroke);
  }
  .corner:nth-of-type(4) {
    inset-block-end: calc(var(--c-corner-grip-inset) * 4);
    inset-inline-end: calc(var(--c-corner-grip-inset) * 4);
    border-block-end-width: var(--c-corner-grip-stroke);
    border-inline-end-width: var(--c-corner-grip-stroke);
  }
  .meta {
    display: grid;
    inline-size: var(--c-pair-w);
    max-inline-size: 100%;
    margin: 0;
    font: var(--type-meta);
    color: var(--ink-muted);
    text-align: center;
    text-wrap: pretty;
    transition: color var(--dur-morph) var(--ease-out);
  }
  .meta[data-tone="nomatch"] {
    color: var(--status-fail-ink);
  }
  .said {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: var(--space-2);
  }
  /* `dial`, not `ring`: Tailwind's `ring` draws a box round it. */
  .dial {
    display: inline-flex;
    align-self: center;
    color: var(--status-done-ink);
  }
  .code {
    font-family: var(--font-mono);
    color: var(--ink-strong);
  }
  /* B: Deny at the start, Approve at the end, the same size, each tinted by
     what it does (the Needs you row's peers, apart). Their place is kept
     from the first frame; they fade in once a match asks. */
  .peers {
    display: flex;
    justify-content: space-between;
    gap: var(--space-4);
    inline-size: var(--c-pair-w);
    max-inline-size: 100%;
    opacity: 0;
    transition: opacity var(--dur-pop) var(--ease-out);
  }
  .peers[data-shown] {
    opacity: 1;
  }
  .peers > :global(.peer) {
    border-color: transparent;
  }
  .peers > :global(.deny),
  .peers > :global(.deny:hover) {
    background: var(--status-fail-bg);
    color: var(--status-fail-ink);
  }
  .peers > :global(.approve),
  .peers > :global(.approve:hover) {
    background: var(--status-done-bg);
    color: var(--status-done-ink);
  }
</style>
