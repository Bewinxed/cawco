<script lang="ts">
  /**
   * One delegate type Caw proposes in a setup draft, drawn on the stages'
   * own recipe (DraftColumn's band, hairline and head), so the draft reads
   * as one board: its mark and name, what runs it, its brief, and the stages
   * whose work it does. More holds Remove: the type is left out of the
   * setup, and the stages it did are left with no one, until it is added
   * back (DraftStages). Nothing here is written to the project.
   */
  import { setupPageWords } from "@cawco/core/words/onboarding";
  import type { SetupDelegate } from "#lib/cawco/project/setup-stage.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { IconMore, IconSubagent } from "#lib/icons.js";

  let {
    delegate,
    stages,
    onremove,
    moreId,
  }: {
    /** Its More's id: added back, the keys go to it. */
    moreId?: string;
    delegate: SetupDelegate;
    /** The names of the stages whose work it does. */
    stages: string[];
    onremove: () => void;
  } = $props();
  /** Remove was chosen: the menu closes onto nothing. */
  let removing = false;
</script>

<section
  aria-label={setupPageWords.draftDelegate(delegate.name)}
  class="flex min-w-0 flex-col gap-space-1 rounded-lg bg-surface-band p-space-1 inset-ring inset-ring-border-hairline"
  data-slot="draft-delegate"
  style:--words-x={"calc(var(--c-btn-h-sm) + var(--space-2) + var(--c-field-inline-inset))"}
>
  <header
    class="mark-line flex min-h-c-btn-h-sm items-center gap-space-2 pt-space-1"
  >
    <span
      aria-hidden="true"
      class="grid size-c-btn-h-sm flex-none place-items-center text-ink-muted"
      data-box><IconSubagent class="size-icon-md" /></span
    >
    <span
      class="min-w-0 flex-auto overflow-clip ps-c-field-inline-inset text-ellipsis whitespace-nowrap type-label text-ink-strong"
      >{delegate.name}</span
    >
    <span class="flex-none" data-box>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          aria-label={setupPageWords.moreFor(delegate.name)}
          class="flex-none"
          id={moreId}
          size="icon-sm"
          variant="ghost"
        >
          <IconMore />
        </DropdownMenu.Trigger>
        <!-- Removed, the tile is gone: DraftStages sends the keys to its Add
           back, so the menu gives them nowhere as it closes. -->
        <DropdownMenu.Content
          align="end"
          onCloseAutoFocus={(event) => {
            if (removing) {
              event.preventDefault();
            }
          }}
          width="regular"
        >
          <DropdownMenu.Item
            onSelect={() => {
              removing = true;
              onremove();
            }}
            variant="destructive"
          >
            <span>{setupPageWords.remove(delegate.name)}</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </span>
  </header>
  <!-- On its name's start: what runs it, its brief, the stages it does. -->
  <div
    class="flex min-w-0 flex-col gap-space-1 ps-(--words-x) pe-space-2 pb-space-2"
  >
    {#if delegate.runs}
      <span class="truncate type-meta text-ink-subtle">{delegate.runs}</span>
    {/if}
    {#if delegate.brief}
      <p class="m-0 type-meta text-pretty text-ink-muted">{delegate.brief}</p>
    {/if}
    {#if stages.length > 0}
      <p class="m-0 type-meta text-pretty text-ink-muted">
        {setupPageWords.delegateDoes(stages)}
      </p>
    {/if}
  </div>
</section>
