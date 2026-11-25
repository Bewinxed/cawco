<script lang="ts">
  import { setSkeletonShapes } from "#lib/components/ui/skeleton/shape.js";
  import SkeletonOf from "#lib/components/ui/skeleton/skeleton-of.svelte";
  import { fleetOf } from "#lib/components/ui/skeleton/skeleton-of-live.svelte";
  import SkeletonPieces, {
    CAPTURE_SESSION,
    type PieceName,
  } from "#lib/components/ui/skeleton/skeleton-pieces.svelte";
  /**
   * The kit's skeletons as a screen holds them, drawn by the server (see
   * +page.server.ts). The query sets the room and the data:
   * `pieces` (rows,card,picture), `w` (a box width in px, or `fluid`),
   * `layout` (`plain`, `sidebar`: a box in a sidebar beside a main column,
   * `shrink`: a shrink-to-fit parent), `n` (the list's rows), `data`
   * (`fixture`: the capture's words, `long`: a card whose words wrap to more
   * lines), `copies` (each piece again under its own slot), and `delay` (ms
   * until the data lands, or `never`, to measure the wait itself).
   */
  import { page } from "$app/state";
  import { markHydrated } from "./hydrated.js";

  let { data } = $props();
  setSkeletonShapes(() => data.shapes);

  const query = page.url.searchParams;
  const PIECES: PieceName[] = ["rows", "card", "picture"];
  const asked = (query.get("pieces") ?? "rows,card").split(",");
  const pieces = PIECES.filter((piece) => asked.includes(piece));
  const w = query.get("w") ?? "448";
  const layout = query.get("layout") ?? "plain";
  const n = Number(query.get("n") ?? 3);
  const copies = Array.from(
    { length: Number(query.get("copies") ?? 1) },
    (_, k) => k
  );
  const session =
    query.get("data") === "long"
      ? {
          ...CAPTURE_SESSION,
          summary:
            "Started 2 min ago by Caw on main, 3 files changed so far. Waiting on the migration check against a copy of the production database before the daemons restart.",
        }
      : CAPTURE_SESSION;

  let landed = $state(false);
  $effect(() => {
    markHydrated();
    data.arrives?.then(() => {
      landed = true;
    });
  });
  const width = w === "fluid" ? "100%" : `${w}px`;
  const box = layout === "shrink" ? "auto" : width;
</script>

<svelte:head><title>Skeletons</title></svelte:head>

{#snippet stack()}
  <div class="flex w-(--box) max-w-full flex-col gap-space-4" style:--box={box}>
    {#each copies as copy (copy)}
      {#each pieces as piece (piece)}
        <SkeletonOf
          count={n}
          loading={!landed}
          name={`kit-${piece}`}
          slot={`dev:${piece}:${copy}`}
          typical={piece === "rows" ? { count: n } : {}}
        >
          <SkeletonPieces machines={fleetOf(n)} {piece} {session} />
        </SkeletonOf>
      {/each}
    {/each}
    <footer class="type-meta text-tx-2" data-sentinel>
      Below the pieces: this line moves if they change height.
    </footer>
  </div>
{/snippet}

<div class="bg-bg p-space-4 text-tx">
  {#if layout === "sidebar"}
    <div class="flex gap-space-6">
      <aside>{@render stack()}</aside>
      <main class="flex-1">
        <h1 class="type-title">Board</h1>
        <p class="type-body">
          The main column of a wide window, beside the sidebar.
        </p>
      </main>
    </div>
  {:else if layout === "shrink"}
    <div class="inline-block">{@render stack()}</div>
  {:else}
    {@render stack()}
  {/if}
</div>
