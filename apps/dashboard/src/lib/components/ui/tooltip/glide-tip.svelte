<script lang="ts">
  /**
   * The glass's one tooltip (glide.ts): the Root its items' tips are
   * tethered to, saying the words of the item it stands at. It fades in as
   * every tooltip does (tooltip-content); while it stays open and the
   * pointer moves to another item, its floating wrapper slides to that item
   * over `--dur-control` on the drawer's curve (`data-gliding`, set a frame
   * after it opens, so its first placing is never a slide in from nowhere;
   * the rule is app.css's, on bits-ui's floating wrapper).
   */
  import type { Glide } from "./glide";
  import Root from "./tooltip.svelte";
  import Content from "./tooltip-content.svelte";

  let { tether }: { tether: Glide } = $props();

  let open = $state(false);
  let gliding = $state(false);
  $effect(() => {
    if (!open) {
      gliding = false;
      return;
    }
    const frame = requestAnimationFrame(() => {
      gliding = true;
    });
    return () => cancelAnimationFrame(frame);
  });
</script>

<Root {tether} bind:open>
  {#snippet children({ payload })}
    {#if payload}
      <!-- 8px clear of the viewport's edges: it never touches one. -->
      <Content
        collisionPadding={8}
        data-gliding={gliding || undefined}
        data-glide-tip=""
        side={payload.side}
      >
        <span class="whitespace-pre-line"
          >{#if payload.title}
            <strong data-slot="block" class="block font-medium"
              >{payload.title}</strong
            >
          {/if}
          {payload.label}</span
        >
        {#if payload.keys}
          <kbd class="font-body opacity-70">{payload.keys}</kbd>
        {/if}
      </Content>
    {/if}
  {/snippet}
</Root>
