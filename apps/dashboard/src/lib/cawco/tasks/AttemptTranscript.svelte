<script lang="ts">
  /**
   * An attempt's transcript in the task sheet: the session's own transcript
   * (Transcript, the session page's, with its padding and columns), in a
   * pane of its own height under the attempt, or — expanded — in a pane
   * beside the task at the sheet's full height (on a phone, over it). Its
   * session's frames are followed while it is shown and its newest page is
   * read, as a delegate's card does when it opens.
   */
  import { untrack } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconExternal, IconMaximize, IconMinimize } from "#lib/icons.js";
  import {
    cawco,
    readTranscript,
    unwatchDelegate,
    watchDelegate,
  } from "../client.svelte";
  import { conversationHref } from "../links";
  import Transcript from "../transcript/Transcript.svelte";

  let {
    instanceId,
    attempt,
    expanded,
    ontoggle,
  }: {
    /** The session the attempt ran in. */
    instanceId: string;
    /** What the attempt is called in the sheet ("Attempt 2"). */
    attempt: string;
    expanded: boolean;
    ontoggle: () => void;
  } = $props();

  $effect(() => {
    const id = instanceId;
    untrack(() => {
      watchDelegate(id);
      // biome-ignore lint/complexity/noVoid: fire-and-forget: the read lands in the store the transcript draws
      void readTranscript(id);
    });
    return () => unwatchDelegate(id);
  });

  const session = $derived(cawco.session(instanceId));
  const row = $derived(cawco.instanceIndex.byId.get(instanceId));
</script>

<section
  aria-label="{attempt}'s transcript"
  class="pane"
  data-expanded={expanded}
  data-task-transcript
>
  <header class="head">
    <div class="words">
      <h4 class="name">Transcript</h4>
      <p class="hint">What {attempt.toLowerCase()}'s session said and did</p>
    </div>
    <div class="acts">
      <Button
        aria-expanded={expanded}
        data-transcript-expand
        icon={expanded ? IconMinimize : IconMaximize}
        label={expanded ? "Collapse transcript" : "Expand transcript"}
        onclick={ontoggle}
        size="sm"
        variant="outline"
      />
      <Button
        href={conversationHref(instanceId, cawco.instanceIndex)}
        icon={IconExternal}
        label="Open session"
        size="sm"
        variant="ghost"
      />
    </div>
  </header>
  <div class="body">
    {#if session}
      <Transcript agentName={row?.harness ?? "Agent"} {session} visible />
    {/if}
  </div>
</section>

<style>
  .pane {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
    /* Under the attempt, a pane of its own height; expanded, the sheet's. */
    block-size: 30rem;
    overflow: hidden;
    border: 1px solid var(--border-well);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
  }
  .pane[data-expanded="true"] {
    block-size: 100%;
    border-radius: 0;
    border-block: 0;
    border-inline-end: 0;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-block-end: 1px solid var(--border-hairline);
  }
  /* Expanded, the head runs under the sheet's close button on a narrow
     screen: it keeps that corner clear, as the sheet's own head does. */
  .pane[data-expanded="true"] .head {
    padding-block-start: var(--space-5);
    padding-inline-end: var(--space-8);
  }
  .words {
    flex: 1 1 12rem;
    min-inline-size: 0;
  }
  .name {
    margin: 0;
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .hint {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .body {
    position: relative;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-block-size: 0;
  }
</style>
