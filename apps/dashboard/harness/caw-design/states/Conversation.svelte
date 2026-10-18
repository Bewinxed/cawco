<script lang="ts">
  /**
   * The thread's messages as the frames draw them: each on its speaker
   * line (Caw's 18px mark and his name, or You), then its words in the body
   * role. Caw's tasks stand under the reply that filed them (`tasks`).
   * Markdown's marks are dropped; the transcript renders them.
   */
  import type { ThreadMessage } from "@cawco/core";
  import type { Snippet } from "svelte";
  import CawFace from "#lib/cawco/home/CawFace.svelte";

  let {
    messages,
    tasks,
  }: {
    messages: ThreadMessage[];
    /** What stands under a reply that filed tasks. */
    tasks?: Snippet;
  } = $props();

  const plain = (body: string) => body.replace(/\*\*?/g, "");
</script>

<ol class="said" data-design-conversation>
  {#each messages as one (one.id)}
    <li class={["one", one.author]}>
      <p class="speaker">
        {#if one.author === "caw"}
          <span class="mark"><CawFace size={18} status="ready" /></span>
          <span>Caw</span>
        {:else}
          <span>You</span>
        {/if}
      </p>
      {#each plain(one.body ?? "").split("\n\n") as para, at (at)}
        <p class="words">{para}</p>
      {/each}
      {#if one.author === "caw" && one.tasks?.length}{@render tasks?.()}{/if}
    </li>
  {/each}
</ol>

<style>
  .said {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    min-inline-size: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .one {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-inline-size: 0;
  }
  .speaker {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .you .speaker {
    color: var(--ink-muted);
  }
  .mark {
    display: grid;
    place-items: center;
  }
  .words {
    margin: 0;
    font: var(--type-body);
    color: var(--ink-strong);
    text-wrap: pretty;
    overflow-wrap: anywhere;
  }
</style>
