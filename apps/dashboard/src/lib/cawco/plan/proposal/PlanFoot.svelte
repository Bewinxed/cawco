<script lang="ts">
  /**
   * The plan's foot, the same in every variation: add a to-do, the way to
   * the whole graph on the project canvas, and the spec folded after the
   * steps on the same accordion as a step.
   */
  import MessageBody from "#lib/cawco/MessageBody.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconChevronRight, IconPlus } from "#lib/icons.js";
  import { CHEVRON } from "./classes";
  import Fold from "./Fold.svelte";
  import type { PlanFixture, Step } from "./fixtures";
  import { useView } from "./view.svelte";

  let { plan }: { plan: PlanFixture } = $props();

  const view = useView();
  const open = $derived(view.opened.has("spec"));
  const uid = $props.id();
  let adding = $state(false);
  let draft = $state("");

  /** A new to-do at the plan's foot, told to the task's live attempt. */
  function add(): void {
    const words = draft.trim();
    if (words) {
      const step: Step = {
        id: `new-${Date.now()}`,
        words,
        short: words,
        description: "Added by you.",
        state: "todo",
      };
      view.added.push(step);
      view.tell(step, "added");
    }
    draft = "";
    adding = false;
  }
</script>

<div class="mt-space-1 flex flex-wrap items-center justify-between gap-space-2">
  {#if adding}
    <form
      class="flex min-w-0 flex-auto items-center gap-space-2"
      onsubmit={(event) => {
        event.preventDefault();
        add();
      }}
    >
      <label class="sr-only" for="new-{uid}">The new to-do</label>
      <input
        bind:value={draft}
        class="focus-inset min-h-c-row-lead min-w-0 flex-auto rounded-sm border border-border-control bg-surface-raised px-space-2 py-space-1 type-body text-ink-strong in-data-coarse:min-h-c-touch-floor"
        id="new-{uid}"
        onkeydown={(event) => {
          if (event.key === "Escape") {
            adding = false;
          }
        }}
        placeholder="What to do"
      />
      <Button size="xs" type="submit">Add</Button>
    </form>
  {:else}
    <button
      class="pressable touch-hit mark-line inline-flex min-h-c-row-lead items-center gap-space-2 rounded-xs p-0 type-label font-normal text-ink-muted transition-[color] duration-(--dur-control) ease-out hover:text-ink-strong in-data-coarse:min-h-c-touch-floor [&_svg]:h-icon-md [&_svg]:w-(--pv-tile)"
      onclick={() => {
        adding = true;
      }}
      type="button"
    >
      <IconPlus aria-hidden="true" />
      <span>Add a to-do</span>
    </button>
  {/if}
  <!-- Its ink on the foot's trailing edge: the link hangs past it by its
       own inline padding (DESIGN.md, the row's trailing edge is drawn in
       ink). -->
  <Button class="-me-space-3" label="Open in canvas" size="sm" variant="link" />
</div>
<section class="mt-space-3 border-t border-border-hairline pt-space-2">
  <button
    aria-controls="spec-{uid}"
    aria-expanded={open}
    class="mark-line focus-inset flex min-h-space-8 w-full items-center gap-space-1 rounded-xs p-0 type-label text-start text-ink-strong in-data-coarse:min-h-c-touch-floor"
    onclick={() => view.toggle("spec")}
    type="button"
  >
    <span>Spec</span>
    <span class="type-meta text-ink-muted">· written {plan.spec.ago}</span>
    <span
      aria-hidden="true"
      class={[CHEVRON, "ms-auto"]}
      data-box
      data-open={open || undefined}><IconChevronRight /></span
    >
  </button>
  <Fold id="spec-{uid}" {open}>
    <div
      class="pt-space-1 pb-space-3 [&_li]:marker:text-ink-muted"
      data-slot="spec-body"
    >
      <MessageBody source={plan.spec.markdown} />
    </div>
  </Fold>
</section>
