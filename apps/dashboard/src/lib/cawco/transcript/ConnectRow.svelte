<script lang="ts">
  /**
   * What the transcript keeps of a connect ask once it has settled, where
   * the agent's turn goes on: a rail-led row in the tool rows' own recipe
   * (ToolGroup: the 2px rail, the glyph in the rail cell, the words at the
   * text column), so it reads as one more thing the turn did. Connected
   * says as whom when the hub knows the account, and links to the
   * connection; declined keeps the Other line's words; a connection that
   * later lapsed changes in place to signed out, its Reconnect one press
   * away, so the person never hunts for the ask that made it.
   *
   * The glyph carries the state's hue and the words carry the state, so
   * nothing rides on colour alone. Drawn only by its states files until the
   * hub raises a connect ask (connect-ask.ts).
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconChevronRight, IconKey } from "#lib/icons.js";
  import { type ConnectOutcome, connectWords } from "./connect-ask";

  let {
    outcome,
    onreconnect,
  }: {
    outcome: ConnectOutcome;
    /** Raises the ask again: Reconnect on a lapsed connection's row. */
    onreconnect?: () => void;
  } = $props();

  const said = $derived.by(() => {
    if (outcome.kind === "declined") {
      return connectWords.declined(outcome.service);
    }
    return outcome.account
      ? connectWords.connectedAs(outcome.service, outcome.account)
      : connectWords.connected(outcome.service);
  });
  const MANAGE = "/config/connections";
</script>

<div data-slot="connect-row" data-tx-rail class="rail-row">
  <div
    data-slot="trow"
    data-connect={outcome.kind}
    class="rail-line w-full min-h-(--tx-line) coarse:min-h-(--tx-line-touch) text-size-label font-medium text-ink-strong"
  >
    <span data-slot="rail-cell" class="rail-cell">
      <span
        data-slot="glyph"
        class="col-start-1 row-start-1 grid place-items-center text-ink-muted data-[connect=connected]:text-status-done-glyph data-[connect=expired]:text-status-attn-glyph"
        data-connect={outcome.kind}><IconKey class="size-icon-md block" /></span
      >
    </span>
    <!-- The state line gives way last; the Other line's words after it
         take the room it leaves and end in their ellipsis, their whole text
         in the title. Signed out is the one exception: it is what changed,
         so it keeps its room and the line before it gives way. -->
    <span
      class="flex-initial min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
      >{said}</span
    >
    {#if outcome.kind === "declined" && outcome.words}
      <span
        class="flex-1 min-w-0 overflow-clip text-ellipsis whitespace-nowrap font-normal text-ink-muted"
        title={outcome.words}>“{outcome.words}”</span
      >
    {:else if outcome.kind === "expired"}
      <!-- Signed out is the news: it never gives way; the line before it
           does. -->
      <span class="flex-1 whitespace-nowrap font-normal text-status-attn-ink"
        >· {connectWords.signedOut}</span
      >
    {:else}
      <span class="flex-1" data-box></span>
    {/if}
    {#if outcome.kind === "connected"}
      <Button class="flex-none" data-box href={MANAGE} size="xs" variant="ghost"
        ><span>{connectWords.manage}</span><IconChevronRight /></Button
      >
    {:else if outcome.kind === "expired"}
      <Button
        class="flex-none"
        data-box
        onclick={onreconnect}
        size="xs"
        variant="ghost"
        ><span>{connectWords.reconnect}</span><IconChevronRight /></Button
      >
    {/if}
  </div>
</div>
