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
      <span class="dot" style:--c={shown.color}></span>
    {/if}
    <span class="chip-label" data-account-chip>{label}</span>
    <Down class="chevron" />
  {/snippet}
  <div aria-label="Account" class="list" role="listbox">
    <button
      aria-selected={tool.value === null}
      class="option auto"
      data-account-option="auto"
      onclick={() => pick(null)}
      role="option"
      type="button"
    >
      <span class="auto-label"
        >Auto{tool.auto.why ? ` · ${tool.auto.why}` : ""}</span
      >
      <Check class="check" />
    </button>
    {#each tool.options as option (option.id)}
      <button
        aria-selected={tool.value === option.id}
        class="option"
        data-account-option={option.id}
        disabled={option.disabled}
        onclick={() => pick(option.id)}
        role="option"
        type="button"
      >
        {#if option.ring}
          <Rings ring={option.ring} size={16} />
        {:else}
          <span class="dot lead" style:--c={option.color}></span>
        {/if}
        <span class="words">
          <AccountName account={nameFields(option)} row wrap />
          {#if option.line.length > 0}
            <span class="line"><Words parts={option.line} /></span>
          {/if}
        </span>
        <Check class="check" />
      </button>
    {/each}
  </div>
</NsPopover>

<style>
  .dot {
    flex: none;
    inline-size: 6px;
    block-size: 6px;
    border-radius: 50%;
    background: var(--c);
  }
  .dot.lead {
    inline-size: 8px;
    block-size: 8px;
    margin-inline: 4px;
  }
  .list {
    --ring-ground: var(--surface-lift);
    display: flex;
    flex-direction: column;
    padding: var(--space-2);
  }
  .option {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr) 16px;
    gap: var(--space-3);
    align-items: center;
    inline-size: 100%;
    min-block-size: 40px;
    padding: var(--space-2) var(--space-3);
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--ink-strong);
    text-align: start;
    cursor: pointer;
  }
  .option.auto {
    grid-template-columns: minmax(0, 1fr) 16px;
    font: var(--type-label);
  }
  .option:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .auto-label {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }
  .words {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
  }
  .line {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .option :global(.check) {
    inline-size: 16px;
    block-size: 16px;
    color: var(--selected-icon);
    opacity: 0;
    transition: opacity var(--dur-control) var(--ease-out);
  }
  .option[aria-selected="true"] :global(.check) {
    opacity: 1;
  }
  @media (prefers-reduced-motion: reduce) {
    .option :global(.check) {
      transition: none;
    }
  }
</style>
