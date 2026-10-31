<script lang="ts">
  /**
   * IMAGE SETTINGS BENCH, ARM B (dev only): the panel on the page's field,
   * as it stands beside a prompt. Apply takes 900 ms and lands; with
   * `?fail` in the address it fails instead, so the failure can be met.
   * `window.__armB` holds every apply it was handed.
   */
  import ImageSettings from "#lib/cawco/bench/arm-b/ImageSettings.svelte";
  import type { ImageSettingsValue } from "#lib/cawco/bench/arm-b/image-settings.js";
  import { page } from "$app/state";

  const applied: ImageSettingsValue[] = [];
  (window as unknown as { __armB: ImageSettingsValue[] }).__armB = applied;

  const fails = $derived(page.url.searchParams.has("fail"));

  async function onapply(settings: ImageSettingsValue): Promise<void> {
    await new Promise((settle) => setTimeout(settle, 900));
    if (fails) {
      throw new Error("the hub didn't answer in 30 s");
    }
    applied.push(settings);
  }
</script>

<main
  class="flex min-h-dvh justify-center bg-surface-recess px-space-3 py-space-6 phone:px-space-6"
>
  <ImageSettings {onapply} />
</main>
