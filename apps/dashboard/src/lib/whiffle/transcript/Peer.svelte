<script lang="ts">
  import {
    IconAskDuo,
    IconHandoffDuo,
    IconReportDuo,
    IconReportFailedDuo,
    IconRuleDuo,
    IconWorkflow,
  } from "$lib/icons";
  import { whiffle } from "../client.svelte";
  import { conversationHref, resolveInstanceId } from "../links";
  /**
   * What whiffle put into this session on someone else's behalf: a rule that
   * fired, a delegate's report or ask, another session's hand-off, a
   * workflow's brief or notice.
   * Never the reader's own words, so none of them is a turn. They share one
   * system row on the rail — a labelled line with the kind's glyph, then the
   * body — the same register as every other note the transcript carries.
   */
  import type { Message } from "../types";
  import MessageBody from "./MessageBody.svelte";

  let { message }: { message: Message } = $props();

  const meta = $derived(message.metadata ?? {});
  /** Which kind of row this is, the words it leads with, and whether it failed. */
  const row = $derived.by(() => {
    if (message.type === "user.rule") {
      return {
        kind: "rule",
        lead: "Rule ·",
        name: meta.ruleName ?? "",
        failed: false,
      };
    }
    if (message.type === "user.delegate_ask") {
      return {
        kind: "ask",
        lead: "Ask from",
        name: meta.askLabel ?? "",
        failed: false,
      };
    }
    if (meta.reportKind) {
      return {
        kind: "report",
        lead: "Report from",
        name: meta.peerName ?? "",
        failed: meta.reportKind === "failed",
      };
    }
    if (meta.workflowEvent !== undefined) {
      return {
        kind: "workflow",
        lead: "Workflow ·",
        name: `${meta.peerName ?? ""} · ${meta.workflowEvent}`,
        failed: meta.workflowEvent.endsWith("failed"),
      };
    }
    return {
      kind: "handoff",
      lead: "Hand-off from",
      name: meta.peerName ?? "",
      failed: false,
    };
  });

  /** A report's delegate, linked where the fleet still has its row. */
  const senderId = $derived(
    row.kind === "report"
      ? resolveInstanceId(meta.peerSession, whiffle.instanceIndex)
      : undefined
  );
</script>

<div class="sysrow" class:err={row.failed}>
  <p class="label">
    <span class="glyph">
      {#if row.kind === 'rule'}
        <IconRuleDuo />
      {:else if row.kind === 'ask'}
        <IconAskDuo />
      {:else if row.kind === 'report' && row.failed}
        <IconReportFailedDuo />
      {:else if row.kind === 'report'}
        <IconReportDuo />
      {:else if row.kind === 'workflow'}
        <IconWorkflow />
      {:else}
        <IconHandoffDuo />
      {/if}
    </span>
    <span class="text">
      {row.lead}
      {#if senderId}
        <a class="name" href={conversationHref(senderId, whiffle.instanceIndex)}
          >{row.name}</a
        >
      {:else}
        <span class="name">{row.name}</span>
      {/if}
    </span>
    {#if row.kind === 'report' && row.failed}
      <span class="state">failed</span>
    {/if}
  </p>
  <div class="body"><MessageBody source={message.content} /></div>
</div>

<style>
  /* The rail note every other system line uses (SystemLine `.note`): same
     inset, same 2px rail, same muted small label. */
  .sysrow {
    margin: var(--rail-gap, var(--space-4)) 0 0 var(--space-2);
    padding-left: var(--space-3);
    background: var(--rail-head, var(--rail)) left top / 2px 100% no-repeat;
  }
  .label {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    margin: 0;
    font-size: var(--text-label);
    line-height: var(--leading-ui);
    color: var(--ink-muted);
  }
  .glyph {
    display: inline-flex;
    flex: 0 0 auto;
    color: var(--accent-text);
  }
  .glyph :global(svg) {
    width: 14px;
    height: 14px;
  }
  /* `clip` rather than `hidden`, with a margin, so the ellipsis still cuts a
     long name while the link's padded hit area is not clipped with it. */
  .text {
    min-width: 0;
    overflow: clip;
    overflow-clip-margin: 4px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .name {
    font-weight: var(--weight-medium);
    color: var(--ink-strong);
  }
  /* Vertical padding on an inline box grows the hit area to the 24px floor
     without moving the line. */
  a.name {
    padding-block: 4px;
    text-decoration: underline;
    text-decoration-color: color-mix(in oklab, currentColor 35%, transparent);
    text-underline-offset: 0.2em;
  }
  @media (hover: hover) and (pointer: fine) {
    a.name:hover {
      color: var(--accent-text);
    }
  }
  @media (hover: hover) and (pointer: fine) and (
      prefers-reduced-motion: no-preference
    ) {
    a.name {
      transition: color var(--dur-control) var(--ease-out);
    }
  }
  /* A failed report says so in words and in the one colour the rail allows. */
  .sysrow.err .glyph,
  .state {
    color: var(--status-fail-ink);
  }
  .state {
    flex: 0 0 auto;
  }
  .body {
    margin-top: var(--space-2);
  }
  /* Same narrow-rail inset drop as SystemLine's notes. */
  @media (max-width: 900px) {
    .sysrow {
      margin-left: 0;
    }
  }
</style>
