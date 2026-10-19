<script lang="ts">
  /**
   * The thread's messages as the panel options draw them: each on its
   * speaker line (Caw's 18px mark and his name, or You), then its words in
   * the body role. What stands under a message (the tasks his reply filed,
   * a note that your message didn't wake him) is the caller's, by the
   * message's id.
   */
  import type { Snippet } from "svelte";
  import CawFace from "#lib/cawco/home/CawFace.svelte";
  import type { Said } from "./fixtures";

  let {
    messages,
    under,
  }: {
    messages: Said[];
    /** What stands under a message, by its id. */
    under?: Snippet<[Said]>;
  } = $props();
</script>

<ol
  class="m-0 flex min-w-0 list-none flex-col gap-(--space-5) p-0"
  data-panel-said
>
  {#each messages as one (one.id)}
    <li class="flex min-w-0 flex-col gap-(--space-2)">
      <p
        class={[
          "mark-line m-0 flex items-center gap-(--space-2) text-label",
          one.who === "caw" ? "text-(--ink-strong)" : "text-(--ink-muted)",
        ]}
      >
        {#if one.who === "caw"}
          <CawFace size={18} status="ready" />
          <span>Caw</span>
        {:else}
          <span>You</span>
        {/if}
      </p>
      {#each one.words as para, at (at)}
        <p
          class="m-0 text-(--ink-strong) text-body [overflow-wrap:anywhere] [text-wrap:pretty]"
        >
          {para}
        </p>
      {/each}
      {@render under?.(one)}
    </li>
  {/each}
</ol>
