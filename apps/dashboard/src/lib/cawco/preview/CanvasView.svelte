<script lang="ts">
  /**
   * A component canvas's view, in the panel's head (component canvas §2,
   * "How he watches and steers"): its frames' scheme, their widths, reduced
   * motion, and the zoom, each posted to the canvas page through the overlay
   * (`cawco:canvas-view`). The kit's dropdown menu under the head's own
   * button (the `sm` ghost, as Inspect), so the head keeps its room. Kept
   * per session, as the mode is.
   */
  // biome-ignore lint/performance/noNamespaceImport: the kit's compound menu (DropdownMenu.Root, .Item, …), as every menu of the app imports it
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { IconLayers } from "#lib/icons.js";
  import { store, stored } from "../storage";

  interface Props {
    instanceId: string;
    /** To the page, on its own origin (the pane's `post`). */
    post: (message: object) => void;
    /** The page said hello: the view kept for this session goes to it. */
    ready: boolean;
  }

  let { instanceId, post, ready }: Props = $props();

  type Scheme = "page" | "light" | "dark" | "both";
  type Width = "own" | "390" | "768" | "1280" | "all";
  interface Chosen {
    motion: "on" | "reduce";
    scheme: Scheme;
    width: Width;
  }

  const SCHEMES: [Scheme, string][] = [
    ["page", "As the page"],
    ["light", "Light"],
    ["dark", "Dark"],
    ["both", "Light and dark"],
  ];
  const WIDTHS: [Width, string][] = [
    ["own", "Each story's own"],
    ["390", "Phone, 390"],
    ["768", "Tablet, 768"],
    ["1280", "Desk, 1280"],
    ["all", "Every width"],
  ];

  const key = $derived(`cawco-canvas-view:${instanceId}`);
  let chosen = $state<Chosen>({ scheme: "page", width: "own", motion: "on" });
  $effect(() => {
    const kept = stored("local", key);
    if (kept) {
      try {
        chosen = { ...chosen, ...(JSON.parse(kept) as Partial<Chosen>) };
      } catch {
        // Unreadable: the canvas's own view.
      }
    }
  });

  /** The view as the page takes it: every permutation for "every width". */
  function send(next: Chosen, zoom?: number | "fit") {
    chosen = next;
    store("local", key, JSON.stringify(next));
    post({
      type: "cawco:canvas-view",
      view: {
        scheme: next.scheme,
        widths:
          next.width === "own" || next.width === "all"
            ? null
            : [Number(next.width)],
        all: next.width === "all",
        motion: next.motion,
        ...(zoom === undefined ? {} : { zoom }),
      },
    });
  }

  // Each load of the page takes the view kept for this session.
  $effect(() => {
    if (ready) {
      send(chosen);
    }
  });
</script>

<DropdownMenu.Root>
  <!-- The head's own button, as Inspect beside it: SideSurface's head recipe draws it; the trigger brings touch-hit. -->
  <DropdownMenu.Trigger
    aria-label="Canvas view"
    title="Canvas view: scheme, widths, motion, zoom"
  >
    <IconLayers />
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="end" width="regular">
    <DropdownMenu.Group>
      <DropdownMenu.GroupHeading>Scheme</DropdownMenu.GroupHeading>
      <DropdownMenu.RadioGroup
        onValueChange={(value) => send({ ...chosen, scheme: value as Scheme })}
        value={chosen.scheme}
      >
        {#each SCHEMES as [value, words] (value)}
          <DropdownMenu.RadioItem {value}>{words}</DropdownMenu.RadioItem>
        {/each}
      </DropdownMenu.RadioGroup>
    </DropdownMenu.Group>
    <DropdownMenu.Separator />
    <DropdownMenu.Group>
      <DropdownMenu.GroupHeading>Width</DropdownMenu.GroupHeading>
      <DropdownMenu.RadioGroup
        onValueChange={(value) => send({ ...chosen, width: value as Width })}
        value={chosen.width}
      >
        {#each WIDTHS as [value, words] (value)}
          <DropdownMenu.RadioItem {value}>{words}</DropdownMenu.RadioItem>
        {/each}
      </DropdownMenu.RadioGroup>
    </DropdownMenu.Group>
    <DropdownMenu.Separator />
    <DropdownMenu.CheckboxItem
      checked={chosen.motion === "reduce"}
      onCheckedChange={(on) =>
        send({ ...chosen, motion: on ? "reduce" : "on" })}
      >Reduced motion</DropdownMenu.CheckboxItem
    >
    <DropdownMenu.Separator />
    <DropdownMenu.Item onSelect={() => send(chosen, "fit")}
      >Zoom to fit</DropdownMenu.Item
    >
    <DropdownMenu.Item onSelect={() => send(chosen, 1)}
      >Zoom to 100%</DropdownMenu.Item
    >
  </DropdownMenu.Content>
</DropdownMenu.Root>
