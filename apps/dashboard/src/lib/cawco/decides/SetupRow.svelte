<script lang="ts">
  /**
   * One row of a member's settings (build spec §3.3), or a step of Add a
   * kind (§3.6); its host is the `member-setup` container. Folded: its label in
   * the label column, its value on one line, clipped, and Change at the end;
   * where the settings stand under 560px wide, the label stands over the
   * value and Change spans both. Open: the label strong over its fields,
   * which unfold. A read-only row shows what is and has no Change.
   */
  import { decidesWords } from "@cawco/core/words/decides";
  import type { Snippet } from "svelte";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";

  let {
    id,
    label,
    value,
    open,
    readOnly = false,
    problem = false,
    onopen,
    children,
  }: {
    /** Its row's id (setup.svelte `RowId`, kinds.svelte `KindStep`). */
    id: string;
    label: string;
    /** Its value in a line, while folded. */
    value: string;
    open: boolean;
    readOnly?: boolean;
    /** A problem stands in it: the folded value says so in the error ink. */
    problem?: boolean;
    onopen: () => void;
    /** Its fields, while open; a read-only row's whole value. */
    children: Snippet;
  } = $props();

  const uid = $props.id();
</script>

<section
  aria-labelledby="{uid}-label"
  class="min-w-0 border-b border-border-hairline py-space-3 last:border-b-0"
  data-row={id}
  style:--row-open="calc(var(--spacing) * 36) minmax(0, 1fr)"
  style:--row-folded="calc(var(--spacing) * 36) minmax(0, 1fr) auto"
  style:--row-narrow="minmax(0, 1fr) auto"
>
  {#if open || readOnly}
    <div
      class="grid min-w-0 grid-cols-(--row-open) gap-x-space-3 gap-y-space-2 @max-member-setup/member-setup:grid-cols-1"
    >
      <h3
        class={[
          "m-0 type-label",
          open ? "font-medium text-ink-strong" : "text-ink-muted",
        ]}
        id="{uid}-label"
      >
        {label}
      </h3>
      <div class="flex min-w-0 flex-col gap-space-3" transition:unfold>
        {@render children()}
      </div>
    </div>
  {:else}
    <div
      class="grid min-w-0 grid-cols-(--row-folded) items-center gap-x-space-3 gap-y-space-1 @max-member-setup/member-setup:grid-cols-(--row-narrow)"
    >
      <h3
        class="m-0 type-label text-ink-muted @max-member-setup/member-setup:col-start-1"
        id="{uid}-label"
      >
        {label}
      </h3>
      <p
        class={[
          "m-0 min-w-0 truncate type-label @max-member-setup/member-setup:col-start-1 @max-member-setup/member-setup:row-start-2",
          problem ? "text-status-fail-ink" : "text-ink-strong",
        ]}
      >
        {value}
      </p>
      <Button
        aria-label={decidesWords.changeRow(label)}
        class="@max-member-setup/member-setup:col-start-2 @max-member-setup/member-setup:row-span-2 @max-member-setup/member-setup:row-start-1 @max-member-setup/member-setup:self-center"
        label={decidesWords.change}
        onclick={onopen}
        size="sm"
        variant="ghost"
      />
    </div>
  {/if}
</section>
