<script lang="ts" module>
  /**
   * The deciders' four cards balanced on their lines, inside a
   * `@container/deciders`: four across where four fit, else two by two from
   * the kinds' line (a column of the view's two holds two), never one alone
   * on a line; one a line only where two would crush a tile's words.
   */
  export const DECIDERS_COLS =
    "grid-cols-1 @min-kinds/deciders:grid-cols-2 @min-roster-four/deciders:grid-cols-4";
</script>

<script lang="ts">
  /**
   * What needs you: the project's Who decides as its page draws it,
   * fitted in its section's card, its heading holding the way to the
   * fleet's defaults (HowItRuns). The Who decides roster, always open
   * (Roster, brief): every decider a card holding the kinds it decides by
   * name, each one's line in its tooltip, a press on a tile handing it to
   * another, a kind custom here wearing its own reset arrow. Then who marks
   * tasks done, as the view's one pick (PickTiles).
   *
   * Every hand-over, put-back and the review pick move at the press
   * (changes.ts `withAsked`): the tile flies to its new card at once; a
   * refusal flies it back and stands under it in the hub's words with Try
   * again (KindTile's RowFault), the review's under its tiles.
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
  import type { Fault } from "#lib/cawco/decides/decides.svelte.js";
  import Roster from "#lib/cawco/decides/Roster.svelte";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { IconAgent, IconEye } from "#lib/icons.js";
  import type { StageSends } from "./changes";
  import PickTiles from "./PickTiles.svelte";
  import { CHOICE_KINDS, type ChoiceKind, type Decider } from "./records";
  import { CARD_GROUP, GROUP_LABEL } from "./section-card";
  import { howItRunsWords as words } from "./words";

  let {
    record,
    refused,
    onchange,
    onretry,
    onreread,
  }: StageSends & {
    /** Re-read Who decides when its rule file could not be read. */
    onreread: () => void;
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

{#snippet reviewGlyph(choice: "review" | "agents")}
  {#if choice === "review"}
    <IconEye aria-hidden="true" class="size-icon-md text-ink-muted" />
  {:else}
    <IconAgent aria-hidden="true" class="size-icon-md text-ink-muted" />
  {/if}
{/snippet}

<!-- Who decides' roster as its page draws it, always open, then who marks
     tasks done; the rule file's fault over them both. -->
<div class="@container/deciders flex min-w-0 flex-col gap-space-4">
  {#if !record.whoDecides.ok}
    <RowFault
      again={onreread}
      againLabel={words.tryAgain}
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
    brief
    cols={DECIDERS_COLS}
    said={words.waits.roster}
  />

  <!-- Its own group in the section's card. -->
  <div class={CARD_GROUP}>
    <p class={GROUP_LABEL}>
      {words.waits.reviewHeading}
    </p>
    <PickTiles
      cols={2}
      disabled={!record.hubReachable}
      glyph={reviewGlyph}
      label={words.waits.reviewHeading}
      onpick={(next) => {
        if ((next === "review") !== record.reviewBeforeDone) {
          onchange({ key: "review", value: next === "review" });
        }
      }}
      options={[
        {
          id: "review",
          name: words.waits.reviewOn.name,
          note: words.waits.reviewOn.note,
        },
        {
          id: "agents",
          name: words.waits.reviewOff.name,
          note: words.waits.reviewOff.note,
        },
      ]}
      value={record.reviewBeforeDone ? "review" : "agents"}
    />
    <RowFault
      again={() => onretry("review")}
      againLabel={words.retryChange}
      reason={refused.review}
    />
  </div>
</div>
