<script lang="ts">
  /**
   * One account in a session's account picker (AccountSwitch's list): its
   * dot, its name, and the check on the one the session shows. An account
   * CawCo believes is at its limit stays a pick: its name goes muted and a
   * limit line under it says until when and how old that reading is
   * (LimitLine). A pick on it asks the provider first (`checking`); the
   * line then says what the ask found, and Move anyway opens under the row
   * (LimitForce), at once where the provider can't be asked.
   */
  import type { NameableAccount } from "@cawco/core/accounts";
  import type { AccountHue } from "@cawco/core/accounts/kinds";
  import { limitPickWords } from "@cawco/core/words/limit-picks";
  import { IconCheck } from "#lib/icons.js";
  import AccountName from "./AccountName.svelte";
  import LimitForce from "./LimitForce.svelte";
  import LimitLine from "./LimitLine.svelte";
  import { hueVar } from "./model.svelte";

  let {
    account,
    picked,
    limit,
    provider,
    checking = false,
    force,
    onpick,
    onforce,
  }: {
    account: NameableAccount & { hue: AccountHue };
    /** The account the session shows: the one it runs on, or is moving to. */
    picked: boolean;
    /** What the last reading says of its limit, in words; undefined while it has room. */
    limit?: string;
    /** Who a pick asks about its limit, by name: Anthropic, ChatGPT, OpenCode Go. */
    provider: string;
    /** The provider is being asked about it now. */
    checking?: boolean;
    /** What forcing the pick may meet, or why the provider can't be asked: opens Move anyway under the row. */
    force?: string;
    onpick: () => void;
    onforce: () => void;
  } = $props();
</script>

<div
  data-slot="account-pick"
  class="grid"
  style:--lead="calc(var(--spacing-space-3) * 2 + var(--spacing-icon-md))"
>
  <button
    data-slot="option"
    aria-busy={checking || undefined}
    aria-selected={picked}
    class="group press-tint transition-control mark-line select-none grid min-h-c-btn-h w-full grid-cols-(--option-cols) items-center gap-x-space-3 rounded-sm border-none border-current bg-transparent px-space-3 py-space-2 text-start text-ink-strong coarse:min-h-c-btn-h-lg"
    data-account-option={account.id}
    data-limited={limit ? true : undefined}
    onclick={onpick}
    role="option"
    style:--option-cols={"var(--spacing-icon-md) minmax(0, 1fr) var(--spacing-icon-md)"}
    type="button"
  >
    <span
      data-slot="dot"
      aria-hidden="true"
      class="size-space-2 flex-none justify-self-center rounded-pill bg-(--c)"
      data-box
      style:--c={hueVar(account.hue)}
    ></span>
    <span
      class="grid min-w-0 grid-cols-1 gap-y-0 group-data-limited:[&_b]:text-ink-muted [&_b,&_small]:min-w-0"
      data-box
    >
      <AccountName {account} row />
      {#if limit}
        <LimitLine
          {checking}
          words={checking ? limitPickWords.checking(provider) : limit}
        />
      {/if}
    </span>
    <IconCheck
      class="size-icon-md text-selected-icon opacity-0 group-aria-selected:opacity-100 motion-safe:transition-[opacity] motion-safe:duration-(--duration-control) motion-safe:ease-out"
    />
  </button>
  {#if force}
    <LimitForce action={limitPickWords.moveAnyway} {onforce} words={force} />
  {/if}
</div>
