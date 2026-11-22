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
   * another, a kind custom here wearing its own reset arrow. Marking tasks
   * done is one of its kinds, standing on the project's review setting.
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
  import type { StageSends } from "./changes";
  import { CHOICE_KINDS, type ChoiceKind, type Decider } from "./records";
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
  /**
   * Marking tasks done, one more kind on the roster: on You a finished task
   * waits in a review column for you; on anyone else agents mark their own
   * done. It stands on the project's review setting (`reviewBeforeDone`),
   * which flips as it moves on or off You; the fleet's choice is You.
   */
  const DONE = "done";
  /** The kinds as the tiles name them, in this view's words, marking tasks done last. */
  const kinds: Kind[] = [
    ...CHOICE_KINDS.flatMap((id) => {
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
    }),
    {
      id: DONE,
      name: words.waits.doneKind.name,
      example: words.waits.doneKind.example,
      builtIn: true,
      position: CHOICE_KINDS.length,
    },
  ];
  /** Who marks tasks done while agents do: the member it was last handed to off You. */
  let doneBy = $state<Decider>("caw");

  /** The kind whose hand-over stands open. */
  let handing = $state<string | null>(null);

  const rules = $derived(record.whoDecides.ok ? record.whoDecides.rules : null);
  /** Each kind's decider; with the rule file unread, every kind is the person's (as Who decides draws it). */
  const routes = $derived({
    ...Object.fromEntries(
      CHOICE_KINDS.map((kind) => [
        kind,
        rules === null ? "you" : rules[kind].by,
      ])
    ),
    [DONE]: record.reviewBeforeDone ? "you" : doneBy,
  });
  const fleetRoutes = $derived({
    ...Object.fromEntries(
      CHOICE_KINDS.map((kind) => [
        kind,
        rules === null ? "you" : rules[kind].fleet,
      ])
    ),
    [DONE]: "you",
  });
  const own = $derived([
    ...(rules === null ? [] : CHOICE_KINDS.filter((kind) => rules[kind].own)),
    ...(record.reviewBeforeDone ? [] : [DONE]),
  ]);

  const isKind = (id: string): id is ChoiceKind =>
    CHOICE_KINDS.some((one) => one === id);
  const isDecider = (id: string): id is Decider =>
    DECIDERS.some((one) => one === id);

  /** The first refused hand-over or put-back, as the roster stands it under its tile. */
  const fault = $derived.by((): Fault | null => {
    if (refused.review) {
      return {
        kinds: [DONE],
        reason: refused.review,
        again: () => {
          onretry("review");
          return Promise.resolve(true);
        },
      };
    }
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
    if (kind === DONE && isDecider(member)) {
      if (member !== "you") {
        doneBy = member;
      }
      if ((member === "you") !== record.reviewBeforeDone) {
        onchange({ key: "review", value: member === "you" });
      }
      return Promise.resolve(true);
    }
    if (rules === null || !(isKind(kind) && isDecider(member))) {
      return Promise.resolve(false);
    }
    onchange({ key: "decides", kind, value: member });
    return Promise.resolve(true);
  }

  function putBack(kind: string): Promise<boolean> {
    if (kind === DONE) {
      onchange({ key: "review", value: true });
      return Promise.resolve(true);
    }
    if (rules === null || !isKind(kind)) {
      return Promise.resolve(false);
    }
    onchange({ key: "decidesReset", kind });
    return Promise.resolve(true);
  }
</script>

<!-- Who decides' roster as its page draws it, always open, marking tasks
     done one of its kinds; the rule file's fault over it. -->
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
</div>
