<script lang="ts">
  /**
   * A member's face, one shape for every face: the identity mark's rounded
   * square at 0.28 of its side. Caw's flock wears a pose of his, framed in
   * that square on the neutral ground; an added agent the agent glyph on its
   * mark; a person initials on theirs; You the person glyph on the neutral
   * ground.
   */
  import type { Member } from "@cawco/core/decides";
  import type { Snippet } from "svelte";
  import { IconToolGeneric, IconUser } from "#lib/icons.js";
  import CawPortrait from "../home/CawPortrait.svelte";

  let {
    member,
    size,
  }: {
    member: Member;
    size: 18 | 24 | 28 | 48 | 56;
  } = $props();

  const initials = $derived(
    member.name
      .split(" ")
      .slice(0, 2)
      .map((word) => word[0] ?? "")
      .join("")
      .toUpperCase()
  );
</script>

{#snippet tile(inner: Snippet)}
  <span
    aria-hidden="true"
    class={[
      "grid flex-none place-items-center overflow-hidden rounded-(--corner) size-(--side)",
      member.hue === null
        ? "bg-surface-recess-deep text-ink-muted"
        : "bg-(--face) text-mark-glyph",
    ]}
    style:--corner="{size * 0.28}px"
    style:--side="{size}px"
    style:--face={member.hue === null ? undefined : `var(--mark-${member.hue})`}
  >
    {@render inner()}
  </span>
{/snippet}
{#snippet words()}
  <span class={size > 28 ? "type-title" : "type-label"}>{initials}</span>
{/snippet}
{#snippet agent()}
  <IconToolGeneric class="size-3/5" />
{/snippet}
{#snippet person()}
  <IconUser class="size-3/5" />
{/snippet}

{#snippet portrait()}
  {#if member.pose}
    <CawPortrait pose={member.pose} {size} />
  {/if}
{/snippet}

{#if member.pose}
  {@render tile(portrait)}
{:else if member.type === "person" || member.type === "channel"}
  {@render tile(words)}
{:else if member.type === "agent"}
  {@render tile(agent)}
{:else}
  {@render tile(person)}
{/if}
