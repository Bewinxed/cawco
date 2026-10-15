<script lang="ts">
  /**
   * A mockup bench, on the dev server only: `?project=<id>&src=<path>`
   * draws the .oui file at `path` in the project's folder as one of its
   * mockups. The project's library (its design) and the hub's check first,
   * then the frame (MockupFrame). A refusal is the hub's sentence
   * (`data-mockup-refused`), and nothing is drawn.
   *
   * What scripts/probe-kit/specs/web/oui-mockup.ts reads: `data-mockup-bench`
   * (reading, refused, drawn), and in the frame each part's `data-mk`.
   */
  import type { ProjectMockups } from "@cawco/core/mockups";
  import {
    checkMockup,
    mockupFile,
    mockupsOf,
  } from "#lib/cawco/views/openui/mockup/api.js";
  import MockupFrame from "#lib/cawco/views/openui/mockup/MockupFrame.svelte";
  import {
    Alert,
    AlertDescription,
    AlertTitle,
  } from "#lib/components/ui/alert/index.js";
  import { page } from "$app/state";

  type Read =
    | { state: "reading" }
    | { state: "refused"; reason: string }
    | { state: "drawn"; mockups: ProjectMockups; source: string };

  const projectId = $derived(page.url.searchParams.get("project") ?? "");
  const src = $derived(page.url.searchParams.get("src") ?? "");
  let read = $state<Read>({ state: "reading" });

  async function draw(id: string, path: string): Promise<Read> {
    if (!(id && path)) {
      return {
        state: "refused",
        reason:
          "Name a project and a mockup: ?project=<id>&src=<a .oui file in its folder>.",
      };
    }
    try {
      const [mockups, text] = await Promise.all([
        mockupsOf(id),
        mockupFile(id, path),
      ]);
      const { source } = await checkMockup(id, text);
      return { state: "drawn", mockups, source };
    } catch (error) {
      return {
        state: "refused",
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  $effect(() => {
    let current = true;
    read = { state: "reading" };
    draw(projectId, src).then((answer) => {
      if (current) {
        read = answer;
      }
    });
    return () => {
      current = false;
    };
  });
</script>

<svelte:head><title>Mockup bench · CawCo</title></svelte:head>

<main data-mockup-bench={read.state}>
  <h1>{src || "Mockup"}</h1>
  {#if read.state === "refused"}
    <Alert data-mockup-refused={read.reason} variant="warning">
      <AlertTitle>This mockup is not drawn</AlertTitle>
      <AlertDescription>{read.reason}</AlertDescription>
    </Alert>
  {:else if read.state === "drawn"}
    <MockupFrame mockups={read.mockups} {projectId} source={read.source} />
  {/if}
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    min-height: 100vh;
    padding: var(--space-7);
    background: var(--surface-recess);
    color: var(--ink-strong);
    font: var(--type-body);
  }
  h1 {
    font: var(--type-title);
  }
</style>
