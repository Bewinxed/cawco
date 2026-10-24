<script lang="ts">
  /**
   * What the transcript keeps of a connect ask once it has settled, where
   * the agent's turn goes on: a row in the tool rows' own recipe (ToolGroup:
   * the 2px rail, the glyph in the rail cell, the words at the text column,
   * the muted mono tail), so it reads as one more thing the turn did.
   * Connected says as whom and with what access; not connected keeps the
   * Other line's words; a kept sign-in that later lapsed (the fleet reads
   * the server's sign-in ended) changes it in place to sign-in expired, and
   * back once someone signs in again. Its tail is the MCP server's name,
   * which opens the MCP page. Its words are the call's answer, read back
   * (rows.ts), so every harness's transcript draws it alike.
   *
   * The glyph carries the state's hue and the words carry the state, so
   * nothing rides on colour alone.
   */
  import { accessWords } from "@cawco/core/connect-ask";
  import type { ConnectAnswer } from "@cawco/core/frames";
  import { askWords } from "@cawco/core/words/asks";
  import { IconChevronRight, IconKey, IconMinusCircle } from "#lib/icons.js";
  import { cawco } from "../client.svelte";

  let { answer }: { answer: ConnectAnswer } = $props();

  /** The sign-in it made has since ended without the person. */
  const lapsed = $derived(
    answer.outcome === "connected" &&
      !!(cawco.fleetMcp ?? []).find((one) => one.name === answer.server)?.auth
        ?.ended
  );
  const kind = $derived(lapsed ? "expired" : answer.outcome);

  const said = $derived.by(() => {
    if (answer.outcome === "declined") {
      return askWords.recordNotConnected(answer.server);
    }
    if (lapsed) {
      return answer.server;
    }
    return answer.as
      ? askWords.recordConnectedAs(answer.server, answer.as)
      : askWords.recordConnected(answer.server);
  });
  /** What follows the words, quieter: the access, his words, or the lapse. */
  const after = $derived.by(() => {
    if (answer.outcome === "declined") {
      return answer.words ? `“${answer.words}”` : askWords.notNow;
    }
    if (lapsed) {
      return askWords.recordExpired;
    }
    return answer.access ? accessWords(answer.access) : "";
  });
  const MCP = "/config/mcp";
</script>

<div data-slot="connect-row" data-tx-rail class="rail-row">
  <div
    data-slot="trow"
    data-connect={kind}
    class="rail-line w-full min-h-(--tx-line) coarse:min-h-(--tx-line-touch) text-size-label font-medium text-ink-strong"
  >
    <span data-slot="rail-cell" class="rail-cell">
      <span
        data-slot="glyph"
        class="col-start-1 row-start-1 grid place-items-center text-ink-muted data-[connect=connected]:text-status-done-glyph data-[connect=expired]:text-status-attn-glyph"
        data-connect={kind}
        >{#if kind === "declined"}<IconMinusCircle
            class="size-icon-md block"
          />{:else}<IconKey class="size-icon-md block" />{/if}</span
      >
    </span>
    <!-- His words, after a refusal, give way first: they take the room the
         words before them leave and end in their ellipsis, their whole text
         in the title. The access and a lapse are short and are the news:
         they keep their room, and the words before them (as whom) give
         way. -->
    <span
      class="flex-initial min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
      title={said}>{said}</span
    >
    {#if after}
      <span
        class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap font-normal data-[connect=connected]:flex-none data-[connect=expired]:flex-none data-[connect=expired]:text-status-attn-ink text-ink-muted flex-1"
        data-connect={kind}
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
      title={askWords.recordOnMcpPage(answer.server)}
      ><span>{answer.server}</span><IconChevronRight
        aria-hidden="true"
        class="size-icon-md block"
        data-box
      /></a
    >
  </div>
</div>
