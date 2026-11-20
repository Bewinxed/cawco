<script lang="ts">
  /**
   * Which account agents start on, when one account is picked: the house
   * combobox (ModelCombobox's recipe, the kit's command in a popover). Its
   * trigger is one of the card's own pick rows (the option chip, its picked
   * look while an account is in force): the account's mark, its name in the
   * label role and whether it is signed in in the meta role (OptionLine),
   * and a chevron that says it opens a list; open, every account of the
   * fleet by its own name,
   * found by typing, each with its mark and whether it is signed in. A
   * signed-out account keeps its Sign in on its row. The chosen one wears
   * the item's tick.
   */
  import { aiWords } from "@cawco/core/words/project-details";
  import ProviderLogo from "#lib/components/features/ProviderLogo.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import * as Command from "#lib/components/ui/command/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { IconChevronDown } from "#lib/icons.js";
  import { cn } from "#lib/utils.js";
  import type { AiAccount } from "./details";
  import OptionLine from "./OptionLine.svelte";

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
      <button
        {...props}
        class={cn(
          chipVariants({ variant: "option" }),
          "focus-inset flex w-full items-start gap-space-2"
        )}
        aria-expanded={open}
        aria-label={label}
        data-chosen={shown ? true : undefined}
        {disabled}
        role="combobox"
        type="button"
      >
        <span class="min-w-0 flex-1" data-box>
          {#if shown}
            <OptionLine
              line={shown.signedIn ? aiWords.signedIn : undefined}
              name={shown.name}
              note={shown.signedIn ? undefined : aiWords.signedOut}
              waiting={Boolean(waiting)}
            >
              {#snippet mark()}
                <ProviderLogo provider={shown.provider} />
              {/snippet}
            </OptionLine>
          {:else}
            <OptionLine name={aiWords.pick} waiting={Boolean(waiting)} />
          {/if}
        </span>
        <IconChevronDown
          aria-hidden="true"
          class="mt-px size-icon-sm flex-none text-ink-muted"
        />
      </button>
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
