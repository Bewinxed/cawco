<script lang="ts">
  /**
   * Stage 3 ("What waits for you"): the project's Who decides as its own
   * page draws it, on the stage's ground with no box of its own. The head
   * is the page's: the lede (the project follows the fleet, or how many
   * kinds it set itself, with the way to put them all back), the legend of
   * the tiles' scope glyphs, Review before done as its switch (SwitchField),
   * and the link to the fleet's defaults. Under it the page's roster
   * (Roster): every decider a card holding the kinds it decides, a press on
   * a kind's tile handing it to another.
   *
   * Every hand-over, put-back and the review switch move at the press
   * (changes.ts `withAsked`): the tile flies to its new card at once; a
   * refusal flies it back and stands under it in the hub's words with Try
   * again (KindTile's RowFault), the switch's under the switch.
   *
   * A rule file that doesn't read stands in the roster's place with the
   * hub's words and Try again: every choice is the person's until it reads.
   */
  import {
    BUILT_IN,
    KIND_SEED,
    type Kind,
    type Member,
  } from "@cawco/core/decides";
  import SwitchField from "#lib/cawco/config/SwitchField.svelte";
  import type { Fault } from "#lib/cawco/decides/decides.svelte.js";
  import Roster from "#lib/cawco/decides/Roster.svelte";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { IconChevronRight, IconFolder, IconGlobe } from "#lib/icons.js";
  import type { HrefOf, StageSends } from "./changes";
  import { CHOICE_KINDS, type ChoiceKind, type Decider } from "./records";
  import { howItRunsWords as words } from "./words";

  let {
    record,
    refused,
    onchange,
    onretry,
    onreread,
    hrefOf,
  }: StageSends & {
    /** Re-read Who decides when its rule file could not be read. */
    onreread: () => void;
    hrefOf: HrefOf;
  } = $props();

  const DECIDERS: readonly Decider[] = ["you", "caw", "advisor", "practice"];

  /** The deciders as the roster's cards name them, in this view's words. */
  const members: Member[] = DECIDERS.map((id) => ({
    ...BUILT_IN[id],
    name: words.waits.members[id].name,
    job: words.waits.members[id].job,
  }));
  /** The kinds as the tiles name them, in this view's words. */
  const kinds: Kind[] = CHOICE_KINDS.flatMap((id) => {
    const seed = KIND_SEED.find((kind) => kind.id === id);
    return seed
      ? [
          {
            ...seed,
            name: words.waits.kinds[id].name,
            example: words.waits.kinds[id].example,
          },
        ]
      : [];
  });

  /** The kind whose hand-over stands open. */
  let handing = $state<string | null>(null);

  const rules = $derived(record.whoDecides.ok ? record.whoDecides.rules : null);
  /** Each kind's decider; with the rule file unread, every kind is the person's (as Who decides draws it). */
  const routes = $derived(
    Object.fromEntries(
      CHOICE_KINDS.map((kind) => [
        kind,
        rules === null ? "you" : rules[kind].by,
      ])
    )
  );
  const fleetRoutes = $derived(
    Object.fromEntries(
      CHOICE_KINDS.map((kind) => [
        kind,
        rules === null ? "you" : rules[kind].fleet,
      ])
    )
  );
  const own = $derived(
    rules === null ? [] : CHOICE_KINDS.filter((kind) => rules[kind].own)
  );

  const isKind = (id: string): id is ChoiceKind =>
    CHOICE_KINDS.some((one) => one === id);
  const isDecider = (id: string): id is Decider =>
    DECIDERS.some((one) => one === id);

  /** The first refused hand-over or put-back, as the roster stands it under its tile. */
  const fault = $derived.by((): Fault | null => {
    for (const kind of CHOICE_KINDS) {
      const reason = refused[`decides.${kind}`];
      if (reason) {
        return {
          kinds: [kind],
          reason,
          again: () => {
            onretry(`decides.${kind}`);
            return Promise.resolve(true);
          },
        };
      }
    }
    return null;
  });

  function hand(kind: string, member: string): Promise<boolean> {
    if (rules === null || !(isKind(kind) && isDecider(member))) {
      return Promise.resolve(false);
    }
    onchange({ key: "decides", kind, value: member });
    return Promise.resolve(true);
  }

  function putBack(kind: string): Promise<boolean> {
    if (rules === null || !isKind(kind)) {
      return Promise.resolve(false);
    }
    onchange({ key: "decidesReset", kind });
    return Promise.resolve(true);
  }
</script>

<div class="flex min-w-0 flex-col gap-space-4">
  <div
    class="grid min-w-0 grid-cols-(--head-cols) items-start gap-x-space-5 gap-y-space-3 max-phone:grid-cols-1"
    style:--head-cols="minmax(0, 1fr) auto"
  >
    <header class="flex min-w-0 flex-col gap-space-2">
      {#if rules !== null}
        <p class="m-0 type-body text-pretty text-ink-muted">
          {own.length === 0
            ? words.waits.followingFleet
            : words.waits.projectRules(own.length)}
          {#if own.length > 0}
            <button
              class="rounded-xs text-brand-ink underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid disabled:text-ink-muted can-hover:hover:not-disabled:text-brand-ink-strong"
              disabled={!record.hubReachable}
              onclick={() => {
                for (const kind of own) {
                  putBack(kind);
                }
              }}
              type="button">{words.waits.putAllBack}</button
            >
          {/if}
        </p>
        <ul
          class="m-0 flex list-none flex-wrap items-center gap-x-space-4 gap-y-space-1 p-0 type-meta text-ink-muted"
        >
          <li class="mark-line flex items-center gap-x-space-1">
            <IconGlobe aria-hidden="true" class="size-icon-sm" />
            <span>{words.waits.legendFleet}</span>
          </li>
          <li class="mark-line flex min-w-0 items-center gap-x-space-1">
            <IconFolder aria-hidden="true" class="size-icon-sm flex-none" />
            <span class="wrap-anywhere">{words.waits.legendOwn}</span>
          </li>
        </ul>
      {/if}
      <div class="flex min-w-0 flex-col gap-space-1 pt-space-2">
        <SwitchField
          bind:checked={
            () => record.reviewBeforeDone,
            (next) => {
              if (next !== record.reviewBeforeDone) {
                onchange({ key: "review", value: next });
              }
            }
          }
          disabled={!record.hubReachable}
          hint={words.waits.reviewNote}
          id="work-path-review"
          label={words.waits.reviewLabel}
        />
        <RowFault
          again={() => onretry("review")}
          againLabel={words.retryChange}
          reason={refused.review}
        />
      </div>
    </header>
    <a
      class="mark-line inline-flex items-center gap-space-1 rounded-xs type-label text-link-ink underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid can-hover:hover:underline"
      href={hrefOf("fleetDecides")}
    >
      <span>{words.waits.fleetDefaults}</span>
      <IconChevronRight aria-hidden="true" class="size-icon-sm flex-none" />
    </a>
  </div>

  {#if !record.whoDecides.ok}
    <RowFault
      again={onreread}
      details={record.whoDecides.error}
      reason={words.waits.unreadTitle}
    />
  {/if}
  <Roster
    asking={null}
    facts={() => null}
    {fault}
    {fleetRoutes}
    bind:handing
    {kinds}
    {members}
    onhand={hand}
    onputback={putBack}
    {own}
    project={record.project.name}
    {routes}
    said={words.waits.roster}
  />
</div>
