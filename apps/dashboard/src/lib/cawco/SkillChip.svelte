<script lang="ts">
  /**
   * A skill named in a message (`/name`, skill-chips.ts), drawn as its
   * chip: the inline chip (ui/chip `inline`) with the skill's glyph, the
   * suggestion chips' own, and its name. Drawn in the transcript (the
   * markdown's code spans) and in the composer while it is written
   * (MentionField), the same chip in both.
   *
   * In the transcript it is a button: pressing it opens the house hover
   * panel beside it (chip-panel.svelte.ts) with the skill's description and
   * where it came from. In the composer (`field`) it is one atom of the
   * message, sent as exactly `/name`: the field's own tip says the same on
   * hover or press, from the chip's `data-tip` and `data-handle`.
   *
   * Copied, it is what it stands for, `/name`, in both: the field writes
   * its own string, and a copy reaching past the field reads the chip's
   * `data-copies` (chip-copy.ts).
   */
  import { Portal } from "bits-ui";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { IconToolSkill } from "#lib/icons.js";
  import { copyChips } from "./chip-copy";
  import { ChipPanel } from "./chip-panel.svelte";
  import HoverPanel from "./HoverPanel.svelte";
  import { type Skill, sourceWords } from "./skill-chips";

  let {
    skill,
    field = false,
  }: {
    skill: Skill;
    /** An atom of the composer's field, not a control of its own. */
    field?: boolean;
  } = $props();

  const panelId = $props.id();
  const panel = new ChipPanel(panelId);
  const said = $derived(`/${skill.name}`);
  const facts = $derived(
    [skill.description, sourceWords(skill)].filter(Boolean).join(" · ")
  );
  copyChips();
</script>

{#if field}
  <span
    aria-label={`${skill.name}, ${sourceWords(skill)}`}
    class={chipVariants({
      variant: "inline",
      class: "cursor-default select-all",
    })}
    contenteditable="false"
    data-copies={said}
    data-handle={said}
    data-mention={said}
    data-mention-chip
    data-skill-chip={skill.name}
    data-tip={facts}
    role="img"
  >
    <IconToolSkill aria-hidden="true" class="text-ink-muted" />
    <span data-slot="label">{skill.name}</span>
  </span>
{:else}
  <!-- Nothing stands between the chip and the panel's portal, or the line
       would draw a space after it. -->
  <button
    aria-controls={panelId}
    aria-expanded={panel.open}
    aria-haspopup="dialog"
    aria-label={`${skill.name}, ${sourceWords(skill)}`}
    class={chipVariants({ variant: "inline" })}
    data-copies={said}
    data-skill-chip={skill.name}
    onclick={panel.press}
    type="button"
    bind:this={panel.chip}
  >
    <IconToolSkill aria-hidden="true" class="text-ink-muted" />
    <span data-slot="label">{skill.name}</span>
  </button><Portal>
    <HoverPanel
      aria-label={skill.name}
      id={panelId}
      key={panel.open ? skill.name : null}
      onclose={() => panel.close(false)}
      role="dialog"
      side="right"
      style="--x: {panel.place.x}px; --y: {panel.place.y}px; --origin: {panel
        .place
        .origin}px; --room: var(--c-hover-panel-room); --span: calc(100vw - 2 * var(--hover-panel-inset))"
    >
      {#snippet children()}
        <div data-slot="skill-card" class="grid min-w-0 gap-space-2">
          <div data-slot="head" class="mark-line flex items-center gap-space-2">
            <IconToolSkill
              aria-hidden="true"
              class="size-icon-md flex-none text-ink-muted"
            />
            <span
              data-slot="title"
              class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap text-size-label font-medium text-ink-strong"
              >{skill.name}</span
            >
          </div>
          {#if skill.description}
            <p
              data-slot="description"
              class="m-0 type-body text-pretty text-ink-strong"
            >
              {skill.description}
            </p>
          {/if}
          <p data-slot="source" class="m-0 type-meta text-ink-muted">
            {sourceWords(skill)}
          </p>
        </div>
      {/snippet}
    </HoverPanel>
  </Portal>
{/if}
