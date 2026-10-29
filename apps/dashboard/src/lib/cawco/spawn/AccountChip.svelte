<script lang="ts" module>
  import { nameFields, type Part, type RingAccount } from "../usage/rings";

  /** One account the chip offers. */
  interface AccountOption {
    color: string;
    /** Out of reach for a new session: its limit is spent. */
    disabled: boolean;
    email: string | null;
    id: string;
    /** Its key, in a line: what is left and when it resets. */
    line: Part[];
    name: string;
    nick: string | null;
    /** Its rings, once it has a reading. */
    ring: RingAccount | null;
  }

  /** The account a new session runs on: Auto (placement's pick) or one picked for it. */
  export interface AccountTool {
    /** Where Auto places it, and placement's sentence for why. */
    auto: { id: string | null; why: string };
    onpick: (id: string | null) => void;
    options: AccountOption[];
    /** The pick for this session; null: Auto. */
    value: string | null;
  }
</script>

<script lang="ts">
  import { spawnWords } from "@cawco/core/words/spawn";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  /**
   * The New session form's account chip, among the chosen model's tool
   * chips after effort and permissions: the account the session will run
   * on, as a dot in its colour and its name. Its popover lists Auto (with
   * placement's reason) and each account with its small rings and a key
   * line; a pick holds for this session only.
   */
  import { IconSuccess as Check, IconChevronDown as Down } from "#lib/icons.js";
  import AccountName from "../accounts/AccountName.svelte";
  import Rings from "../usage/Rings.svelte";
  import Words from "../usage/Words.svelte";
  import NsPopover from "./NsPopover.svelte";

  let {
    tool,
    id,
    open,
    onchange,
  }: {
    tool: AccountTool;
    id: string;
    open: boolean;
    onchange: (open: boolean) => void;
  } = $props();

  const shown = $derived(
    tool.options.find((option) => option.id === (tool.value ?? tool.auto.id))
  );
  const label = $derived(
    shown ? (shown.nick ?? shown.name) : spawnWords.account.auto
  );

  function pick(value: string | null) {
    tool.onpick(value);
    onchange(false);
  }
</script>

<NsPopover
  align="end"
  id={`${id}-account`}
  label={spawnWords.account.chip(label)}
  {onchange}
  {open}
  rows="[data-account-option]"
  triggerClass={chipVariants({ variant: "setting" })}
  triggerData={{ "data-tool": true }}
  width={360}
>
  {#snippet trigger()}
    {#if shown}
      <span
        data-slot="dot"
        class="size-space-2 flex-none rounded-pill bg-(--c)"
        style:--c={shown.color}
      ></span>
    {/if}
    <span data-slot="chip-label" data-account-chip>{label}</span>
    <Down data-slot="chevron" />
  {/snippet}
  <!-- Every row on one grid: a lead column, the words (its name in the
       label role over a meta line), the tick. Auto has no mark of its own, so
       its lead stands empty and its words start where every account's do. A
       row out of reach fades its mark and name (DESIGN.md, Disabled: 50%
       opacity); its meta line, which says why, stays whole in muted ink. -->
  <div
    data-slot="list"
    aria-label={spawnWords.account.name}
    class="flex flex-col p-space-2"
    role="listbox"
    style:--ring-ground="var(--surface-lift)"
  >
    <button
      data-slot="option"
      aria-selected={tool.value === null}
      class="group press-tint transition-control select-none grid min-h-c-row-h w-full grid-cols-(--cols) items-center gap-space-3 rounded-sm border-none border-current bg-transparent px-space-3 py-space-2 text-start text-ink-strong"
      data-account-option="auto"
      onclick={() => pick(null)}
      role="option"
      style:--cols="var(--icon-md) minmax(0, 1fr) var(--icon-md)"
      type="button"
    >
      <span aria-hidden="true"></span>
      <span data-slot="words" class="flex min-w-0 flex-col gap-space-row">
        <span class="type-label">{spawnWords.account.auto}</span>
        {#if tool.auto.why}
          <span class="type-meta text-ink-muted text-pretty"
            >{tool.auto.why}</span
          >
        {/if}
      </span>
      <Check
        class="size-icon-md text-selected-icon opacity-0 transition-[opacity] duration-(--dur-control) ease-out group-aria-selected:opacity-100 motion-reduce:transition-off"
      />
    </button>
    {#each tool.options as option (option.id)}
      <button
        data-slot="option"
        aria-selected={tool.value === option.id}
        class="group press-tint transition-control select-none grid min-h-c-row-h w-full grid-cols-(--cols) items-center gap-space-3 rounded-sm border-none border-current bg-transparent px-space-3 py-space-2 text-start text-ink-strong"
        data-account-option={option.id}
        disabled={option.disabled}
        onclick={() => pick(option.id)}
        role="option"
        style:--cols="var(--icon-md) minmax(0, 1fr) var(--icon-md)"
        type="button"
      >
        <span
          data-slot="lead"
          class="grid place-items-center group-disabled:opacity-50"
        >
          {#if option.ring}
            <Rings ring={option.ring} size={16} />
          {:else}
            <span
              data-account-chip-lead
              data-slot="dot"
              class="size-space-2 flex-none rounded-pill bg-(--c)"
              style:--c={option.color}
            ></span>
          {/if}
        </span>
        <span data-slot="words" class="flex min-w-0 flex-col gap-space-row">
          <span class="min-w-0 group-disabled:opacity-50"
            ><AccountName account={nameFields(option)} row wrap /></span
          >
          {#if option.line.length > 0}
            <span class="type-meta text-ink-muted"
              ><Words parts={option.line} /></span
            >
          {/if}
        </span>
        <Check
          class="size-icon-md text-selected-icon opacity-0 transition-[opacity] duration-(--dur-control) ease-out group-aria-selected:opacity-100 motion-reduce:transition-off"
        />
      </button>
    {/each}
  </div>
</NsPopover>
