<script lang="ts">
  /**
   * The details card where it stands: hung from the head's place mark on a
   * desk, the kit's bottom sheet on a phone at full height while a step
   * stands (DetailsHang), the card (DetailsCard) fed and answered by its
   * source.
   */
  import { MediaQuery } from "svelte/reactivity";
  import { PHONE_QUERY } from "#lib/hooks/is-mobile.svelte.js";
  import DetailsCard from "./DetailsCard.svelte";
  import DetailsHang from "./DetailsHang.svelte";
  import type { CardSource } from "./details";
  import { stepTitle } from "./step-title";

  let {
    source,
    anchor,
    open = $bindable(false),
  }: {
    source: CardSource;
    /** The head's place mark it hangs from. */
    anchor: HTMLElement | null;
    open?: boolean;
  } = $props();

  const narrow = new MediaQuery(PHONE_QUERY);
</script>

<DetailsHang
  {anchor}
  full={source.step !== null}
  phone={narrow.current}
  title={stepTitle(source.step)}
  bind:open
>
  <DetailsCard
    acts={source.acts}
    details={source.details}
    fleet={source.fleet}
    folderFacts={source.folderFacts}
    bind:opened={source.opened}
    pending={source.pending}
    phone={narrow.current}
    step={source.step}
    taskFacts={source.taskFacts}
  />
</DetailsHang>
