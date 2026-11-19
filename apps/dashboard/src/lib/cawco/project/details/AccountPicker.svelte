<script lang="ts">
  /**
   * Which account agents start on, when one account is picked: the house
   * combobox (ModelCombobox's recipe, the kit's command in a popover). Its
   * trigger names the account in force with its provider's mark and whether
   * it is signed in; open, every account of the fleet by its own name,
   * found by typing, each with its mark and whether it is signed in. A
   * signed-out account keeps its Sign in on its row. The chosen one wears
   * the item's tick.
   */
  import { aiWords } from "@cawco/core/words/project-details";
  import ProviderLogo from "#lib/components/features/ProviderLogo.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Command from "#lib/components/ui/command/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { IconUnfold } from "#lib/icons.js";
  import type { AiAccount } from "./details";

  let {
    accounts,
    chosen,
    open = $bindable(false),
    waiting = null,
    disabled = false,
    label,
    onchoose,
    onsignin,
  }: {
    accounts: AiAccount[];
    /** The account in force; null while none is picked. */
    chosen: string | null;
    open?: boolean;
    /** The account asked and not yet taken. */
    waiting?: string | null;
    disabled?: boolean;
    /** What a screen reader calls the trigger. */
    label: string;
    onchoose: (accountId: string) => void;
    onsignin: (accountId: string) => void;
  } = $props();

  let typed = $state("");
  const shown = $derived(
    accounts.find((account) => account.id === (waiting ?? chosen))
  );
</script>

{#snippet status(account: AiAccount)}
  {#if account.signedIn}
    <span class="type-meta text-ink-muted">{aiWords.signedIn}</span>
  {:else}
    <span class="type-meta text-status-attn-ink">{aiWords.signedOut}</span>
  {/if}
{/snippet}

<Popover.Root
  onOpenChange={(next) => {
    if (!next) {
      typed = "";
    }
  }}
  bind:open
>
  <Popover.Trigger>
    {#snippet child({ props })}
      <Button
        {...props}
        aria-expanded={open}
        aria-label={label}
        align="trigger"
        {disabled}
        gap="loose"
        role="combobox"
        size="sm"
        class="w-full"
        variant="outline"
      >
        {#if shown}
          <ProviderLogo provider={shown.provider} size="meta" />
          <span
            class="min-w-0 flex-1 overflow-clip text-ellipsis whitespace-nowrap text-start"
            >{shown.name}</span
          >
          {@render status(shown)}
        {:else}
          <span
            class="min-w-0 flex-1 overflow-clip text-ellipsis whitespace-nowrap text-start text-ink-muted"
            >{aiWords.pick}</span
          >
        {/if}
        {#if waiting}
          <Spinner box="small" tone="muted" />
        {/if}
        <IconUnfold class="size-icon-md shrink-0 opacity-50" />
      </Button>
    {/snippet}
  </Popover.Trigger>

  <Popover.Content align="start" pad="none" width="wide">
    <Command.Root>
      <Command.Input placeholder={aiWords.find} bind:value={typed} />
      <Command.List>
        <Command.Empty>{aiWords.noMatch}</Command.Empty>
        {#each accounts as account (account.id)}
          <!-- A signed-out account keeps its Sign in at its row's end: the
               item and the button share one cell, so neither is inside the
               other. -->
          <div class="grid">
            <Command.Item
              class="col-start-1 row-start-1"
              data-checked={account.id === chosen}
              keywords={[account.name, account.provider]}
              onSelect={() => {
                open = false;
                onchoose(account.id);
              }}
              value={account.id}
            >
              <ProviderLogo provider={account.provider} />
              <span
                class="min-w-0 flex-1 overflow-clip text-ellipsis whitespace-nowrap"
                >{account.name}</span
              >
              {#if account.signedIn}
                {@render status(account)}
              {/if}
            </Command.Item>
            {#if !account.signedIn}
              <span
                class="col-start-1 row-start-1 me-space-2 flex items-center gap-space-2 self-center justify-self-end"
              >
                {@render status(account)}
                <Button
                  onclick={() => onsignin(account.id)}
                  size="xs"
                  variant="outline">{aiWords.signIn}</Button
                >
              </span>
            {/if}
          </div>
        {/each}
      </Command.List>
    </Command.Root>
  </Popover.Content>
</Popover.Root>
