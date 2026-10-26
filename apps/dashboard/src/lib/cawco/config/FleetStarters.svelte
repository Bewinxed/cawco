<script lang="ts" module>
  /** A ready-made one, by its title. */
  export interface Starter {
    title: string;
  }
</script>

<script generics="S extends Starter" lang="ts">
  /**
   * A fleet list with nothing in it yet (Hooks, Rules): its one action asks
   * a new session for one (The Empty Starts Work Rule); with no machine
   * online it says why, the starters and "Or write one from scratch" under
   * it being the way by hand. Each starter's Add is pending on its row and,
   * refused, said under it (row-acts.svelte.ts).
   */
  import type { Component } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import EmptyAsk from "../EmptyAsk.svelte";
  import {
    askLabel,
    askNewSession,
    EMPTY_LINES,
    FLEET_ASKS,
    NO_SESSION_CAN_START,
    sessionCanStart,
  } from "../empty-asks";
  import RowFault from "../RowFault.svelte";
  import RowList from "./RowList.svelte";
  import type { RowActs } from "./row-acts.svelte";
  import SectionRow from "./SectionRow.svelte";
  import type { ConfigSection } from "./sections";

  let {
    kind,
    title,
    label,
    starters,
    meta,
    add,
    acts,
    section,
    icon,
  }: {
    kind: "hooks" | "rules";
    /** The empty state's title. */
    title: string;
    /** The starters' list's name. */
    label: string;
    starters: readonly S[];
    /** A starter's line under its name. */
    meta: (starter: S) => string;
    /** Saves a starter and puts its new row, marked, in the list. */
    add: (starter: S) => Promise<void>;
    acts: Pick<RowActs<never>, "seed" | "seedFailed" | "seeding">;
    /** The page's section: its glyph heads the empty state, its hue the rows. */
    section: ConfigSection;
    /** A starter's row's glyph. */
    icon: Component;
  } = $props();

  const seed = (starter: S) => acts.seed(starter.title, () => add(starter));
</script>

<EmptyState
  icon={section.icon}
  line={EMPTY_LINES.starters(kind, sessionCanStart())}
  {title}
>
  {#snippet action()}
    <EmptyAsk
      canStart={sessionCanStart()}
      label={askLabel(FLEET_ASKS[kind].what)}
      onask={(anchor) => askNewSession(FLEET_ASKS[kind].words, anchor)}
      reason={NO_SESSION_CAN_START}
    />
  {/snippet}
</EmptyState>
<RowList {label}>
  {#each starters as starter (starter.title)}
    <SectionRow
      hue={section.hue}
      {icon}
      meta={meta(starter)}
      name={starter.title}
    >
      {#snippet trailing()}
        <Button
          disabled={acts.seeding !== null && acts.seeding !== starter.title}
          failed={acts.seedFailed?.title === starter.title}
          label="Add"
          onclick={() => seed(starter)}
          pending={acts.seeding === starter.title}
          pendingLabel="Adding…"
          size="sm"
          variant="outline"
        />
      {/snippet}
      {#snippet below()}
        <RowFault
          again={() => seed(starter)}
          reason={acts.seedFailed?.title === starter.title
            ? acts.seedFailed.reason
            : null}
        />
      {/snippet}
    </SectionRow>
  {/each}
</RowList>
<div>
  <Button href="/config/{kind}/new" variant="outline">
    Or write one from scratch
  </Button>
</div>
