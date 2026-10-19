<script lang="ts">
  /**
   * The project's browsers on its details' Browser row (Projects spec §5.11):
   * one per machine it ran on, each its kind glyph, "Browser · <machine>",
   * its state word (asleep, live, you have control) and when it was last
   * used, then Open (its session's panel on the browser), Stop and Forget
   * sign-ins (its profile deleted on its machine, hub browsers.ts `/remove`),
   * the two asked in place (Asking in the page). The rows are the hub's
   * `browser_list` frames (core `ListedBrowser`), followed live.
   */
  import type { ListedBrowser } from "@cawco/core/browser";
  import AskHere from "#lib/cawco/AskHere.svelte";
  import { listArtifacts, showArtifact } from "#lib/cawco/artifact-api.js";
  import { Asker, type AskHereRequest } from "#lib/cawco/ask-here.svelte.js";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import { failureWords, hubRefusal } from "#lib/cawco/hub-read.js";
  import { conversationHref } from "#lib/cawco/links.js";
  import { BROWSER_WORDS } from "#lib/cawco/preview/source.js";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconGlobe } from "#lib/icons.js";
  import { formatAgeShort } from "#lib/utils/time.js";
  import { goto } from "$app/navigation";

  let { projectId }: { projectId: string } = $props();

  const key = $derived(`project:${projectId}`);
  /** Undefined until the app's socket has said the fleet's browsers. */
  const rows = $derived(cawco.browsers?.filter((row) => row.key === key));
  let openFault = $state<{ at: string; reason: string } | null>(null);
  let opening = $state<string | null>(null);
  const asks = new Asker<AskHereRequest>();

  /** The state word, as the band's chip says it. */
  const stateWord = (row: ListedBrowser): string => {
    if (row.takeover) {
      return "you have control";
    }
    switch (row.state) {
      case "live":
        return "live";
      case "pulling":
      case "building":
      case "starting":
        return "starting";
      case "failed":
        return "not answering";
      default:
        return "asleep";
    }
  };

  /** The newest live session of the project on the browser's machine: the panel Open shows it in. */
  const sessionFor = (row: ListedBrowser) =>
    cawco.instances
      .filter(
        (one) =>
          one.projectId === projectId &&
          one.machineId === row.machineId &&
          (one.status === "running" || one.status === "sleeping")
      )
      .at(-1);

  /** POSTs one of the browser's routes; the hub's refusal thrown in its words, which the question keeps. The row follows the hub's next frame. */
  async function act(row: ListedBrowser, route: "stop" | "remove") {
    const answer = await fetch(
      `/api/browsers/${encodeURIComponent(row.key)}/${route}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ machineId: row.machineId }),
      }
    );
    if (!answer.ok) {
      throw await hubRefusal(answer);
    }
  }

  function forget(row: ListedBrowser): void {
    // biome-ignore lint/complexity/noVoid: the question answers itself; a Cancel changes nothing
    void asks.ask({
      at: `forget:${row.machineId}`,
      title: "Forget this browser's sign-ins?",
      body: `Every site signed in here on ${row.machineName} is signed out. This cannot be undone.`,
      confirmLabel: "Forget sign-ins",
      pendingLabel: "Forgetting…",
      destructive: true,
      run: () => act(row, "remove"),
    });
  }

  async function open(row: ListedBrowser): Promise<void> {
    const session = sessionFor(row);
    if (!session) {
      return;
    }
    opening = row.machineId;
    openFault = null;
    try {
      const artifact = (await listArtifacts(session.id)).find(
        (one) => one.kind === "browser"
      );
      if (!artifact) {
        throw new Error(
          `${session.title ?? "Its session"} lists no browser yet`
        );
      }
      await showArtifact(session.id, artifact.id);
      await goto(conversationHref(session.id, cawco.instanceIndex));
    } catch (error) {
      openFault = {
        at: row.machineId,
        reason: `Couldn't open the browser: ${failureWords(error)}`,
      };
    } finally {
      opening = null;
    }
  }

  function stop(row: ListedBrowser): void {
    // biome-ignore lint/complexity/noVoid: the question answers itself; a Cancel changes nothing
    void asks.ask({
      at: `stop:${row.machineId}`,
      title: `Stop the browser on ${row.machineName}?`,
      body: row.takeover
        ? "You have control of it now: it is handed back first. Its sign-ins are kept, and it starts again when an agent needs it."
        : "Its agents' browser tools wait until it starts again, which it does when one needs it. Its sign-ins are kept.",
      confirmLabel: BROWSER_WORDS.more.stop,
      pendingLabel: "Stopping…",
      run: () => act(row, "stop"),
    });
  }
</script>

<div data-slot="project-browsers" class="flex min-w-0 flex-col gap-(--space-2)">
  {#if rows && rows.length === 0}
    <p class="m-0 text-(--ink-muted) text-meta text-pretty">
      No browser yet. It starts on a machine the first time an agent of this
      project browses there, and keeps its sign-ins.
    </p>
  {/if}
  {#each rows ?? [] as row (row.machineId)}
    {@const session = sessionFor(row)}
    <div
      data-browser-row={row.machineId}
      class="flex min-w-0 flex-col gap-(--space-1)"
    >
      <div
        class="flex min-w-0 flex-wrap items-center gap-x-(--space-3) gap-y-(--space-1)"
      >
        <p
          class="mark-line m-0 flex min-w-0 flex-1 items-center gap-(--space-2) text-(--ink-strong) text-body"
        >
          <IconGlobe
            aria-hidden="true"
            class="size-4 shrink-0 text-(--ink-muted)"
          />
          <span
            class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
            title={BROWSER_WORDS.title(row.machineName)}
            >{BROWSER_WORDS.title(row.machineName)}</span
          >
          <span class="shrink-0 text-(--ink-muted)" data-browser-state
            >· {stateWord(row)}</span
          >
        </p>
        <div class="flex shrink-0 items-center gap-(--space-1)">
          <Button
            data-browser-open
            disabled={!session || opening !== null}
            label="Open"
            onclick={() => open(row)}
            pending={opening === row.machineId}
            pendingLabel="Opening…"
            size="xs"
            title={session
              ? `Open it in ${session.title ?? "its session"}'s panel`
              : `Open waits for a session of this project on ${row.machineName}.`}
            variant="ghost"
          />
          {#if row.state === "live"}
            <Button
              data-browser-stop
              label={BROWSER_WORDS.more.stop}
              onclick={() => stop(row)}
              size="xs"
              variant="ghost"
            />
          {/if}
          <Button
            data-browser-forget
            label="Forget sign-ins"
            onclick={() => forget(row)}
            size="xs"
            variant="ghost"
          />
        </div>
      </div>
      <p class="m-0 text-(--ink-muted) text-meta">
        {formatAgeShort(row.lastUsedAt) === "now"
          ? "Last used just now"
          : `Last used ${formatAgeShort(row.lastUsedAt)} ago`}
      </p>
      <AskHere asker={asks} at={`stop:${row.machineId}`} />
      <AskHere asker={asks} at={`forget:${row.machineId}`} />
      <RowFault
        again={() => open(row)}
        reason={openFault?.at === row.machineId ? openFault.reason : null}
      />
    </div>
  {/each}
</div>
