<script lang="ts">
  import RowFault from "#lib/cawco/RowFault.svelte";
  /**
   * AI account: Automatic, then every account of the fleet by its own name
   * with its provider's mark, one list of option rows, all in view. An
   * account's row carries a note only for trouble (Signed out, with Sign
   * in); the chosen account signed out stops every agent and says so under
   * the list. At account limit stands under the list only while an account
   * is chosen: two equal tiles. A press waits for the hub with the old row
   * still chosen; a refusal stands under the pressed row with Try again.
   */
  import ProviderLogo from "#lib/components/features/ProviderLogo.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { IconError, IconLayers } from "#lib/icons.js";
  import { reveal } from "#lib/platform/motion/curves.svelte.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import type { AiChoice, Choice, Pending, Read } from "./details";
  import OptionLine from "./OptionLine.svelte";
  import { pickOne } from "./pick-one";
  import Section from "./Section.svelte";
  import { aiWords, cardWords, sectionWords } from "./words";

  let {
    ai,
    pending,
    pendingLimit,
    sunk = false,
    onpick,
    onsignin,
    ontry,
  }: {
    ai: Read<AiChoice>;
    pending?: Pending;
    pendingLimit?: Pending;
    sunk?: boolean;
    onpick: (pick: Choice) => void;
    /** Sign in to an account, where the fleet keeps its sign-ins. */
    onsignin: (accountId: string) => void;
    ontry: () => void;
  } = $props();

  const AUTO = "automatic";
  const chosen = $derived(
    ai.state === "read" ? (ai.value.chosen ?? AUTO) : null
  );
  const limitId = $props.id();
  const limit = pickOne(
    () => (ai.state === "read" ? ai.value.atLimit : null),
    (value) => onpick({ section: "atLimit", value })
  );
  const pick = pickOne(
    () => chosen,
    (value) => onpick({ section: "account", value })
  );
  const named = $derived(
    ai.state === "read"
      ? ai.value.accounts.find((account) => account.id === ai.value.chosen)
      : undefined
  );
  const none = $derived(
    ai.state === "read" &&
      !ai.value.accounts.some((account) => account.signedIn)
  );
</script>

<Section key="ai" line={sectionWords.ai.line} name={sectionWords.ai.name}>
  {#if ai.state === "reading"}
    <div class="flex flex-col gap-space-2">
      {#each [0, 1, 2, 3] as k (k)}
        <Skeleton height="item" />
      {/each}
    </div>
  {:else if ai.state === "failed"}
    <RowFault again={ontry} reason="{cardWords.couldntRead} {ai.reason}" />
  {:else}
    <div class="flex flex-col gap-space-3" in:reveal>
      <OptionGroup
        aria-label={sectionWords.ai.name}
        bind:value={pick.get, pick.set}
        disabled={sunk}
        layout="list"
      >
        <OptionGroupItem title={aiWords.automaticLine} value={AUTO}>
          <OptionLine
            glyph={IconLayers}
            line={chosen === AUTO ? aiWords.automaticLine : undefined}
            name={aiWords.automatic}
            waiting={pending?.value === AUTO && !pending.refused}
          />
        </OptionGroupItem>
        {#if pending?.value === AUTO && pending.refused}
          <RowFault
            again={() => onpick({ section: "account", value: AUTO })}
            reason={pending.refused}
          />
        {/if}
        {#each ai.value.accounts as account (account.id)}
          <!-- An account signed out carries Sign in on its own row, at its
               end: the row and the button share one cell, so neither is
               inside the other. -->
          <div class="grid">
            <OptionGroupItem class="col-start-1 row-start-1" value={account.id}>
              <OptionLine
                name="{account.name} · {account.tool}"
                note={account.signedIn ? undefined : aiWords.signedOut}
                waiting={pending?.value === account.id && !pending.refused}
              >
                {#snippet mark()}
                  <ProviderLogo provider={account.provider} />
                {/snippet}
              </OptionLine>
            </OptionGroupItem>
            {#if !account.signedIn && account.id !== named?.id}
              <Button
                class="col-start-1 row-start-1 me-space-3 self-center justify-self-end"
                disabled={sunk}
                onclick={() => onsignin(account.id)}
                size="xs"
                variant="outline">{aiWords.signIn}</Button
              >
            {/if}
          </div>
          {#if pending?.value === account.id && pending.refused}
            <RowFault
              again={() => onpick({ section: "account", value: account.id })}
              reason={pending.refused}
            />
          {/if}
        {/each}
      </OptionGroup>

      {#if (named && !named.signedIn) || (chosen === AUTO && none)}
        <!-- The chosen account signed out stops every agent: said under
             the list, with its fix. -->
        <div
          class="flex flex-wrap items-center gap-x-space-3 gap-y-space-2"
          data-trouble
        >
          <!-- mark-line: the glyph stands at the top of words that may wrap -->
          <span
            class="flex min-w-0 flex-1 items-start gap-space-2 type-meta text-status-fail-ink"
          >
            <IconError
              aria-hidden="true"
              class="mt-px size-icon-sm flex-none"
            />
            <span class="text-pretty"
              >{named
                ? aiWords.chosenSignedOut(named.name)
                : aiWords.noAccounts}</span
            >
          </span>
          <Button
            disabled={sunk}
            onclick={() => onsignin(named?.id ?? "")}
            size="sm"
            variant="outline">{aiWords.signIn}</Button
          >
        </div>
      {/if}

      {#if named}
        <!-- At account limit, on one line: its name, then the two answers
             as option chips, what each does in its tooltip. -->
        <div
          class="flex flex-wrap items-center gap-x-space-3 gap-y-space-2"
          transition:unfold
        >
          <span class="type-meta font-medium text-ink-muted" id="{limitId}-name"
            >{aiWords.atLimit}</span
          >
          <OptionGroup
            aria-labelledby="{limitId}-name"
            bind:value={limit.get, limit.set}
            disabled={sunk}
          >
            <OptionGroupItem title={aiWords.wait.note} value="wait"
              >{aiWords.wait.name}</OptionGroupItem
            >
            <OptionGroupItem title={aiWords.move.note} value="move"
              >{aiWords.move.name}</OptionGroupItem
            >
          </OptionGroup>
          {#if pendingLimit && !pendingLimit.refused}
            <span
              class="mark-line flex items-center gap-space-2 type-meta text-ink-muted"
              ><Spinner box="small" tone="muted" /><span>{cardWords.sent}</span
              ></span
            >
          {:else if pendingLimit?.refused}
            <RowFault
              class="basis-full"
              again={() =>
                onpick({ section: "atLimit", value: pendingLimit.value })}
              reason={pendingLimit.refused}
            />
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</Section>
