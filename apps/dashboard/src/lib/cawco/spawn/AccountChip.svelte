<script lang="ts" module>
  import { nameFields, type Part, type RingAccount } from "../usage/rings";

  /** One account the chip offers. */
  export interface AccountOption {
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
  /**
   * The New session form's account chip, among the chosen model's tool
   * chips after effort and permissions: the account the session will run
   * on, as a dot in its colour and its name. Its popover lists Auto (with
   * placement's reason) and each account with its small rings and a key
   * line; a pick holds for this session only.
   */
  import Down from "~icons/solar/alt-arrow-down-linear";
  import Check from "~icons/solar/check-circle-bold-duotone";
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
  const label = $derived(shown ? (shown.nick ?? shown.name) : "Auto");

  function pick(value: string | null) {
    tool.onpick(value);
    onchange(false);
  }
</script>

<NsPopover
  align="end"
  id={`${id}-account`}
  label={`Account: ${label}`}
  {onchange}
  {open}
  rows="[data-account-option]"
  triggerClass="ns-chip-btn tool"
  width={360}
>
  {#snippet trigger()}
    {#if shown}
      <!-- literal: 6px -->
      <span
        data-slot="dot"
        class="size-(--dot) flex-none rounded-(--round) bg-(--c)"
        style:--c={shown.color}
        style:--dot="6px"
        style:--round="50%"
      ></span>
    {/if}
    <span data-slot="chip-label" class="chip-label" data-account-chip
      >{label}</span
    >
    <Down class="chevron" />
  {/snippet}
  <div
    data-slot="list"
    aria-label="Account"
    class="flex flex-col p-space-2"
    role="listbox"
    style:--ring-ground="var(--surface-lift)"
  >
    <!-- literal: 40px; 16px column tracks -->
    <button
      data-slot="option"
      aria-selected={tool.value === null}
      class="group type-label grid min-h-(--min-h) w-full cursor-pointer grid-cols-(--cols) items-center gap-space-3 rounded-sm border-0 bg-transparent px-space-3 py-space-2 text-start text-ink-strong disabled:cursor-default disabled:opacity-60"
      data-account-option="auto"
      onclick={() => pick(null)}
      role="option"
      style:--cols="minmax(0, 1fr) 16px"
      style:--min-h="40px"
      type="button"
    >
      <span class="min-w-0 wrap-anywhere"
        >Auto{tool.auto.why ? ` · ${tool.auto.why}` : ""}</span
      >
      <Check
        class="size-icon-md text-selected-icon opacity-0 transition-[opacity] dur-control ease-out group-aria-selected:opacity-100 motion-reduce:transition-none"
      />
    </button>
    {#each tool.options as option (option.id)}
      <!-- literal: 40px; 16px column tracks -->
      <button
        data-slot="option"
        aria-selected={tool.value === option.id}
        class="group grid min-h-(--min-h) w-full cursor-pointer grid-cols-(--cols) items-center gap-space-3 rounded-sm border-0 bg-transparent px-space-3 py-space-2 text-start text-ink-strong disabled:cursor-default disabled:opacity-60"
        data-account-option={option.id}
        disabled={option.disabled}
        onclick={() => pick(option.id)}
        role="option"
        style:--cols="16px minmax(0, 1fr) 16px"
        style:--min-h="40px"
        type="button"
      >
        {#if option.ring}
          <Rings ring={option.ring} size={16} />
        {:else}
          <!-- literal: 8px -->
          <span
            data-account-chip-lead
            data-slot="dot"
            class="mx-space-1 size-(--dot) flex-none rounded-(--round) bg-(--c)"
            style:--c={option.color}
            style:--dot="8px"
            style:--round="50%"
          ></span>
        {/if}
        <span data-slot="words" class="flex min-w-0 flex-col gap-space-row">
          <AccountName account={nameFields(option)} row wrap />
          {#if option.line.length > 0}
            <span class="type-meta text-ink-muted"
              ><Words parts={option.line} /></span
            >
          {/if}
        </span>
        <Check
          class="size-icon-md text-selected-icon opacity-0 transition-[opacity] dur-control ease-out group-aria-selected:opacity-100 motion-reduce:transition-none"
        />
      </button>
    {/each}
  </div>
</NsPopover>
