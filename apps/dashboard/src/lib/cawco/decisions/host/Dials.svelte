<!--
  Values the person tunes: a DialKit panel (vendored in the decision-page
  kit), made by the kit's dials.js as an HTML page's `cawcoDials` makes one,
  floating at the page's foot as it does there, its values kept under the one
  `dials` key, each panel's by name and path (`{ Card: { radius: 16 } }`),
  restored from the hub on a reload or a revision. DialKit loads only on a
  page that has Dials; it draws in its own panel, so this piece takes no room
  where it stands.
-->
<script lang="ts">
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";
  import { bridge } from "./page.svelte.js";

  let {
    props,
  }: OpenUIRenderProps<{ name: unknown; config: Record<string, unknown> }> =
    $props();

  type Kit = (name: string, config: unknown) => unknown;
  /** DialKit and dials.js, loaded once for the page. */
  const kit = (): Promise<Kit> => {
    const held = window as unknown as {
      cawcoDials?: Kit;
      cawcoDialsLoading?: Promise<Kit>;
    };
    held.cawcoDialsLoading ??= new Promise((resolve, reject) => {
      const sheet = document.createElement("link");
      sheet.rel = "stylesheet";
      sheet.href = "/__cawco/decision/dials.css";
      document.head.append(sheet);
      const script = document.createElement("script");
      script.src = "/__cawco/decision/dials.js";
      script.onload = () =>
        held.cawcoDials
          ? resolve(held.cawcoDials)
          : reject(new Error("DialKit didn't load."));
      script.onerror = () => reject(new Error("DialKit didn't load."));
      document.head.append(script);
    });
    return held.cawcoDialsLoading;
  };

  let made = false;
  $effect(() => {
    if (made || !bridge()) {
      return;
    }
    made = true;
    kit()
      .then((dials) => dials(String(props.name ?? "Dials"), props.config ?? {}))
      .catch((error: unknown) => console.error("[decision-page]", error));
  });
</script>
