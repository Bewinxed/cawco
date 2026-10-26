<script lang="ts">
  /**
   * A fleet list with nothing in it yet: its one action asks a new session
   * for one (The Empty Starts Work Rule); with no machine online it says
   * why, and the page's own Add by hand.
   */
  import type { Component } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import EmptyAsk from "../EmptyAsk.svelte";
  import {
    askLabel,
    askNewSession,
    FLEET_ASKS,
    NO_SESSION_CAN_START,
    sessionCanStart,
  } from "../empty-asks";

  let {
    ask,
    icon,
    title,
    line,
    add,
  }: {
    ask: keyof typeof FLEET_ASKS;
    icon: Component;
    title: string;
    line: string;
    /** The way by hand: where it goes, and what it says. */
    add: { href: string; label: string };
  } = $props();
</script>

<EmptyState {icon} {line} {title}>
  {#snippet action()}
    <EmptyAsk
      canStart={sessionCanStart()}
      label={askLabel(FLEET_ASKS[ask].what)}
      onask={(anchor) => askNewSession(FLEET_ASKS[ask].words, anchor)}
      reason={NO_SESSION_CAN_START}
    >
      {#snippet byHand()}
        <Button href={add.href} label={add.label} variant="outline" />
      {/snippet}
    </EmptyAsk>
  {/snippet}
</EmptyState>
