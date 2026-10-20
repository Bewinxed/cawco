<script lang="ts">
  /**
   * WHAT NEEDS YOU, FIRST (proposal, One list and Lanes): a short head
   * above the plan naming each delegate that waits on the person or has
   * failed, so the first rows answer "does anything need me?" whatever the
   * plan's order puts lower down. Each row points at the delegate's own row
   * (scrolls it in and lights it). Crew first's stack leads with these
   * already, so it draws none.
   */
  import SessionMark from "#lib/cawco/SessionMark.svelte";
  import { ROWS } from "./classes";
  import type { Delegate } from "./fixtures";
  import { pointAt, useView } from "./view.svelte";

  let { delegates }: { delegates: Delegate[] } = $props();

  const view = useView();
  const uid = $props.id();
  const needs = $derived(
    delegates.filter((one) => one.status === "attn" || one.status === "fail")
  );
  const said = (one: Delegate): string =>
    one.status === "attn"
      ? `${one.name} is waiting on you`
      : `${one.name} failed: ${one.wait?.words ?? "its report says why"}`;
</script>

{#if needs.length > 0}
  <section
    aria-labelledby="needs-{uid}"
    class="mb-space-2 flex flex-col gap-space-1 border-b border-border-hairline pb-space-2"
    data-slot="needs-you"
  >
    <h3
      class="mark-line m-0 flex items-baseline gap-space-2 type-label font-normal text-ink-muted"
      id="needs-{uid}"
    >
      <span>Needs you</span>
      <span class="num type-meta" data-num>{needs.length}</span>
    </h3>
    <ul class={[ROWS, "gap-space-row"]}>
      {#each needs as one (one.id)}
        <li>
          <button
            class="mark-line press-tint focus-inset grid w-full grid-cols-(--pv-cols-narrow) items-start gap-x-space-2 min-h-c-row-lead rounded-xs py-c-plan-row-pad type-label text-start text-ink-strong transition-[background-color] duration-(--dur-control) ease-out hover:bg-surface-hover in-data-coarse:min-h-c-touch-floor in-data-coarse:py-c-plan-row-pad-coarse"
            data-kind={one.status}
            data-needs={one.id}
            onclick={(event) => pointAt(view, event.currentTarget, one.id)}
            type="button"
          >
            <span class="grid h-(--pv-lead-h) place-items-center" data-box
              ><SessionMark
                id={one.id}
                place={one.place}
                status={one.status}
              /></span
            >
            <span
              class={[
                "min-w-0 wrap-anywhere text-pretty",
                one.status === "attn" && "text-status-attn-ink",
                one.status === "fail" && "text-status-fail-ink",
              ]}>{said(one)}</span
            >
          </button>
        </li>
      {/each}
    </ul>
  </section>
{/if}
