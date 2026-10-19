<script lang="ts">
  /**
   * The artifact panel holding a component canvas, for the canvas-design
   * probe: the real PreviewPane in a pane `?w=` px wide (523 by default),
   * on a fleet store that holds one session whose panel shows a component
   * artifact served on `?port=` at `?path=` (a stage host's canvas address,
   * which the probe starts), and a split's Expand, so every control of the
   * head stands or goes to More by the head's priority rule. `?switch=1`
   * gives the head the Plan | Preview switch SideSplit gives it while a plan
   * stands beside the preview, drawn as SideSplit draws it. `?own=1` draws
   * it as the artifact's own tab does (`/artifact/<id>`, PreviewPane
   * `ownTab`). `?kind=preview` holds a plain preview of that address
   * instead (no view, no inspector). `?ask=` is the artifact's ask, which its
   * frame carries to the head's line. The probe answers the pane's reach
   * check (`/__cawco/ping`) itself.
   */
  import { type ArtifactKind, type FsEntry, sideWords } from "@cawco/core";
  import type { Bounded } from "@cawco/core/bounded";
  import PreviewPane from "#lib/cawco/preview/PreviewPane.svelte";
  import {
    type PaneFleet,
    type PanePreview,
    setPaneFleet,
  } from "#lib/cawco/preview/pane-fleet.js";
  import { setSideExpand } from "#lib/cawco/side/expand.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { page } from "$app/state";

  const INSTANCE = "bench-artifact-head";
  const ARTIFACT = "00000000-0000-4000-8000-0000000000a1";
  const width = Number(page.url.searchParams.get("w") ?? 523);
  const port = Number(page.url.searchParams.get("port") ?? 0);
  const path = page.url.searchParams.get("path") ?? "/";
  const name =
    page.url.searchParams.get("name") ?? "Preview canvas view states";
  const ask = page.url.searchParams.get("ask");
  const switched = page.url.searchParams.get("switch") === "1";
  const own = page.url.searchParams.get("own") === "1";
  /** `?kind=page`: the first artifact a page (the switch below starts from one); `?kind=preview` a plain preview. */
  const asked = page.url.searchParams.get("kind");
  const kind: ArtifactKind =
    asked === "page" || asked === "preview" ? asked : "component";
  /** `?then=` a second canvas address: the panel switches to it, a component canvas named `?thenName=` asking `?thenAsk=`, `?after=` ms in. */
  const then = page.url.searchParams.get("then");
  const after = Number(page.url.searchParams.get("after") ?? 3000);
  const THEN = "00000000-0000-4000-8000-0000000000a2";

  let preview = $state<PanePreview>({
    kind: "preview",
    instanceId: INSTANCE,
    artifact: { id: ARTIFACT, kind, name, ...(ask ? { ask } : {}) },
    artifacts: [ARTIFACT],
    port,
    revision: "bench-1",
    source: { port, path },
    state: "open",
  });
  if (then) {
    setTimeout(() => {
      preview = {
        ...preview,
        artifact: {
          id: THEN,
          kind: "component",
          name: page.url.searchParams.get("thenName") ?? "Switched canvas",
          ...(page.url.searchParams.get("thenAsk")
            ? { ask: page.url.searchParams.get("thenAsk") ?? "" }
            : {}),
        },
        artifacts: [ARTIFACT, THEN],
        revision: "bench-2",
        source: { port, path: then },
      };
    }, after);
  }
  const fleet: PaneFleet = {
    browser: () => null,
    browserAsk: () => null,
    closePreview: () => Promise.resolve(),
    folders: {
      list: () =>
        Promise.resolve({ kind: "answered", value: [] } as Bounded<FsEntry[]>),
      recent: () => null,
      unanswered: () => "",
    },
    machines: [],
    preview: (id) => (id === INSTANCE ? preview : undefined),
    session: (id) =>
      id === INSTANCE ? { id, cwd: "/", machineId: "bench" } : undefined,
    sessionHref: () => "/",
    working: () => false,
  };
  setPaneFleet(fleet);
  setSideExpand({
    available: true,
    backLabel: "Back to conversation",
    collapse: () => false,
    expanded: false,
    toggle: () => undefined,
  });
</script>

{#snippet switcher()}
  <Tabs size="compact" value="preview">
    <TabsList aria-label={sideWords.label}>
      <TabItem label={sideWords.plan} value="plan" />
      <TabItem label={sideWords.preview} value="preview" />
    </TabsList>
  </Tabs>
{/snippet}

<div data-bench-pane class="pane" style:inline-size={`${width}px`}>
  <PreviewPane
    instanceId={INSTANCE}
    ownTab={own}
    switcher={switched ? switcher : undefined}
  />
</div>

<style>
  .pane {
    block-size: 100dvh;
    padding-block-start: var(--space-2);
    background: var(--surface-recess);
  }
</style>
