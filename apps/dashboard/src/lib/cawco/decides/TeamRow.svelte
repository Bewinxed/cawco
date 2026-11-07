<script lang="ts">
  /**
   * Who decides' members, one chip each (its face and name), and Add an
   * agent last. A chip opens its member's card hung from it (MemberSheet):
   * what it runs on, its instructions and its record. A member that can't
   * be reached wears the attention dot, why in its tooltip; one whose card
   * was closed with changes unsaved says so in its name.
   */
  import { decidesWords } from "@cawco/core/words/decides";
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import { IconPlus } from "#lib/icons.js";
  import type { WhoDecides } from "./decides.svelte";
  import FaceChip from "./FaceChip.svelte";
  import Hung from "./Hung.svelte";
  import MemberSheet from "./MemberSheet.svelte";
  import { NEW } from "./setup.svelte";

  let {
    who,
    project,
    facts,
  }: {
    who: WhoDecides;
    /** The project's name; null on the fleet's page. */
    project: string | null;
    /** Why a member can't be reached now; null when it can. */
    facts: (id: string) => string | null;
  } = $props();

  const chips = $state<Record<string, HTMLElement | null>>({});
  const opened = (key: string) => who.setup?.from === key;
  const toggle = (key: string, open: boolean) => {
    if (open && !opened(key)) {
      who.openSetup(key);
      if (key === NEW && who.setup && who.setup.adding === null) {
        who.addAs("agent");
      }
    } else if (!open && opened(key)) {
      who.closeSetup();
    }
  };
</script>

{#snippet sheet()}
  {#if who.setup}
    <MemberSheet
      blocked={who.setup.key === NEW ? null : facts(who.setup.key)}
      {project}
      setup={who.setup}
      {who}
    />
  {/if}
{/snippet}

<ul
  aria-label={decidesWords.teamLabel}
  class="m-0 flex list-none flex-wrap gap-space-1 p-0"
>
  {#each who.members as member (member.id)}
    {@const why = facts(member.id)}
    {@const unsaved = who.parked[member.id] !== undefined}
    <li class="min-w-0">
      <Hung
        anchor={chips[member.id] ?? null}
        flush
        label={member.name}
        onopen={(open) => toggle(member.id, open)}
        open={opened(member.id)}
        width="var(--c-panel-w)"
      >
        {#snippet trigger(props)}
          <Tooltip.Root disabled={why === null && !unsaved}>
            <Tooltip.Trigger>
              {#snippet child({ props: tip })}
                <FaceChip
                  {...tip}
                  {...props}
                  aria-label={[
                    member.name,
                    why,
                    unsaved && decidesWords.unsaved,
                  ]
                    .filter(Boolean)
                    .join(". ")}
                  attention={why !== null}
                  bind:ref={chips[member.id]}
                  {member}
                  pressed={opened(member.id)}
                />
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content
              >{[why, unsaved && decidesWords.unsaved]
                .filter(Boolean)
                .join(". ")}</Tooltip.Content
            >
          </Tooltip.Root>
        {/snippet}
        {@render sheet()}
      </Hung>
    </li>
  {/each}
  <li>
    <Hung
      anchor={chips[NEW] ?? null}
      flush
      label={decidesWords.newAgent}
      onopen={(open) => toggle(NEW, open)}
      open={opened(NEW)}
      width="var(--c-panel-w)"
    >
      {#snippet trigger(props)}
        <button
          {...props}
          bind:this={chips[NEW]}
          class={[
            "mark-line flex items-center gap-space-2 rounded-lg py-space-1 ps-space-1 pe-space-3 text-ink-muted transition-control can-hover:hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid",
            opened(NEW) && "bg-surface-pressed",
          ]}
          type="button"
        >
          <span
            class="grid size-c-row-lead place-items-center rounded-sm border border-border-control border-dashed"
            data-box><IconPlus aria-hidden="true" class="size-icon-sm" /></span
          >
          <span class="type-label"
            >{who.parked[NEW]
              ? decidesWords.resume(who.parked[NEW].draft.name.trim())
              : decidesWords.addAgent}</span
          >
        </button>
      {/snippet}
      {@render sheet()}
    </Hung>
  </li>
</ul>
