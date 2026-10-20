<!--
  Values the person tunes: a DialKit panel (vendored in the decision-page
  kit, loaded only on a page that has Dials) drawn in its own well where the
  program puts it, under the media it tunes, never floating over the page
  (the kit's dials.js `cawcoDialsIn`, DialKit's own control renderer). Its
  values are kept under the one `dials` key, each panel's by name and path
  (`{ Card: { radius: 16 } }`), restored from the hub on a reload or a
  revision. Its look is the house's, set through DialKit's own variables
  (host.css, `[data-slot=dials]`).
-->
<script lang="ts">
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";
  import { bridge } from "./page.svelte.js";
  import { scheme } from "./scheme.svelte.js";
  import Well from "./Well.svelte";

  let {
    props,
  }: OpenUIRenderProps<{ name: unknown; config: Record<string, unknown> }> =
    $props();

  interface Drawn {
    destroy: () => void;
    root: HTMLElement;
  }
  type DrawIn = (
    target: HTMLElement,
    name: string,
    config: unknown,
    options: { theme: string }
  ) => Drawn;
  /** DialKit and dials.js, loaded once for the page. */
  const kit = (): Promise<DrawIn> => {
    const held = window as unknown as {
      cawcoDialsIn?: DrawIn;
      cawcoDialsLoading?: Promise<DrawIn>;
    };
    held.cawcoDialsLoading ??= new Promise((resolve, reject) => {
      const sheet = document.createElement("link");
      sheet.rel = "stylesheet";
      sheet.href = "/__cawco/decision/dials.css";
      document.head.append(sheet);
      const script = document.createElement("script");
      script.src = "/__cawco/decision/dials.js";
      script.onload = () =>
        held.cawcoDialsIn
          ? resolve(held.cawcoDialsIn)
          : reject(new Error("DialKit didn't load."));
      script.onerror = () => reject(new Error("DialKit didn't load."));
      document.head.append(script);
    });
    return held.cawcoDialsLoading;
  };

  let dock = $state<HTMLDivElement>();
  let drawn = $state<Drawn>();
  $effect(() => {
    const target = dock;
    if (!(target && bridge())) {
      return;
    }
    let gone = false;
    let made: Drawn | undefined;
    kit()
      .then((drawIn) => {
        if (gone) {
          return;
        }
        made = drawIn(
          target,
          String(props.name ?? "Dials"),
          props.config ?? {},
          {
            theme: scheme.now,
          }
        );
        drawn = made;
      })
      .catch((error: unknown) => console.error("[decision-page]", error));
    return () => {
      gone = true;
      made?.destroy();
    };
  });
  // DialKit's own drawings (a spring's curve) follow the page's scheme.
  $effect(() => {
    const { now } = scheme;
    if (drawn) {
      drawn.root.dataset.theme = now;
    }
  });
</script>

<Well>
  <div bind:this={dock} class="w-full min-w-0" data-slot="dials"></div>
</Well>
