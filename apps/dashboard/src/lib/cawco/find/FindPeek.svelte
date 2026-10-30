<script lang="ts">
  /**
   * A row unfolded in place (→, or ⌄ on a phone): what tells it apart from a
   * sibling with the same title before he commits. Purpose, the last report,
   * up to three moments where the words were said (each one opens the
   * session at that line), and its delegates. Each moment is an option of
   * the finder's listbox, so ↑↓ walk into it and ↵ opens there.
   */
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { hiddenAt } from "./FindRow.svelte";
  import type { FindMoment, MomentAuthor } from "./find-client";
  import { age, momentParts, ownParts } from "./find-rows";
  import type { Spoken } from "./finder-state.svelte";
  import Said from "./Said.svelte";

  let {
    id,
    result,
    moments,
    now,
    idOf,
    activeKey,
    keyOf,
    momentsState,
    phone = false,
    shown,
    onopen,
    onretry,
    onsecret,
  }: {
    /** The row names it as its description: `${rowId}-peek`. */
    id: string;
    result: Spoken;
    moments: FindMoment[];
    now: number;
    /** The DOM id of a stop, for the field's active descendant. */
    idOf: (key: string) => string;
    activeKey: string | null;
    keyOf: (i: number) => string;
    /** Whether its machine has been asked for these words yet, or failed to answer. */
    momentsState:
      | { state: "ok" }
      | { state: "asking"; machine: string }
      | { state: "missing"; machine: string };
    phone?: boolean;
    /** The secrets the person showed, by key; the rest are dots. */
    shown: ReadonlySet<string>;
    onopen: (moment: FindMoment) => void;
    onretry: () => void;
    /** A press on a hidden secret: show it, rather than opening there. */
    onsecret: (key: string) => void;
  } = $props();

  const AUTHOR: Record<MomentAuthor, string> = {
    owner: "you",
    agent: "agent",
    report: "report",
    injected: "injected",
  };

  const conversation = $derived(result.kind === "conversation" ? result : null);
  const owner = $derived(`${result.kind}:${result.id}`);
</script>

<div
  data-slot="peek"
  {id}
  class="group/peek grid grid-cols-(--peek-cols) gap-x-space-3 gap-y-space-row ms-(--peek-ms) mt-0 mb-space-2 py-space-1 pe-0 ps-space-3 border-s border-s-border-control type-meta leading-icon-lg data-phone:type-label data-phone:font-normal data-phone:leading-c-row-lead"
  data-phone={phone || undefined}
  style:--peek-cols="max-content minmax(0, 1fr)"
  style:--peek-ms="calc(var(--space-3) + var(--icon-md) + var(--space-2))"
>
  {#if conversation?.purpose}
    <span data-slot="find-peek-label" class="text-ink-subtle">purpose</span>
    <span data-slot="value" class="min-w-0 text-ink-row"
      ><Said
        runs={ownParts(conversation, "purpose", conversation.purpose)}
        {shown}
      /></span
    >
  {/if}
  {#if conversation?.lastReport}
    <span data-slot="find-peek-label" class="text-ink-subtle">last</span>
    <span data-slot="value" class="min-w-0 text-ink-row"
      >report “<Said
        runs={ownParts(
          conversation,
          "report",
          conversation.lastReport.headline
        )}
        {shown}
      />”<span class="px-space-1">·</span><span data-slot="num" class="num"
        >{age(conversation.lastReport.at, now)}</span
      ></span
    >
  {/if}
  {#if moments.length > 0}
    <span data-slot="find-peek-label" class="text-ink-subtle">said</span>
    <span class="grid min-w-0" role="presentation">
      {#each moments as moment, i (moment.docId)}
        {@const key = keyOf(i)}
        <button
          id={idOf(key)}
          class="group/moment relative flex select-none items-center gap-space-2 w-(--moment-w) min-w-0 mx-(--moment-mx) px-space-1 border-none border-current rounded-xs bg-transparent text-start text-ink-row cursor-default active:bg-surface-fill group-data-phone/peek:min-h-c-btn-h-lg"
          style:--moment-w="calc(100% + 2 * var(--space-1))"
          style:--moment-mx="calc(-1 * var(--space-1))"
          aria-selected={activeKey === key}
          data-active={activeKey === key ? "" : undefined}
          data-find-row
          onclick={(event) => {
            const secret = hiddenAt(event);
            if (secret) {
              onsecret(secret);
              return;
            }
            onopen(moment);
          }}
          role="option"
          tabindex="-1"
          type="button"
        >
          <span
            class="flex-1 min-w-0 overflow-clip text-ellipsis whitespace-nowrap group-data-phone/peek:whitespace-normal group-data-phone/peek:line-clamp-2 group-data-phone/peek:line-clamp-std-2 group-data-phone/peek:overflow-clip"
            >{AUTHOR[moment.author]}{#if moment.at !== null}<span
                class="px-space-1">·</span
              ><span data-slot="num" class="num">{age(moment.at, now)}</span
              >{/if}<span class="px-space-1">·</span>“<Said
              runs={momentParts(owner, moment)}
              {shown}
            />”</span
          >
          <span
            data-slot="enter"
            class="text-ink-subtle opacity-0 group-data-active/moment:opacity-100 group-data-phone/peek:opacity-100"
            aria-hidden="true">↵</span
          >
        </button>
      {/each}
    </span>
  {:else if momentsState.state === "asking"}
    <span data-slot="find-peek-label" class="text-ink-subtle">said</span>
    <span
      data-slot="value"
      class="mark-line flex min-w-0 items-start gap-space-2 text-ink-muted"
      ><span class="mark-cell"><LiveDot /></span><span class="min-w-0"
        >Asking {momentsState.machine}…</span
      ></span
    >
  {:else if momentsState.state === "missing"}
    <span data-slot="find-peek-label" class="text-ink-subtle">said</span>
    <span data-slot="value" class="min-w-0 text-ink-muted"
      >{momentsState.machine} didn't answer<span class="px-space-1">·</span
      ><button
        class="select-none border-none border-current p-0 bg-transparent text-link-ink"
        onclick={onretry}
        type="button">Retry</button
      ></span
    >
  {/if}
  {#if conversation && conversation.children.count > 0}
    <span data-slot="find-peek-label" class="text-ink-subtle">delegates</span>
    <span data-slot="value" class="min-w-0 text-ink-row"
      ><span data-slot="num" class="num">{conversation.children.count}</span
      >{#if conversation.children.needsYou > 0}<span class="px-space-1">·</span
        ><span class="text-status-attn-ink font-medium"
          ><span data-slot="num" class="num"
            >{conversation.children.needsYou}</span
          > needs you</span
        >{/if}</span
    >
  {/if}
  {#if !phone}
    <span
      data-slot="foot"
      class="col-span-full text-ink-subtle"
      aria-hidden="true">↵ open<span class="px-space-1">·</span>← fold</span
    >
  {/if}
</div>
