<script lang="ts">
  /**
   * Who decides' members as cards on one grid, each holding the kinds it
   * decides. A press on a kind's tile opens who it can go to in a popover
   * hung from that tile (KindTile): nothing on the page moves. A press on a
   * member hands it over; the tile flies to its new card once the hub has
   * written it, and the focus follows it there. Props in, events out: what a
   * hand-over writes is its owner's.
   */
  import type { Kind, Member } from "@cawco/core/decides";
  import { tick } from "svelte";
  import { crossfade } from "svelte/transition";
  import { dur, easeOut, motionOk } from "../motion/curves.svelte";
  import type { Facts, Fault } from "./decides.svelte";
  import HandOver, { handOverWidth } from "./HandOver.svelte";
  import KindTile from "./KindTile.svelte";
  import MemberCard from "./MemberCard.svelte";

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
  }: {
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
  } = $props();

  const kindsOf = (member: string) =>
    kinds.filter((kind) => routes[kind.id] === member);

  const [send, receive] = crossfade({
    duration: () => (motionOk.current ? dur("--dur-morph") : 0),
    easing: easeOut,
  });

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
  class="grid grid-cols-(--roster-cols) gap-space-3"
  style:--roster-cols={"repeat(auto-fill, minmax(max(min(100%, var(--c-roster-card-min)), calc((100% - 3 * var(--space-3)) / 4)), 1fr))"}
>
  {#each members as member (member.id)}
    {@const holds = kindsOf(member.id)}
    {@const others = members.filter((one) => one.id !== member.id)}
    {#snippet tiles()}
      {#each holds as kind (kind.id)}
        <div
          class="min-w-0"
          data-kind={kind.id}
          in:receive={{ key: kind.id }}
          out:send={{ key: kind.id }}
        >
          {#snippet list(headId: string)}
            <HandOver
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
                handing = null;
                land(kind.id, onhand(kind.id, to));
              }}
            />
          {/snippet}
          <KindTile
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
            width={handOverWidth(others.length)}
          />
        </div>
      {/each}
    {/snippet}
    <MemberCard
      facts={facts(member)}
      {member}
      {project}
      tiles={holds.length > 0 ? tiles : undefined}
    />
  {/each}
</div>
