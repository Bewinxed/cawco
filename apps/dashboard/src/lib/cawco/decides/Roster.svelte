<script lang="ts">
  /**
   * Who decides' members as cards on one grid, each holding the kinds it
   * decides. A press on a kind's tile opens who it can go to in the one slot
   * under that card's line, joined to the card; a press on a member hands it
   * over, a press elsewhere or Escape closes it and still lands. Props in,
   * events out: what a hand-over writes is its owner's.
   */
  import { bringIntoView } from "@cawco/core/bring-into-view";
  import type { Kind, Member } from "@cawco/core/decides";
  import { decidesWords } from "@cawco/core/words/decides";
  import { untrack } from "svelte";
  import { crossfade } from "svelte/transition";
  import { frameObserver } from "../frame-observer";
  import { dur, easeOut, motionOk } from "../motion/curves.svelte";
  import HandOver from "./HandOver.svelte";
  import KindTile from "./KindTile.svelte";
  import MemberCard from "./MemberCard.svelte";
  import Slot, { type SlotPlacement } from "./Slot.svelte";

  let {
    members,
    kinds,
    routes,
    fleetRoutes,
    facts,
    project,
    placement = "card",
    handing: openFirst = null,
    onhand,
    onputback,
  }: {
    /** Each member's facts line, by member id. */
    facts: Record<string, string>;
    /** The fleet's member for each kind, by kind id. */
    fleetRoutes: Record<string, string>;
    /** A hand-over open from the start. */
    handing?: string | null;
    kinds: Kind[];
    members: Member[];
    onhand: (kind: string, member: string) => void;
    onputback: (kind: string) => void;
    /** Where the list opens under the pressed card. */
    placement?: SlotPlacement;
    project: string;
    /** This table's member for each kind, by kind id. */
    routes: Record<string, string>;
  } = $props();

  let handing = $state(untrack(() => openFirst));
  /** The press that opened it, to give focus back on Escape. */
  let pressed: HTMLElement | null = null;
  let cols = $state(1);
  const listId = "who-decides-handover";

  /** The grid's columns, as many as fit: read from the grid itself. */
  function measure(grid: HTMLElement) {
    const read = () => {
      cols = getComputedStyle(grid).gridTemplateColumns.split(" ").length;
    };
    read();
    const watch = frameObserver(read);
    watch.observe(grid);
    return () => watch.disconnect();
  }

  const held = $derived(handing === null ? undefined : routes[handing]);
  const heldAt = $derived(members.findIndex((one) => one.id === held));
  /** The pressed card's column, and the last card of its line, after which the slot stands. */
  const at = $derived(
    heldAt < 0
      ? null
      : {
          col: heldAt % cols,
          end: Math.min(
            members.length - 1,
            (Math.floor(heldAt / cols) + 1) * cols - 1
          ),
        }
  );
  const heldKind = $derived(kinds.find((one) => one.id === handing));
  const others = $derived(members.filter((one) => one.id !== held));

  const memberNamed = (id: string | undefined): Member =>
    members.find((one) => one.id === id) ?? members[0];
  const kindsOf = (member: string) =>
    kinds.filter((kind) => routes[kind.id] === member);

  const [send, receive] = crossfade({
    duration: () => (motionOk.current ? dur("--dur-morph") : 0),
    easing: easeOut,
  });

  const press = (kind: string, from: HTMLElement) => {
    pressed = from;
    handing = handing === kind ? null : kind;
  };

  /** A press outside the list and the tiles closes it, and lands where it lands. */
  const pressElsewhere = (event: MouseEvent) => {
    const { target } = event;
    if (
      handing !== null &&
      target instanceof Element &&
      !target.closest(`[data-slot="handover"], [data-kind-press]`)
    ) {
      handing = null;
    }
  };

  const key = (event: KeyboardEvent) => {
    if (event.key === "Escape" && handing !== null) {
      handing = null;
      pressed?.focus();
    }
  };

  /** Opened by a press, not at the start: its list comes into view and takes the keyboard. */
  let first = true;
  $effect(() => {
    if (handing === null) {
      first = false;
      return;
    }
    if (first) {
      first = false;
      return;
    }
    const list = document.getElementById(listId);
    if (list) {
      bringIntoView(list);
      list.focus({ preventScroll: true });
    }
  });
</script>

<svelte:document onclickcapture={pressElsewhere} onkeydown={key} />

<div
  class="grid grid-cols-(--roster-cols) gap-space-3"
  style:--roster-cols={"repeat(auto-fill, minmax(max(min(100%, var(--c-roster-card-min)), calc((100% - 3 * var(--space-3)) / 4)), 1fr))"}
  {@attach measure}
>
  {#each members as member, index (member.id)}
    {@const holds = kindsOf(member.id)}
    {#snippet tiles()}
      {#each holds as kind (kind.id)}
        <div in:receive={{ key: kind.id }} out:send={{ key: kind.id }}>
          <KindTile
            fleetWho={memberNamed(fleetRoutes[kind.id])}
            handing={handing === kind.id}
            holder={member}
            {kind}
            {listId}
            onhand={(from) => press(kind.id, from)}
            onputback={() => onputback(kind.id)}
            own={routes[kind.id] !== fleetRoutes[kind.id]}
            {project}
          />
        </div>
      {/each}
    {/snippet}
    <MemberCard
      facts={facts[member.id] ?? null}
      joined={heldAt === index}
      {member}
      {project}
      tiles={holds.length > 0 ? tiles : undefined}
    />
    {#if at && at.end === index && heldKind}
      <Slot
        col={at.col}
        {cols}
        id={listId}
        label={decidesWords.handTo(heldKind.name)}
        {placement}
      >
        <HandOver
          fleetChoice={fleetRoutes[heldKind.id]}
          kind={heldKind}
          members={others}
          onpick={(to) => {
            onhand(heldKind.id, to);
            handing = null;
          }}
        />
      </Slot>
    {/if}
  {/each}
</div>
