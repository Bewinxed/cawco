<!--
  Values the person tunes rather than picks, on the design graph's own dial
  controls (graph/Dials.svelte: a number's field with its fill, a colour's field and picker, the kit's
  Select, Switch and Input, an action's button), drawn in their own well
  where the program puts it, under the media it tunes. Its config is
  the shape agents write (graph dials.ts `dialsOfConfig`): a
  number as [default, min, max], a colour, a boolean, a string, a typed
  control, a folder. Its values are kept under the one `dials` key, each
  panel's by name and path (`{ Card: { radius: 16 } }`), written 400 ms
  after the last turn and standing again on a reload or a revision; they go
  to the agent with the page's Send. An HTML page's `cawcoDials` draws the
  same (dials.ts), and hears each turn (`onvalues`).
-->
<script lang="ts">
  import { z } from "zod";
  import GraphDials from "../../graph/Dials.svelte";
  import {
    type DialValue,
    type DialValues,
    dialsOfConfig,
  } from "../../graph/dials";
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";
  import { bridge, picks } from "./page.svelte.js";
  import Well from "./Well.svelte";

  let {
    props,
    onvalues,
  }: Pick<
    OpenUIRenderProps<{ name: unknown; config: Record<string, unknown> }>,
    "props"
  > & {
    /** Each turn's values, the whole panel's by path: an HTML page's own script draws with them. */
    onvalues?: (values: DialValues) => void;
  } = $props();

  /** How long the values stand still before they are kept. */
  const KEEP_AFTER_MS = 400;
  const name = $derived(String(props.name ?? "Dials"));
  const read = $derived(dialsOfConfig(props.config ?? {}));
  /** Every panel's values as the hub keeps them, by panel name. */
  const keptAll = $derived.by(
    (): Record<string, DialValues> =>
      z
        .record(
          z.string(),
          z.record(z.string(), z.union([z.number(), z.string(), z.boolean()]))
        )
        .safeParse(picks.now.dials?.value).data ?? {}
  );
  /** His values, by path: the kept ones once they come, while he has turned nothing. */
  let values = $state<DialValues>({});
  let taken = false;
  $effect(() => {
    const kept = keptAll[name];
    if (taken || !kept) {
      return;
    }
    taken = true;
    if (Object.keys(values).length === 0) {
      values = Object.fromEntries(
        Object.entries(kept).filter(([path]) =>
          read.dials.some((dial) => dial.name === path)
        )
      );
    }
  });
  let undo = $state<DialValues | null>(null);
  /** The values as set: his over as written. */
  const set = $derived<DialValues>({ ...read.written, ...values });
  // The page's own drawing takes every set, the first too.
  $effect(() => {
    onvalues?.($state.snapshot(set));
  });
  let keeping: ReturnType<typeof setTimeout> | undefined;
  /** The panel's values kept under `dials`, every other panel's as the hub keeps them. */
  const keep = () => {
    clearTimeout(keeping);
    keeping = setTimeout(() => {
      bridge()
        ?.set("dials", { ...keptAll, [name]: { ...read.written, ...values } })
        .catch((error: unknown) => console.error("[decision-page]", error));
    }, KEEP_AFTER_MS);
  };
  const turn = (path: string, value: DialValue) => {
    values = { ...values, [path]: value };
    undo = null;
    keep();
  };
</script>

<Well>
  <div class="flex w-full min-w-0 flex-col" data-slot="dials-well">
    <GraphDials
      dials={read.dials}
      lang={undefined}
      onchange={turn}
      onreset={(paths, all) => {
        if (all) {
          undo = values;
        }
        values = Object.fromEntries(
          Object.entries(values).filter(([path]) => !paths.includes(path))
        );
        keep();
      }}
      onundo={() => {
        values = undo ?? {};
        undo = null;
        keep();
      }}
      undoable={undo !== null}
      {values}
      written={read.written}
    />
  </div>
</Well>
