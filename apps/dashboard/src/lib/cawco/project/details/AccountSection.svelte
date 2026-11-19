<script lang="ts">
  /**
   * AI account: two option rows, Automatic or One account, the chosen
   * one's mark gliding between them (the option group's `glide`). Under
   * One account, the account it names, picked in the house combobox
   * (AccountPicker), since accounts are many and named. Pressing One
   * account while Automatic stands opens the combobox and sends nothing;
   * the account picked there is the change. The chosen account signed out
   * stops every agent and says so with Sign in; with Automatic and no
   * account signed in anywhere, the same. At account limit stands under it
   * only while an account is chosen, its two answers as chips on one line.
   * A press waits for the hub with the old pick still chosen; a refusal
   * stands under what was pressed, with Try again.
   */
  import {
    aiWords,
    cardWords,
    sectionWords,
  } from "@cawco/core/words/project-details";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { IconAccounts, IconError, IconLayers, IconUser } from "#lib/icons.js";
  import { reveal } from "#lib/platform/motion/curves.svelte.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import AccountPicker from "./AccountPicker.svelte";
  import type { AiChoice, Choice, Pending, Read } from "./details";
  import OptionLine from "./OptionLine.svelte";
  import { pickOne } from "./pick-one";
  import Section from "./Section.svelte";

  let {
    ai,
    pending,
    pendingLimit,
    sunk = false,
    picking = $bindable(false),
    onpick,
    onsignin,
    ontry,
  }: {
    ai: Read<AiChoice>;
    pending?: Pending;
    pendingLimit?: Pending;
    sunk?: boolean;
    /** The account combobox stands open. */
    picking?: boolean;
    onpick: (pick: Choice) => void;
    /** Sign in to an account, where the fleet keeps its sign-ins. */
    onsignin: (accountId: string) => void;
    ontry: () => void;
  } = $props();

  const AUTO = "automatic";
  const ONE = "one";
  const limitId = $props.id();
  const chosenId = $derived(ai.state === "read" ? ai.value.chosen : null);
  const way = $derived.by(() => {
    if (ai.state !== "read") {
      return null;
    }
    return chosenId === null ? AUTO : ONE;
  });
  const limit = pickOne(
    () => (ai.state === "read" ? ai.value.atLimit : null),
    (value) => onpick({ section: "atLimit", value })
  );
  const pickWay = pickOne(
    () => way,
    (value) => {
      if (value === AUTO) {
        onpick({ section: "account", value: AUTO });
      } else {
        picking = true;
      }
    }
  );
  const named = $derived(
    ai.state === "read"
      ? ai.value.accounts.find((account) => account.id === chosenId)
      : undefined
  );
  const none = $derived(
    ai.state === "read" &&
      !ai.value.accounts.some((account) => account.signedIn)
  );
  /** An account asked in the combobox, not yet taken. */
  const asked = $derived(
    pending && !pending.refused && pending.value !== AUTO ? pending.value : null
  );
</script>

<Section
  hue="var(--color-mark-5)"
  icon={IconAccounts}
  key="ai"
  line={sectionWords.ai.line}
  name={sectionWords.ai.name}
>
  {#if ai.state === "reading"}
    <div class="flex flex-col gap-space-2">
      {#each [0, 1, 2] as k (k)}
        <Skeleton height="item" />
      {/each}
    </div>
  {:else if ai.state === "failed"}
    <RowFault again={ontry} reason="{cardWords.couldntRead} {ai.reason}" />
  {:else}
    <div class="flex flex-col gap-space-3" in:reveal>
      <OptionGroup
        aria-label={sectionWords.ai.name}
        bind:value={pickWay.get, pickWay.set}
        disabled={sunk}
        glide
        layout="list"
      >
        <OptionGroupItem value={AUTO}>
          <OptionLine
            glyph={IconLayers}
            line={aiWords.automatic.line}
            name={aiWords.automatic.name}
            waiting={pending?.value === AUTO && !pending.refused}
          />
        </OptionGroupItem>
        <OptionGroupItem value={ONE}>
          <OptionLine
            glyph={IconUser}
            line={aiWords.account.line}
            name={aiWords.account.name}
          />
        </OptionGroupItem>
      </OptionGroup>

      <!-- The account One account names, on the option's text edge. -->
      <div class="flex flex-col gap-space-2 ps-c-details-option-text">
        <div class="flex min-w-0 items-center gap-space-2">
          <span class="min-w-0 flex-1">
            <AccountPicker
              accounts={ai.value.accounts}
              chosen={chosenId}
              disabled={sunk}
              label={aiWords.account.name}
              onchoose={(id) => onpick({ section: "account", value: id })}
              {onsignin}
              bind:open={picking}
              waiting={asked}
            />
          </span>
          {#if named && !named.signedIn}
            <Button
              disabled={sunk}
              onclick={() => onsignin(named.id)}
              size="sm"
              variant="outline">{aiWords.signIn}</Button
            >
          {/if}
        </div>
        {#if pending?.refused}
          <RowFault
            again={() => onpick({ section: "account", value: pending.value })}
            reason={pending.refused}
          />
        {/if}
      </div>

      {#if (named && !named.signedIn) || (way === AUTO && none)}
        <!-- The chosen account signed out stops every agent: said under
             the pick, with its fix. -->
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
            glide
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
