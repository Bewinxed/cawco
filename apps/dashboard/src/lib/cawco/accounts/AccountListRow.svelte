<script lang="ts">
  /**
   * One account in its provider's group, in the live list's row recipe (a
   * flat row under a hairline): the account's colour as a 10px dot, its
   * name, and the chevron (HIG's disclosure indicator for a drill-in row) in
   * one fixed trailing column, the whole row one link to the account. The
   * provider's mark is the group header's alone. A second line only when
   * something is wrong, in the attention ink behind the warning glyph; it
   * tints in and its words morph as the problem changes (the board state
   * pill's recipe). Opening it, the name flies into the account page's title
   * (motion/share).
   *
   * An account whose setup was left unfinished is where that setup is
   * parked (The Work Outlives Its Surface Rule): its second line says the
   * step it stands at, and the row opens the setup there again.
   *
   * An account Claude Code refused account-wide carries Check again under
   * its refusal, in the name's column and outside the link: the hub's check
   * runs now, the button working while it does. Answered, the button goes
   * with the answer and the refusal as the accounts are read again; refused
   * again, or with no verdict, a meta line under it says so until the next
   * press.
   */
  import type { Account, RefusalVerdict } from "@cawco/core/accounts";
  import { accountsWords as words } from "@cawco/core/words/accounts";
  import { checkRefusalOf } from "#lib/cawco/client.svelte.js";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import {
    IconChevronRight,
    IconRefresh,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import {
    hueVar,
    nameOf,
    problemOf,
    refusedAccountWideAt,
  } from "./model.svelte";

  let { account }: { account: Account } = $props();

  const refusedAt = $derived(
    account.setupStep ? null : refusedAccountWideAt(account)
  );
  /**
   * The refusal a check here brought back (its `refusedAt`): the button and
   * its line leave with the answer, before the accounts' read that removes
   * the refusal lands, and come back for a refusal written after it.
   */
  let backFrom = $state<number | null>(null);
  const checkable = $derived(refusedAt !== null && refusedAt !== backFrom);
  let checking = $state(false);
  /**
   * What the last press came to, said under the button until the next: the
   * account is still out, so the button draws no check (`failed`).
   */
  let said = $state<string | null>(null);

  const sayVerdict = (verdict: RefusalVerdict): string | null => {
    switch (verdict.kind) {
      case "refused":
        return words.problem.stillRefused;
      case "none":
        return words.problem.noVerdict(verdict.why);
      case "back":
      case "not-refused":
        return null;
      default:
        return null;
    }
  };

  async function checkAgain() {
    checking = true;
    said = null;
    const from = refusedAt;
    try {
      const verdict = await checkRefusalOf(account.id);
      if (verdict.kind === "back") {
        backFrom = from;
      }
      said = sayVerdict(verdict);
    } catch (error) {
      said = failureWords(error);
    } finally {
      checking = false;
    }
  }

  const href = $derived(
    account.setupStep
      ? `/config/accounts/new?account=${encodeURIComponent(account.id)}`
      : `/config/accounts/${account.id}`
  );
  const name = $derived(
    account.label || account.email ? nameOf(account) : words.notSignedInYet
  );
  const problem = $derived(
    account.setupStep
      ? words.setup.unfinished(words.setup.steps[account.setupStep])
      : problemOf(account)
  );
</script>

<li
  class="@container/arow flex min-h-c-row-h min-w-0 flex-col border-t border-t-border-hairline"
  data-flip
  style:--link-cols={"var(--spacing-space-3) minmax(0, 1fr) var(--spacing-icon-md)"}
>
  <a
    data-setup={account.setupStep}
    data-slot="account-list-row-link"
    class="grid min-w-0 flex-auto grid-areas-(--link-areas) grid-cols-(--link-cols) items-center gap-x-space-4 gap-y-space-row px-space-2 py-space-3 text-inherit no-underline transition-control focus-visible:outline-solid focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-inset) active:bg-surface-fill data-two:grid-areas-(--link-areas-two)"
    data-two={Boolean(problem) || undefined}
    {href}
    style:--link-areas={'"dot name chev"'}
    style:--link-areas-two={'"dot name chev" ". problem chev"'}
  >
    <i
      data-slot="dot"
      aria-hidden="true"
      class="col-(--area) row-(--area) size-space-3 rounded-pill bg-(--c) transition-[background-color] duration-(--duration-fade) ease-out"
      style:--area="dot"
      style:--c={hueVar(account.hue)}
    ></i>
    <span
      data-slot="name"
      class="col-(--area) row-(--area) type-label flex min-w-0 text-ink-row"
      style:--area="name"
      ><span data-slot="words" class="truncate" data-share="title:{href}"
        >{name}</span
      ></span
    >
    {#if problem}
      <span
        class="mark-line col-(--area) row-(--area) flex min-w-0 items-start gap-space-1 type-meta text-status-attn-ink transition-[color] duration-(--duration-panel) ease-out"
        data-flip
        style:--area="problem"
      >
        <!-- One line high: the glyph stands beside a problem's first line. -->
        <span
          aria-hidden="true"
          class="flex h-lh flex-none items-center"
          data-box><IconWarningTriangle class="size-icon-sm flex-none" /></span
        >
        <span><MorphText text={problem} /></span>
      </span>
    {/if}
    <span
      data-slot="chev"
      aria-hidden="true"
      class="col-(--area) row-(--area) flex text-ink-subtle @max-kinds/arow:row-1"
      style:--area="chev"><IconChevronRight class="size-icon-md" /></span
    >
  </a>
  {#if checkable}
    <div
      data-slot="refusal-check"
      class="grid min-w-0 grid-cols-(--link-cols) items-center gap-x-space-4 gap-y-space-row px-space-2 pb-space-3"
    >
      <span
        class="col-start-2 flex min-w-0 flex-wrap items-center gap-x-space-3 gap-y-space-1"
      >
        <Button
          failed={said !== null}
          icon={IconRefresh}
          label={words.problem.checkAgain}
          onclick={checkAgain}
          pending={checking}
          pendingLabel={words.problem.checking}
          size="xs"
          variant="outline"
        />
        {#if said}
          <span
            data-slot="check-said"
            class="min-w-0 type-meta text-ink-muted"
            role="status">{said}</span
          >
        {/if}
      </span>
    </div>
  {/if}
</li>
