<script lang="ts">
  /**
   * The project details card in each situation of my reading, as the
   * project page holds it: the project's head as it ships (ProjectHead, its
   * own card kept shut) and the card hung from its place mark
   * (DetailsHang), or the bottom sheet on a phone, fed one product-shaped
   * project from records.ts. A
   * press on the place mark opens and closes the card; every press in the
   * card is answered by the mock hub (mock-hub.svelte.ts) after a hub's
   * wait, with a yes or with a refusal (`answer`).
   *
   * `situation` is what the hub says of the project as the card opens,
   * `view` where the card stands (a folder's acts open, a step), `again`
   * starts it over at the person's press. The mock hub is made anew from
   * them, so the args set where it starts and the presses carry it on.
   */
  import { CawLead } from "#lib/cawco/project/caw-lead.svelte.js";
  import ProjectHead from "#lib/cawco/project/ProjectHead.svelte";
  import { provideHangLayer } from "#lib/components/ui/hang-card/hang-layer.js";
  import HungDetails from "./HungDetails.svelte";
  import { type Answer, MockHub, type View } from "./mock-hub.svelte";
  import { MACHINES, PROJECT, type Situation } from "./records";

  let {
    situation = "all-well",
    view = "card",
    answer = "yes",
    open = true,
    again = 0,
  }: {
    situation?: Situation;
    view?: View;
    answer?: Answer;
    /** The card stands open as the story opens. */
    open?: boolean;
    /** Starts it over: counts the person's presses of Start again. */
    again?: number;
  } = $props();

  const lead = new CawLead({
    id: () => PROJECT.id,
    machinesOnline: () => true,
    project: () => PROJECT,
    reading: () => false,
    tasks: () => [],
  });
  /** The layer the card hangs in: this frame's own box, as the Shell gives the app's. */
  const layerId = $props.id();
  const layer = provideHangLayer(layerId);

  /** What the hub holds, made anew whenever the args name another start. */
  const hub = $derived(new MockHub(situation, view, () => answer, open, again));
  $effect(() => {
    const made = hub;
    return () => made.dispose();
  });

  let shell = $state<HTMLElement | null>(null);
  const mark = $derived(
    shell?.querySelector<HTMLElement>("[data-place-line]") ?? null
  );

  /**
   * The place mark opens this card in place of the head's own tray: its
   * press is taken here, before the head hears it.
   */
  function onMark(event: MouseEvent): void {
    if (
      event.target instanceof Element &&
      event.target.closest("[data-place-line]")
    ) {
      event.stopPropagation();
      hub.open = !hub.open;
    }
  }

  $effect(() => {
    mark?.setAttribute("aria-expanded", String(hub.open));
  });
</script>

<div
  bind:this={shell}
  class="@container/shell relative flex min-h-dvh w-full flex-col bg-surface-recess contain-layout"
  data-details-live
  data-hang-layer={layer.id}
  onclickcapture={onMark}
>
  <ProjectHead
    {lead}
    machine={MACHINES[0] ?? null}
    onask={null}
    onfilter={() => undefined}
    onnewtask={null}
    project={PROJECT}
    seated={false}
    setup={null}
  />
  <HungDetails anchor={mark} bind:open={hub.open} source={hub} />
</div>
