<script lang="ts">
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Collapsible from "$lib/components/ui/collapsible";
  import {
    IconAsk,
    IconChevronRight,
    IconHandoff,
    IconReport,
    IconReportFailed,
    IconRules,
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
  import { disclosure } from "./disclosure.svelte";
  import MessageBody from "./MessageBody.svelte";

  /** Emphasis, code ticks, heading and quote marks: noise in a one-line glimpse. */
  const MARKUP = /[*_`#>]/g;

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

  /** Open or folded, kept per session by the message, as tool rows are. */
  const disclosed = $derived(disclosure(message));
  const open = $derived(disclosed.get());
  /** What the folded line shows of the body: its first line, bare of markup. */
  const excerpt = $derived(
    message.content
      .split("\n")
      .map((line) => line.replace(MARKUP, "").trim())
      .find(Boolean) ?? ""
  );
</script>

<!-- Sent and not read yet: the same row at reduced presence, saying so,
     until the session reads it and it moves into place. One the session
     will never read says so in words, with why on hover.

     Every one of these arrives folded to its line: what it is, from whom,
     its state, and the first line of what it says. The line is the
     disclosure (the trigger stretches over it; the sender's link stands
     above it), the body opens under it on the tool rows' own reveal, and it
     stays however the reader left it. `data-message` on the outer element
     is what the delegate tray's chip flies onto. -->
<div
  class="sysrow rail-row"
  data-message={message.id}
  class:err={row.failed}
  class:waiting={message.state === 'pending'}
>
  <Collapsible.Root bind:open={disclosed.get, disclosed.set}>
    <p class="label rail-line">
      <span class="glyph rail-cell">
        {#if row.kind === 'rule'}
          <IconRules />
        {:else if row.kind === 'ask'}
          <IconAsk />
        {:else if row.kind === 'report' && row.failed}
          <IconReportFailed />
        {:else if row.kind === 'report'}
          <IconReport />
        {:else if row.kind === 'workflow'}
          <IconWorkflow />
        {:else}
          <IconHandoff />
        {/if}
      </span>
      <span class="text">
        {row.lead}
        {#if senderId}
          <a
            class="name"
            href={conversationHref(senderId, whiffle.instanceIndex)}
            >{row.name}</a
          >
        {:else}
          <span class="name">{row.name}</span>
        {/if}
      </span>
      {#if message.state === 'failed'}
        <span class="state">not sent</span>
      {:else if row.kind === 'report' && row.failed}
        <span class="state">failed</span>
      {:else if message.state === 'pending'}
        <span class="pending">queued</span>
      {:else if meta.urgent}
        <span class="pending">urgent</span>
      {/if}
      {#if !open && excerpt}
        <span class="excerpt">{excerpt}</span>
      {/if}
      <Collapsible.Trigger
        aria-label="{row.lead} {row.name}"
        class="peer-toggle press-tint"
      >
        <span aria-hidden="true" class="chev"><IconChevronRight /></span>
      </Collapsible.Trigger>
    </p>
    {#if message.state === 'failed' && meta.sendFailed}
      <p class="reason rail-hang">{meta.sendFailed}</p>
    {/if}
    <Collapsible.Content reveal>
      <div class="body rail-hang"><MessageBody source={message.content} /></div>
    </Collapsible.Content>
  </Collapsible.Root>
</div>

<style>
  /* The rail row every other system line uses (app.css `.rail-row`), with
     the same muted small label; the body hangs at the text column. The line
     is the disclosure: its trigger's hit area stretches over all of it. */
  .label {
    position: relative;
    min-block-size: 26px;
    margin: 0;
    font: var(--type-label);
    line-height: var(--leading-ui);
    color: var(--ink-muted);
  }
  /* Folded, the first line of what it says, quieter than the label and cut
     to the one line. */
  .excerpt {
    flex: 1 1 0;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: var(--weight-body);
    color: var(--ink-muted);
  }
  /* The trigger is a bits-ui element, so it is addressed globally. Its
     chevron trails the line, as a tool row's does; its ::after is the whole
     line's hit area, and the focus ring. */
  .label :global(.peer-toggle) {
    margin-inline-start: auto;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink-muted);
    cursor: pointer;

    &::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: var(--radius-xs);
    }
    &:focus-visible {
      outline: none;
    }
    &:focus-visible::after {
      outline: var(--focus-ring-width) solid var(--focus-ring);
      outline-offset: var(--focus-ring-inset);
    }
  }
  .chev {
    display: grid;
    place-items: center;

    & :global(svg) {
      inline-size: 16px;
      block-size: 16px;
      display: block;
    }
    @media (prefers-reduced-motion: no-preference) {
      transition: transform var(--dur-control) var(--ease-out);
    }
  }
  :global(.sysrow .peer-toggle[data-state="open"]) .chev {
    transform: rotate(90deg);
  }
  .glyph {
    color: var(--brand-ink);
  }
  .glyph :global(svg) {
    width: 16px;
    height: 16px;
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
    color: var(--ink-strong);
  }
  /* Vertical padding on an inline box grows the hit area to the 24px floor
     without moving the line. */
  /* Above the line's stretched trigger, so the sender stays a link. */
  a.name {
    position: relative;
    z-index: 1;
    padding-block: 4px;
    text-decoration: underline;
    text-decoration-color: color-mix(in oklab, currentColor 35%, transparent);
    text-underline-offset: 0.2em;
  }
  @media (hover: hover) and (pointer: fine) {
    a.name:hover {
      color: var(--brand-ink);
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
  .state,
  .pending {
    flex: 0 0 auto;
  }
  /* Why it did not go, in MessageRow's own reason line. */
  .reason {
    margin-block: var(--space-1) 0;
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    color: var(--status-fail-ink);
  }
  /* MessageRow's queued presence, for the rows whiffle sends. */
  .sysrow.waiting {
    opacity: 0.7;
  }
  .body {
    margin-top: var(--space-2);
  }
</style>
