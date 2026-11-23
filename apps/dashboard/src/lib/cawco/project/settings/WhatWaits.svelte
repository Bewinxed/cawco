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
   * fleet's defaults (SettingsView). The Who decides roster, always open
   * (Roster, brief): every decider a card holding the kinds it decides by
   * name, each one's line in its tooltip, a press on a tile handing it to
   * another, a kind custom here wearing its own reset arrow. Marking tasks
   * done is one of its kinds (core decides.ts `done`): on You, only you
   * move a task to done.
   *
   * Every hand-over and put-back moves at the press (changes.ts
   * `withAsked`): the tile flies to its new card at once; a refusal flies
   * it back and stands under it in the hub's words with Try again
   * (KindTile's RowFault).
   *
   * A rule file that doesn't read stands over the roster with the hub's
   * words and Try again: every choice is the person's until it reads.
   */
  import { BUILT_IN, type Kind, type Member } from "@cawco/core/decides";
  import { settingsViewWords as words } from "@cawco/core/words/settings-view";
  import type { Fault } from "#lib/cawco/decides/decides.svelte.js";
  import Roster from "#lib/cawco/decides/Roster.svelte";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import type { StageSends } from "./changes";

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

  /** The built-in members as this view names them; one he added keeps its own words. */
  const MEMBER_WORDS: Partial<Record<string, { name: string; job: string }>> =
    words.waits.members;
  /** The built-in kinds as this view names them; one he added keeps its own words. */
  const KIND_WORDS: Partial<Record<string, { name: string; example: string }>> =
    words.waits.kinds;

  const read = $derived(record.whoDecides);
  /** Everyone who can settle a kind here, in this view's words; the asker settles nothing a project hands it. */
  const members = $derived<Member[]>(
    read.members
      .filter((member) => member.id !== BUILT_IN.asker.id)
      .map((member) => {
        const said = MEMBER_WORDS[member.id];
        return said && member.builtIn
          ? { ...member, name: said.name, job: said.job }
          : member;
      })
  );
  const kinds = $derived<Kind[]>(
    read.kinds.map((kind) => {
      const said = KIND_WORDS[kind.id];
      return said && kind.builtIn
        ? { ...kind, name: said.name, example: said.example }
        : kind;
    })
  );

  /** The kind whose hand-over stands open. */
  let handing = $state<string | null>(null);

  const unread = $derived(read.unread !== null);
  /** Each kind's decider; with the rule file unread, every kind is the person's (as Who decides draws it). */
  const routes = $derived(
    Object.fromEntries(
      kinds.map((kind) => [
        kind.id,
        unread ? BUILT_IN.you.id : (read.rules[kind.id]?.by ?? BUILT_IN.you.id),
      ])
    )
  );
  const fleetRoutes = $derived(
    Object.fromEntries(
      kinds.map((kind) => [
        kind.id,
        read.rules[kind.id]?.fleet ?? BUILT_IN.you.id,
      ])
    )
  );
  const own = $derived(
    unread
      ? []
      : kinds.filter((kind) => read.rules[kind.id]?.own).map((kind) => kind.id)
  );

  const isKind = (id: string): boolean => kinds.some((one) => one.id === id);
  const isMember = (id: string): boolean =>
    members.some((one) => one.id === id);

  /** The first refused hand-over or put-back, as the roster stands it under its tile. */
  const fault = $derived.by((): Fault | null => {
    for (const kind of kinds) {
      const reason = refused[`decides.${kind.id}`];
      if (reason) {
        return {
          kinds: [kind.id],
          reason,
          again: () => {
            onretry(`decides.${kind.id}`);
            return Promise.resolve(true);
          },
        };
      }
    }
    return null;
  });

  function hand(kind: string, member: string): Promise<boolean> {
    if (unread || !(isKind(kind) && isMember(member))) {
      return Promise.resolve(false);
    }
    onchange({ key: "decides", kind, value: member });
    return Promise.resolve(true);
  }

  function putBack(kind: string): Promise<boolean> {
    if (unread || !isKind(kind)) {
      return Promise.resolve(false);
    }
    onchange({ key: "decidesReset", kind });
    return Promise.resolve(true);
  }
</script>

<!-- Who decides' roster as its page draws it, always open, marking tasks
     done one of its kinds; the rule file's fault over it. -->
<div class="@container/deciders flex min-w-0 flex-col gap-space-4">
  {#if read.unread !== null}
    <RowFault
      again={onreread}
      againLabel={words.tryAgain}
      details={read.unread}
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
