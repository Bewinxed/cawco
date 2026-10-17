<script lang="ts">
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import {
    IconAsk,
    IconChevronRight,
    IconHandoff,
    IconReport,
    IconReportFailed,
    IconRules,
    IconWorkflow,
  } from "#lib/icons.js";
  import { cawco } from "../client.svelte";
  import { conversationHref, resolveInstanceId } from "../links";
  import MessageBody from "../MessageBody.svelte";
  /**
   * What cawco put into this session on someone else's behalf: a rule that
   * fired, a delegate's report or ask, another session's hand-off, a
   * workflow's brief or notice.
   * Never the reader's own words, so none of them is a turn. They share one
   * system row on the rail — a labelled line with the kind's glyph, then the
   * body — the same register as every other note the transcript carries.
   */
  import type { Message } from "../types";
  import { disclosure } from "./disclosure.svelte";

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

  /** A report's delegate or a hand-off's sender, linked where the fleet still has its row. */
  const senderId = $derived(
    row.kind === "report" || row.kind === "handoff"
      ? resolveInstanceId(meta.peerSession, cawco.instanceIndex)
      : undefined
  );

  /** Open or folded, kept per session by the message, as tool rows are. */
  const disclosed = $derived(disclosure(message));
  const open = $derived(disclosed.get());
  /** A delegate report's own short outcome, which the folded line shows whole. */
  const headline = $derived(meta.reportHeadline ?? "");
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
     its state, and a report's headline whole (else the first line of what
     it says). The line is the
     disclosure (the trigger stretches over it; the sender's link stands
     above it), the body opens under it on the tool rows' own reveal, and it
     stays however the reader left it. `data-message` on the outer element
     is what the delegate tray's chip flies onto. -->
<!-- MessageRow's queued presence, for the rows cawco sends; a failed report
     says so in words and in the one colour the rail allows. -->
<div
  data-slot="rail-row"
  class="group/peer rail-row data-waiting:opacity-70"
  data-message={message.id}
  data-err={row.failed || undefined}
  data-waiting={message.state === "pending" || undefined}
>
  <Collapsible.Root bind:open={disclosed.get, disclosed.set}>
    <!-- The rail row every other system line uses (app.css `.rail-row`),
         with the same muted small label; the body hangs at the text column.
         The line is the disclosure: its trigger's hit area stretches over
         all of it. -->
    <!-- literal: 26px -->
    <p
      data-slot="peer-label"
      style:--label-min="26px"
      class="relative min-h-(--label-min) m-0 font-body text-size-label font-medium leading-ui text-ink-muted rail-line"
    >
      <span
        data-rail-cell
        data-slot="glyph"
        class="text-brand-ink group-data-err/peer:text-status-fail-ink rail-cell"
      >
        {#if row.kind === "rule"}
          <IconRules class="size-icon-md" />
        {:else if row.kind === "ask"}
          <IconAsk class="size-icon-md" />
        {:else if row.kind === "report" && row.failed}
          <IconReportFailed class="size-icon-md" />
        {:else if row.kind === "report"}
          <IconReport class="size-icon-md" />
        {:else if row.kind === "workflow"}
          <IconWorkflow class="size-icon-md" />
        {:else}
          <IconHandoff class="size-icon-md" />
        {/if}
      </span>
      <!-- `clip` rather than `hidden`, with a margin, so the ellipsis still
           cuts a long name while the link's padded hit area is not clipped
           with it. The sender's link stands above the line's stretched
           trigger, so it stays a link; vertical padding on an inline box
           grows its hit area to the 24px floor without moving the line.
           literal (the link's underline offset): 0.2em -->
      <span
        data-slot="text"
        class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
      >
        {row.lead}
        {#if senderId}
          <a
            data-slot="name"
            style:--name-offset="0.2em"
            class="text-ink-strong relative z-1 py-space-1 underline decoration-(--link-underline) underline-offset-(--name-offset) hover:text-brand-ink can-hover:motion-safe:transition-[color] can-hover:motion-safe:dur-control can-hover:motion-safe:ease-out"
            href={conversationHref(senderId, cawco.instanceIndex)}>{row.name}</a
          >
        {:else}
          <span data-slot="name" class="text-ink-strong">{row.name}</span>
        {/if}
      </span>
      {#if message.state === "failed"}
        <span class="flex-none text-status-fail-ink">not sent</span>
      {:else if row.kind === "report" && row.failed}
        <span class="flex-none text-status-fail-ink">failed</span>
      {:else if message.state === "pending"}
        <span class="flex-none">queued</span>
      {/if}
      <!-- Folded, the first line of what it says, quieter than the label and
           cut to the one line; a report's headline is written to be read
           whole, so it wraps under the label instead. -->
      {#if !open && headline}
        <span
          class="grow shrink basis-0 min-w-0 overflow-clip text-clip whitespace-normal wrap-anywhere font-normal text-ink-muted"
          >{headline}</span
        >
      {:else if !open && excerpt}
        <span
          class="grow shrink basis-0 min-w-0 overflow-clip text-ellipsis whitespace-nowrap font-normal text-ink-muted"
          >{excerpt}</span
        >
      {/if}
      <!-- Its chevron trails the line, as a tool row's does, and turns down
           while the body is open. -->
      <Collapsible.Trigger
        aria-label="{row.lead} {row.name}"
        class="group/toggle ms-auto flex-none grid place-items-center p-0 border-0 bg-transparent text-ink-muted cursor-pointer press-tint"
        data-box
      >
        <!-- literal: rotate(90deg) -->
        <span
          data-slot="chev"
          aria-hidden="true"
          style:--chev-turn="rotate(90deg)"
          class="grid place-items-center group-state-open/toggle:transform-(--chev-turn) motion-safe:transition-[transform] motion-safe:dur-control motion-safe:ease-out"
          ><IconChevronRight class="size-icon-md block" /></span
        >
      </Collapsible.Trigger>
    </p>
    {#if message.state === "failed" && meta.sendFailed}
      <!-- Why it did not go, in MessageRow's own reason line. -->
      <p
        data-slot="reason"
        class="mt-space-1 mb-0 text-size-meta font-normal text-status-fail-ink rail-hang"
        >{meta.sendFailed}</p
      >
    {/if}
    <Collapsible.Content reveal>
      <div data-slot="body" class="mt-space-2 rail-hang">
        <MessageBody source={message.content} />
      </div>
    </Collapsible.Content>
  </Collapsible.Root>
</div>

<style>
  /* residual: pseudo: the trigger is a bits-ui element, so it is addressed
     globally; its ::after is the whole line's hit area, and the focus ring
     in place of its own outline. */
  [data-slot="peer-label"] :global([data-slot="collapsible-trigger"]) {
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
  /* residual: unmapped: the name's clip keeps a margin (no utility), so
     the link's padded hit area is not clipped with the ellipsis. */
  [data-slot="text"] {
    overflow-clip-margin: var(--space-1);
  }
</style>
