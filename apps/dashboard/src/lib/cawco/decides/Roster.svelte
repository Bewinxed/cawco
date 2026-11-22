<script lang="ts">
  /**
   * Who decides' members as cards on one grid, each holding the kinds it
   * decides. A press on a kind's tile opens who it can go to in a popover
   * hung from that tile (KindTile): nothing on the page moves. A press on a
   * member hands it over, as dragging the tile onto that member's card does
   * (kind-dnd.svelte.ts): pressed, the tile flies to its new card once the
   * hub has written it; dragged, the ghost carries it there and the tile
   * stands in its place. The focus follows it. Props in, events out: what a
   * hand-over writes is its owner's.
   */
  import type { Kind, Member } from "@cawco/core/decides";
  import { decidesWords } from "@cawco/core/words/decides";
  import { tick } from "svelte";
  import { crossfade } from "svelte/transition";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconPen } from "#lib/icons.js";
  import {
    dur,
    easeOut,
    motionOk,
  } from "#lib/platform/motion/curves.svelte.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import AddCard from "./AddCard.svelte";
  import type { Facts, Fault, WhoDecides } from "./decides.svelte";
  import HandOver, { handOverWidth } from "./HandOver.svelte";
  import KindTile from "./KindTile.svelte";
  import { dragKind, kindDrag, memberDropTarget } from "./kind-dnd.svelte";
  import MemberCard from "./MemberCard.svelte";
  import { ROSTER_WORDS, type RosterWords } from "./roster-words";
  import SetupPopover from "./SetupPopover.svelte";
  import { NEW } from "./setup.svelte";

  let {
    members,
    kinds,
    routes,
    fleetRoutes,
    own,
    facts,
    project,
    asking,
    fault,
    handing = $bindable(null),
    onhand,
    onputback,
    who = null,
    said = ROSTER_WORDS,
    cols,
    brief = false,
  }: {
    /** Who decides' state, whose settings and Add a member open from the cards; null draws neither. */
    who?: WhoDecides | null;
    /** A write the hub has not answered: the kinds it moves, and what it does in words. */
    asking: { kinds: string[]; said: string } | null;
    /** Each member's facts line. */
    facts: (member: Member) => Facts | null;
    /** A write the hub refused. */
    fault: Fault | null;
    /** The fleet's member for each kind, by kind id. */
    fleetRoutes: Record<string, string>;
    /** The kind whose hand-over is open. */
    handing?: string | null;
    kinds: Kind[];
    members: Member[];
    /** Hands `kind` to `member`; answers whether it went. */
    onhand: (kind: string, member: string) => Promise<boolean>;
    /** Puts `kind` back on the fleet's choice; answers whether it went. */
    onputback: (kind: string) => Promise<boolean>;
    /** The kinds this project set itself. */
    own: string[];
    /** The project's name; null on the fleet's page. */
    project: string | null;
    /** This table's member for each kind, by kind id. */
    routes: Record<string, string>;
    /** Its parts' words: Who decides' unless the surface drawing it says its own. */
    said?: RosterWords;
    /** Its grid's columns as classes, where the surface lays its cards out its own way; none: as many a line as fit, four at most. */
    cols?: string;
    /**
     * Each member and kind by its name alone, its line (a member's job, a
     * kind's example) in the house tooltip, and no put-back of a kind's
     * own, the surface's head putting them all back (the project's
     * settings view).
     */
    brief?: boolean;
  } = $props();

  /** Each card, which its settings hang from and a dragged tile drops on. */
  const cards = $state<Record<string, HTMLElement | null>>({});

  /** Hands `kind` to `to`, from its tile's list or a drop on `to`'s card; answers whether it went. */
  function hand(kind: string, to: string): Promise<boolean> {
    handing = null;
    const went = onhand(kind, to);
    land(kind, went);
    return went;
  }

  // Every member's card takes a dragged tile, which hands its kind over.
  $effect(() => {
    const stops = members.flatMap((member) => {
      const node = cards[member.id];
      return node
        ? [
            memberDropTarget(
              () => member.id,
              (kind) => hand(kind, member.id)
            )(node),
          ]
        : [];
    });
    return () => {
      for (const stop of stops) {
        stop?.();
      }
    };
  });
  /** Members with settings: all but You and The agent. */
  const editable = (member: Member) =>
    member.type !== "you" && member.type !== "asker";
  const parkedNew = $derived(who?.parked[NEW]);

  const [send, receive] = crossfade({
    duration: () => (motionOk.current ? dur("--duration-morph") : 0),
    easing: easeOut,
  });
  /** A tile's flight between cards, but for one the drag's ghost carried there. */
  const leave = (node: Element, params: { key: string }) =>
    kindDrag.carried(params.key) ? { duration: 0 } : send(node, params);
  const arrive = (node: Element, params: { key: string }) =>
    kindDrag.carried(params.key) ? { duration: 0 } : receive(node, params);
  /** `member`'s tiles, with the slot a tile in the hand would stand in, in the kinds' order. */
  const shownOn = (member: string) => {
    const slot = kindDrag.slotIn(member);
    return kinds.filter(
      (kind) => routes[kind.id] === member || kind.id === slot?.kind
    );
  };

  /**
   * After a write moved `kind`, its tile in its new place takes the focus
   * where the focus was on its tile in the old place or fell to nothing:
   * the old one leaves inert as it flies (Svelte's outro), and is skipped.
   */
  const land = async (kind: string, went: Promise<boolean>) => {
    if (!(await went)) {
      return;
    }
    await tick();
    const at = document.activeElement;
    const wrap = (node: Element | null) =>
      node?.closest<HTMLElement>("[data-kind]") ?? null;
    if (
      at === null ||
      at === document.body ||
      wrap(at)?.dataset.kind === kind
    ) {
      const fresh = [
        ...document.querySelectorAll<HTMLElement>(
          `[data-kind="${CSS.escape(kind)}"]`
        ),
      ].find((one) => one !== wrap(at) && !one.closest("[inert]"));
      fresh
        ?.querySelector<HTMLElement>("[data-kind-press]")
        ?.focus({ preventScroll: true });
    }
  };
</script>

<div
  class={["grid gap-space-3", cols ?? "grid-cols-(--roster-cols)"]}
  style:--roster-cols={cols
    ? undefined
    : "repeat(auto-fill, minmax(max(min(100%, var(--spacing-c-roster-card-min)), calc((100% - 3 * var(--spacing-space-3)) / 4)), 1fr))"}
>
  {#each members as member (member.id)}
    {@const shown = shownOn(member.id)}
    {@const others = members.filter((one) => one.id !== member.id)}
    {#snippet tiles()}
      {#each shown as kind (kind.id)}
        {#if routes[kind.id] !== member.id}
          <!-- Where the tile in the hand will stand: its height, in its place. -->
          <div
            class="h-(--slot-h) rounded-well border border-dashed border-brand-solid bg-surface-hover"
            data-slot-for={kind.id}
            style:--slot-h="{kindDrag.slotIn(member.id)?.height ?? 0}px"
            in:unfold
            out:unfold={{ ms: kindDrag.carried(kind.id) ? 0 : undefined }}
          ></div>
        {:else}
          <div
            class={[
              "min-w-0 rounded-well data-lifted:outline-1 data-lifted:outline-dashed data-lifted:outline-border-control data-lifted:-outline-offset-1 data-lifted:[&>*]:invisible",
              kindDrag.carried(kind.id) &&
                !kindDrag.lifted(kind.id, member.id) &&
                "invisible",
            ]}
            data-kind={kind.id}
            data-lifted={kindDrag.lifted(kind.id, member.id) || undefined}
            in:arrive={{ key: kind.id }}
            out:leave={{ key: kind.id }}
            {@attach dragKind(() => ({
              kind: kind.id,
              from: member.id,
              held: !asking?.kinds.includes(kind.id),
            }))}
          >
            {#snippet list(headId: string)}
              <HandOver
                describe={brief}
                {said}
                fleetChoice={project === null ? null : fleetRoutes[kind.id]}
                {headId}
                {kind}
                members={others}
                onpick={(to) => {
                  document
                    .querySelector<HTMLElement>(
                      `[data-kind-press="${CSS.escape(kind.id)}"]`
                    )
                    ?.focus({ preventScroll: true });
                  hand(kind.id, to);
                }}
              />
            {/snippet}
            <KindTile
              {brief}
              asking={asking?.kinds.includes(kind.id) ? asking.said : null}
              fault={fault?.kinds.includes(kind.id) ? fault : null}
              fleetWho={members.find((one) => one.id === fleetRoutes[kind.id])}
              handing={handing === kind.id}
              holder={member}
              {kind}
              {list}
              onhanding={(open) => {
                if (open && asking !== null) {
                  return;
                }
                if (open) {
                  handing = kind.id;
                } else if (handing === kind.id) {
                  handing = null;
                }
              }}
              onputback={() => land(kind.id, onputback(kind.id))}
              own={own.includes(kind.id)}
              {project}
              {said}
              width={handOverWidth(others.length)}
            />
          </div>
        {/if}
      {/each}
    {/snippet}
    {#snippet pencil()}
      {#if who}
        <SetupPopover
          anchor={cards[member.id] ?? null}
          at={member.id}
          {project}
          {who}
        >
          {#snippet trigger(props)}
            <Button
              {...props}
              aria-label={decidesWords.edit(member.name)}
              class="-my-space-1"
              icon={IconPen}
              size="icon-sm"
              variant="ghost"
            />
          {/snippet}
        </SetupPopover>
      {/if}
    {/snippet}
    <MemberCard
      {brief}
      bind:card={cards[member.id]}
      editing={who?.setup?.from === member.id}
      facts={facts(member)}
      {member}
      over={kindDrag.over === member.id && kindDrag.slotIn(member.id) !== null}
      parked={who?.parked[member.id] !== undefined}
      pencil={who && editable(member) ? pencil : undefined}
      {project}
      {said}
      tiles={shown.length > 0 ? tiles : undefined}
    />
  {/each}
  {#if who}
    <SetupPopover anchor={cards[NEW] ?? null} at={NEW} {project} {who}>
      {#snippet trigger(props)}
        <AddCard
          bind:card={cards[NEW]}
          open={who.setup?.from === NEW}
          {props}
          resume={parkedNew ? parkedNew.draft.name.trim() : null}
        />
      {/snippet}
    </SetupPopover>
  {/if}
</div>
