<script lang="ts">
  /**
   * Where the session's account reached its limit, and what the hub did: a
   * hairline across the column in the compaction divider's place, with one
   * line set in its middle (core `accountMoveWords`): the glyph, the account
   * it went to (or waits on) as its colour dot, and the words. A move wears
   * the transfer glyph; a wait at a limit (a reset still ahead, or Caw off)
   * the at-limit glyph, Usage's, still and in the muted ink: a wait, never a
   * failure. The second line (why it waits, whose limit sent it, when the
   * summary was written) comes in under the pointer or keyboard focus at
   * every width; the line is a button that holds it open, and, for a
   * finger, which has no hover, opens it with what folds under it in one
   * press.
   *
   * A wait counts down to its reset and, once that has passed, says the
   * session went on there; a move counts down to the old account's reset in
   * its second line, as a stop (Caw off) does to its own account's. The
   * clock ticks only while something on the row counts. Accounts on a wait
   * are called as the usage popover's cells call them (core `cellNames`).
   *
   * While the session waits on this line now (`waiting`), the line says
   * itself as a status, and its second line ends on the way out when
   * another account could take it: "Move to design" for the one, "Move to
   * another account" (its list) for more. Pressed open, a wait unfolds every
   * other account as a row, its dot, its name and why it didn't take it.
   *
   * A move that compacts once there says where that stands, the hub saying
   * the line again as it goes: "Moved to B, compacting next", "…
   * compacting", then "Moved to B, then compacted" (or "compaction
   * stopped"). The compaction itself is Claude Code's own, drawn by its own
   * divider after the turns it took.
   *
   * A `continued` line stands between a session's conversation and the
   * fresh one it went on in from a summary, when anything but the person's
   * own Continue asked for it (hub `foldContinued`): one session, the
   * message the fresh conversation opened on folded under the line, which
   * the chevron opens as a compaction's brief opens.
   *
   * A run of account lines with no turn between them is one row (rows.ts
   * `accountRunAt`, core `accountRunWords`): it says where the session is
   * now, by its newest line, and names the move that cost most when an
   * earlier one did; its chevron opens every line under it, in order, in
   * each one's own words, as a brief opens. What the reader opened is kept
   * per session by the row (`disclosureAt`), so a row the list builds again
   * comes back open.
   */
  import {
    type AccountMove,
    accountMoveWords,
    accountRunWords,
    fitsOf,
    heldReasonWords,
    renamedMove,
  } from "@cawco/core";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  // The chevron in Solar's linear cut, a glyph and not a mark (DESIGN.md,
  // The Solar Duotone Rule).
  import {
    IconChevronRight as IconChevron,
    IconRefresh,
    IconTransfer,
  } from "#lib/icons.js";
  import { hueVar } from "../accounts/model.svelte";
  import { asking, heldNames, moveTo } from "../accounts/switch.svelte";
  import type { BoardRow } from "../client.svelte";
  import MessageBody from "../MessageBody.svelte";
  import { unfold } from "../motion/fold.svelte";
  import { disclosureAt } from "./disclosure.svelte";
  import { moveOf, movesOf, type Row } from "./rows";

  let {
    row,
    waiting,
  }: {
    row: Extract<Row, { kind: "account" }>;
    /**
     * The session, while it waits at its account's limit and this is its
     * newest account line: the line is live, a status with its way out;
     * undefined, it is history.
     */
    waiting?: BoardRow;
  } = $props();

  /** Each account as a wait's line calls it. */
  const names = $derived(heldNames());
  /** What the newest line says now: the hub says it again in its place. */
  const move = $derived(renamedMove(moveOf(row), names));
  /** Every line of the run, oldest first, as each says it now. */
  const moves = $derived(movesOf(row).map((one) => renamedMove(one, names)));
  /** The other accounts a lone wait names, and why each didn't take it: they fold under it. */
  const held = $derived(
    moves.length === 1 && move.kind === "waiting" ? (move.accounts ?? []) : []
  );
  /** A run of lines folds them under it; one line folds its brief, or a wait its accounts. */
  const folds = $derived(
    row.brief !== null || moves.length > 1 || held.length > 0
  );

  /** How often a counting row reads the clock: its words are in minutes. */
  const TICK_MS = 15_000;

  let now = $state(Date.now());
  const disclosed = $derived(
    disclosureAt(row.messages[0]?.instanceId ?? "", row.key)
  );
  /** Pressed open: the second line shows at any width, for a finger too, and what folds under it. */
  const open = $derived(disclosed.get());

  /** The moment the row stops counting: the reset it names; null when it names none. */
  const countsTo = $derived.by(() => {
    switch (move.kind) {
      case "waiting":
        return move.until;
      case "moved":
      case "stopped":
        return move.resetsAt;
      case "continued":
      case "ended":
      case "signed-out":
      case "unmoved":
        break;
    }
    return null;
  });

  $effect(() => {
    const until = countsTo;
    if (until === null || Date.now() >= until) {
      return;
    }
    const tick = setInterval(() => {
      now = Date.now();
      if (now >= until) {
        clearInterval(tick);
      }
    }, TICK_MS);
    return () => clearInterval(tick);
  });

  const words = $derived(accountRunWords(moves, now));

  /** It waits at a limit: a reset still ahead, or Caw off. It wears the at-limit glyph. */
  const atLimit = $derived(
    (move.kind === "waiting" && now < move.until) || move.kind === "stopped"
  );
  /** The way out, while the session waits here: the accounts that could take it now. */
  const fits = $derived(waiting && move.kind === "waiting" ? fitsOf(held) : []);

  /** The account a line is drawn in: where it went, the one it waits for, or the one it stayed on. */
  function hueOf(one: AccountMove) {
    switch (one.kind) {
      case "waiting":
      case "stopped":
      case "signed-out":
        return one.account.hue;
      case "unmoved":
        return (one.from ?? one.to)?.hue ?? null;
      // A stop names no account: drawn in the neutral ink, never a failure's.
      case "ended":
        return null;
      case "continued":
      case "moved":
        break;
    }
    return one.to?.hue ?? null;
  }
  const hue = $derived(hueOf(move));

  /**
   * The reader opened it: the transcript lets go of the tail, so the row
   * they pressed holds its place and what folds under it opens downward
   * (Transcript's `onrevealstart`), as a compaction's brief does.
   */
  function opening(event: Event): void {
    event.currentTarget?.dispatchEvent(
      new CustomEvent("revealstart", { bubbles: true })
    );
  }

  /** The way out's text button: the second line's last words, a finger's 44px. */
  const WAY_OUT =
    "touch-hit select-none p-0 border-none border-current bg-transparent font-inherit text-ink-strong underline underline-offset-2 rounded-xs disabled:text-ink-muted";
</script>

<div
  data-open={open || undefined}
  data-waiting={waiting ? true : undefined}
  class="group/move @container mt-space-3 mb-space-1"
  role={waiting ? "status" : undefined}
>
  <!-- A button, so a keyboard and a finger can bring in the second line, as
       a pointer does by hovering. -->
  <button
    aria-expanded={open}
    data-account-run={moves.length > 1 ? moves.length : undefined}
    class="select-none peer/line flex items-center gap-space-3 w-full min-h-c-btn-h-sm p-0 border-none border-current rounded-xs bg-transparent type-meta text-ink-muted focus-inset touch-hit"
    onclick={() => disclosed.set(!open)}
    type="button"
    style:--account={hue ? hueVar(hue) : "var(--ink-muted)"}
  >
    <span class="h-px flex-1 min-w-0 bg-border-control"></span>
    <span
      class="inline-flex items-center gap-space-2 min-w-0 whitespace-nowrap mark-line"
      ><span
        data-slot="mark"
        class="inline-flex items-center gap-space-2"
        data-box
        >{#if atLimit}<IconRefresh
            data-account-move-divider-glyph="limit"
            aria-hidden="true"
            class="flex-none size-space-4 text-ink-muted"
          />{:else}<IconTransfer
            data-account-move-divider-glyph="move"
            aria-hidden="true"
            class="flex-none size-space-4"
          />{/if}
        <span
          data-slot="dot"
          aria-hidden="true"
          class="flex-none size-space-2 rounded-pill bg-(--account)"
        ></span></span
      >
      <span data-slot="words" class="min-w-0 overflow-clip text-ellipsis num"
        >{words.line}</span
      >
      {#if folds}
        <span data-slot="chev" class="inline-flex flex-none" data-box
          ><IconChevron
            aria-hidden="true"
            class="size-icon-sm group-data-open/move:rotate-90 motion-safe:transition-[rotate] motion-safe:duration-(--dur-toggle) motion-safe:ease-in-out"
          /></span
        >
      {/if}</span
    >
    <span class="h-px flex-1 min-w-0 bg-border-control"></span>
  </button>
  <!-- The second line: under the pointer or the keyboard's focus at every
       width, held open by a press. A wait's ends on its way out when
       another account could take it. -->
  <p
    data-slot="detail"
    class="grid grid-rows-shut opacity-0 text-center text-pretty type-meta text-ink-subtle group-data-open/move:grid-rows-open group-data-open/move:opacity-100 peer-focus-visible/line:grid-rows-open peer-focus-visible/line:opacity-100 group-hover/move:grid-rows-open group-hover/move:opacity-100 has-focus-visible:grid-rows-open has-focus-visible:opacity-100 motion-safe:transition-[grid-template-rows,opacity] motion-safe:duration-(--dur-toggle) motion-safe:ease-out"
  >
    <span
      class="fold-item group-data-open/move:overflow-visible has-focus-visible:overflow-visible"
      >{words.detail}{#if waiting && fits.length === 1}
        {@const [one] = fits}
        <span aria-hidden="true">{" · "}</span><button
          data-slot="move-to"
          class={WAY_OUT}
          disabled={asking(waiting)}
          onclick={() => moveTo(waiting, one.account.id)}
          type="button">Move to {one.account.name}</button
        >{:else if waiting && fits.length > 1}
        {@const session = waiting}
        <span aria-hidden="true">{" · "}</span><DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <button
                {...props}
                data-slot="move-to"
                class={WAY_OUT}
                disabled={asking(session)}
                type="button">Move to another account</button
              >
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="center" class="w-auto" side="bottom">
            {#each fits as one (one.account.id)}
              <DropdownMenu.Item
                onSelect={() => moveTo(session, one.account.id)}
              >
                <i
                  data-slot="dot"
                  aria-hidden="true"
                  class="flex-none size-space-2 rounded-pill bg-(--c)"
                  data-box
                  style:--c={hueVar(one.account.hue)}
                ></i>
                <span>{one.account.name}</span>
              </DropdownMenu.Item>
            {/each}
          </DropdownMenu.Content>
        </DropdownMenu.Root>{/if}</span
    >
  </p>
  {#if open && row.brief !== null}
    <div
      data-slot="transcript-brief"
      class="ms-(--x-text) pt-space-1"
      data-state="open"
      onintrostart={opening}
      transition:unfold
    >
      <MessageBody source={row.brief} />
    </div>
  {:else if open && moves.length > 1}
    <!-- Every line of the run, in order, at the text column where a brief
         opens: each in its own words, its account's dot before it, its
         second line under it. -->
    <div
      data-slot="transcript-brief"
      class="ms-(--x-text) pt-space-1"
      data-state="open"
      onintrostart={opening}
      transition:unfold
    >
      <ol data-slot="account-run" class="grid gap-space-2">
        {#each moves as one, at (row.messages[at]?.id ?? at)}
          {@const said = accountMoveWords(one, now)}
          {@const tint = hueOf(one)}
          <li
            data-slot="account-run-line"
            class="type-meta"
            style:--account={tint ? hueVar(tint) : "var(--ink-muted)"}
          >
            <span
              data-slot="words"
              class="block text-ink-muted wrap-anywhere text-pretty num"
              ><span
                aria-hidden="true"
                class="inline-block size-space-2 me-space-2 align-middle rounded-pill bg-(--account)"
              ></span>{said.line}</span
            >
            <span
              data-slot="detail"
              class="block text-ink-subtle wrap-anywhere text-pretty"
              >{said.detail}</span
            >
          </li>
        {/each}
      </ol>
    </div>
  {:else if open && held.length > 0}
    <!-- The other accounts a wait named, one row each at the text column:
         its dot, its name, then why it didn't take the session, or that it
         could. -->
    <div
      data-slot="transcript-brief"
      class="ms-(--x-text) pt-space-1"
      data-state="open"
      onintrostart={opening}
      transition:unfold
    >
      <ol
        data-slot="held-accounts"
        class="grid grid-cols-auto-fluid gap-x-space-4 gap-y-space-2 type-meta"
      >
        {#each held as one (one.account.id)}
          <li
            data-slot="held-account"
            class="grid grid-cols-subgrid col-span-2"
            style:--account={hueVar(one.account.hue)}
          >
            <span data-slot="name" class="min-w-0 text-ink-muted wrap-anywhere"
              ><span
                aria-hidden="true"
                class="inline-block size-space-2 me-space-2 align-middle rounded-pill bg-(--account)"
              ></span>{one.account.name}</span
            >
            <span
              data-slot="reason"
              class="min-w-0 text-ink-subtle wrap-anywhere text-pretty num"
              >{heldReasonWords(one, now)}</span
            >
          </li>
        {/each}
      </ol>
    </div>
  {/if}
</div>
