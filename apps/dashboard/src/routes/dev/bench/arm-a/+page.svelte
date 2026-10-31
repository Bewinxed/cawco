<script lang="ts">
  /**
   * IMAGE SETTINGS BENCH (dev only): the panel on the recessed field, at a
   * side panel's width, with Apply standing in for a generator that takes a
   * second and a half. `window.__imageSettings` holds every value applied.
   * `?disabled` locks the panel, `?no-eyedropper` stands in for a browser
   * without EyeDropper, `?fail` makes the generator refuse.
   */
  import ImageSettings from "#lib/cawco/bench/arm-a/ImageSettings.svelte";
  import type { ImageSettingsValue } from "#lib/cawco/bench/arm-a/image-settings.js";

  const query = new URL(window.location.href).searchParams;
  const sent: ImageSettingsValue[] = [];
  (
    window as unknown as { __imageSettings: ImageSettingsValue[] }
  ).__imageSettings = sent;

  const apply = (value: ImageSettingsValue) =>
    new Promise<void>((done, refuse) => {
      setTimeout(() => {
        if (query.has("fail")) {
          refuse(new Error("the generator stopped answering"));
          return;
        }
        sent.push(value);
        done();
      }, 1500);
    });
</script>

<svelte:head><title>Image settings · bench</title></svelte:head>

<main
  class="min-h-dvh bg-surface-recess px-space-4 py-space-6 phone:px-space-7"
>
  <div class="mx-auto w-full max-w-c-panel-w">
    <ImageSettings
      disabled={query.has("disabled")}
      onapply={apply}
      {...query.has("no-eyedropper") ? { eyeDropper: false } : {}}
    />
  </div>
</main>
