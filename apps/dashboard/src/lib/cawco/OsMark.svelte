<script lang="ts">
  import { IconServer } from "$lib/icons";
  /**
   * The mark of the operating system itself, rather than the shape of a box —
   * a laptop glyph on a Mac and a monitor glyph on a Linux tower said which
   * furniture the machine is, which is the one thing nobody needed to know.
   *
   * Drawn here rather than fetched: no icon set the app carries has the three
   * marks, and a brand mark is worth authoring once. Each sits in a 16px box
   * on the same optical weight and fills with `currentColor`, so it takes the
   * ink of whatever row it lands in.
   */
  import { cn } from "$lib/utils";

  interface Props {
    class?: string;
    /** The daemon's `platform-arch` fingerprint, as `machineOs` reads it. */
    os: string;
  }

  let { os, class: className }: Props = $props();

  const platform = $derived(os.trim().toLowerCase().split("-")[0]);
  const shape = $derived.by(() => {
    if (platform === "darwin") {
      return "apple";
    }
    if (platform === "linux") {
      return "tux";
    }
    if (platform === "win32" || platform === "windows") {
      return "windows";
    }
    return "unknown";
  });
</script>

{#if shape === 'unknown'}
  <IconServer class={cn('size-4 shrink-0', className)} />
{:else}
  <svg
    aria-hidden="true"
    class={cn('size-4 shrink-0', className)}
    fill="currentColor"
    viewBox="0 0 16 16"
  >
    {#if shape === 'apple'}
      <path
        d="M11.9 8.6c0-1.4.8-2.3 1.5-2.8-.6-.9-1.6-1.4-2.7-1.4-1.1-.1-2.2.7-2.8.7-.6 0-1.5-.7-2.4-.6C4
           4.5 2.9 5.2 2.3 6.3c-1.2 2.1-.3 5.3.9 7 .6.9 1.3 1.8 2.2 1.8.9 0 1.2-.6 2.3-.6s1.4.6 2.3.5c1-.1
           1.6-.9 2.2-1.7.4-.6.7-1.2.9-1.9-1.4-.5-2.2-1.6-2.2-2.8ZM10.2 3.3c.5-.6.8-1.4.7-2.3-.7.1-1.6.5-2.1
           1.1-.5.6-.9 1.4-.7 2.2.8.1 1.6-.4 2.1-1Z"
      />
    {:else if shape === 'tux'}
      <!-- Redrawn for 16px (user, 2026-08-08): the old mark's white belly inside
           a tall dark body rasterised as a padlock plate and its head as the
           shackle. The silhouette carries the bird instead — feet, flippers, a
           wide body and a head with two eyes far enough apart to survive one
           pixel each — and no belly is cut out of it at all. Nonzero winding:
           the eyes and the beak notch are the only holes. -->
      <path
        d="M1.8 14.6a2.4 1.25 0 0 1 4.8 0 2.4 1.25 0 0 1-4.8 0ZM9.4 14.6a2.4 1.25 0 0 1 4.8 0 2.4 1.25 0 0
           1-4.8 0ZM2.57 7.13a3.1 1.35 82 0 1 .86 6.14 3.1 1.35 82 0 1-.86-6.14ZM13.43 7.13a3.1 1.35 98 0 1
           -.86 6.14 3.1 1.35 98 0 1 .86-6.14ZM3.1 9.9a4.9 5.1 0 0 1 9.8 0 4.9 5.1 0 0 1-9.8 0ZM4.7 4.1a3.3
           3.4 0 0 1 6.6 0 3.3 3.4 0 0 1-6.6 0ZM5.55 3.9a.9 1.1 0 0 0 1.8 0 .9 1.1 0 0 0-1.8 0ZM8.65 3.9a.9
           1.1 0 0 0 1.8 0 .9 1.1 0 0 0-1.8 0ZM8 5.6 6.6 7h2.8Z"
      />
    {:else}
      <path
        d="M7.6 2.5 15 1.4v6.1H7.6ZM6.9 2.6v4.9H1V3.4ZM6.9 8.5v4.9L1 12.6V8.5ZM7.6 8.5H15v6.1L7.6 13.5Z"
      />
    {/if}
  </svg>
{/if}
