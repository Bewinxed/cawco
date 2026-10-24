<script lang="ts">
  /**
   * What the transcript keeps of a connect ask once it has settled, where
   * the agent's turn goes on: a row in the tool rows' own recipe (ToolGroup:
   * the 2px rail, the glyph in the rail cell, the words at the text column,
   * the muted mono tail), so it reads as one more thing the turn did.
   * Connected says as whom and with what access; a kept account used says
   * whose it is; declined keeps the Other line's words; a connection that
   * later lapsed changes in place to sign-in expired. Its tail is the MCP
   * server's name, which opens the MCP page, where it is disconnected.
   *
   * The glyph carries the state's hue and the words carry the state, so
   * nothing rides on colour alone. Drawn only by its states files until the
   * hub raises a connect ask (connect-ask.ts).
   */
  import { IconChevronRight, IconKey, IconMinusCircle } from "#lib/icons.js";
  import { type ConnectOutcome, connectWords } from "./connect-ask";

  let { outcome }: { outcome: ConnectOutcome } = $props();

  const said = $derived.by(() => {
    switch (outcome.kind) {
      case "declined":
        return connectWords.recordDeclined(outcome.service);
      case "expired":
        return outcome.as
          ? `${outcome.service} · ${outcome.as}`
          : outcome.service;
      case "connected":
        return outcome.used && outcome.as
          ? connectWords.recordUsing(outcome.service, outcome.as, outcome.used)
          : connectWords.recordConnected(outcome.service, outcome.as);
    }
  });
  /** What follows the words, quieter: the access, his words, or the lapse. */
  const after = $derived.by(() => {
    switch (outcome.kind) {
      case "declined":
        return outcome.words ? `“${outcome.words}”` : connectWords.notNow;
      case "expired":
        return connectWords.recordExpired;
      case "connected":
        return outcome.scope?.toLowerCase() ?? "";
    }
  });
  const MCP = "/config/mcp";
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
        data-connect={outcome.kind}
        >{#if outcome.kind === "declined"}<IconMinusCircle
            class="size-icon-md block"
          />{:else}<IconKey class="size-icon-md block" />{/if}</span
      >
    </span>
    <!-- The words give way last; what follows them takes the room they
         leave and ends in its ellipsis, its whole text in the title. A
         lapse is the news: it keeps its room, and the words before it give
         way. -->
    <span
      class="flex-initial min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
      title={said}>{said}</span
    >
    {#if after}
      <span
        class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap font-normal data-[connect=expired]:flex-none data-[connect=expired]:text-status-attn-ink text-ink-muted flex-1"
        data-connect={outcome.kind}
        title={after}>· {after}</span
      >
    {:else}
      <span class="flex-1" data-box></span>
    {/if}
    <!-- The tool row's tail: the server's name in the muted mono face, and
         the chevron; it opens the MCP page. -->
    <a
      class="mark-line touch-hit flex-none ms-auto inline-flex items-center gap-space-1 rounded-xs font-(family-name:--font-mono) font-normal text-ink-muted no-underline transition-[color] duration-(--dur-control) ease-out hover:text-ink-strong"
      data-box
      href={MCP}
      title="{outcome.service} on the MCP page"
      ><span>{outcome.server}</span><IconChevronRight
        aria-hidden="true"
        class="size-icon-md block"
        data-box
      /></a
    >
  </div>
</div>
