<!--
  Values the person tunes: DialKit (vendored in the decision-page kit) docked
  here, its panel kept by the kit's dials.js under the one `dials` key, each
  panel's values by name, as an HTML page's `cawcoDials` keeps them. DialKit
  loads only on a page that has Dials. Every Dials of a page docks in the
  first one's place, as dials.js roots one panel stack per page.
-->
<script lang="ts">
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";
  import { bridge } from "./page.svelte.js";

  let {
    props,
  }: OpenUIRenderProps<{ name: unknown; config: Record<string, unknown> }> =
    $props();

  type Kit = (name: string, config: unknown) => unknown;
  let loading: Promise<Kit> | undefined;
  /** DialKit and dials.js, loaded once per page. */
  const kit = (): Promise<Kit> => {
    loading ??= new Promise((resolve, reject) => {
      const sheet = document.createElement("link");
      sheet.rel = "stylesheet";
      sheet.href = "/__cawco/decision/dials.css";
      document.head.append(sheet);
      const script = document.createElement("script");
      script.src = "/__cawco/decision/dials.js";
      script.onload = () =>
        resolve((window as unknown as { cawcoDials: Kit }).cawcoDials);
      script.onerror = () => reject(new Error("DialKit didn't load."));
      document.head.append(script);
    });
    return loading;
  };

  let made = false;
  let failed = $state("");
  $effect(() => {
    if (made || !bridge()) {
      return;
    }
    made = true;
    kit()
      .then((dials) => dials(String(props.name ?? "Dials"), props.config ?? {}))
      .catch((error: unknown) => {
        failed = error instanceof Error ? error.message : String(error);
      });
  });
</script>

<div class="dials" data-cawco-dials>
  {#if failed}<p class="said">{failed}</p>{/if}
</div>

<style>
  .dials {
    min-inline-size: 0;
  }
  .said {
    font: var(--type-meta);
    color: var(--status-fail-ink);
  }
</style>
