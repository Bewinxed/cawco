<!--
  The decision page's host: its program drawn with the decision library on
  the one OpenUI renderer (the dashboard's OpenUiRenderer.svelte). A
  revision (artifact_update's statements) reaches the overlay as the doc's
  new page hash; the overlay hands it here as `cawco:revision`, and this
  draws the new program in place, never swapping the page's DOM, then says
  `cawco:hmr` with the program's hash, so the overlay re-reads its pins and
  marks every option again from the stored picks. A piece it shows moved to
  another version (hub artifacts service `versionMoved`) comes the same way:
  its program is the same, so only that piece's media is taken again.

  A page whose program is an agent's block kept as an artifact (its root a
  Column, core inline-blocks.ts `programLibraryOf`, tsk-330) is drawn with
  the block library in the page's own scroller and column, as a decision
  page lays its cards: no title of its own (the panel's head names it), no
  Send, nothing to pick.
-->
<script lang="ts">
  import { programLibraryOf } from "@cawco/core/inline-blocks";
  import { onMount, tick } from "svelte";
  import OpenUiRenderer from "../../views/openui/OpenUiRenderer.svelte";
  import { decisionCardOf } from "./card-fault";
  import { DECISION_LIBRARY, HOST_BLOCK_LIBRARY } from "./library.js";
  import { overlayTag, programIn, takeServed } from "./page.svelte.js";
  import { stillCaw } from "./StillCaw.svelte";

  let program = $state(programIn(document));
  const block = $derived(programLibraryOf(program) === "block");
  const SERVED_HASH = /data-page-hash="([0-9a-f]{64})"/u;

  /** Tells the overlay the page drew `hash`'s program. */
  const drawn = async (hash: string) => {
    await tick();
    dispatchEvent(new CustomEvent("cawco:hmr", { detail: { pageHash: hash } }));
  };

  onMount(() => {
    drawn(overlayTag().hash);
    let asked = 0;
    const revised = async (event: Event) => {
      event.preventDefault();
      asked += 1;
      const mine = asked;
      try {
        const response = await fetch(location.pathname, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`The revision did not load (${response.status}).`);
        }
        const html = await response.text();
        if (mine !== asked) {
          return;
        }
        const doc = new DOMParser().parseFromString(html, "text/html");
        takeServed(doc);
        program = programIn(doc);
        await drawn(html.match(SERVED_HASH)?.[1] ?? "");
      } catch (error) {
        console.error("[decision-page]", error);
      }
    };
    addEventListener("cawco:revision", revised);
    return () => removeEventListener("cawco:revision", revised);
  });
</script>

<!-- A part that throws stands as its fault face in its place: a Decision
     as its card, its question named, anything else as a line; the page's
     other cards and Send go on working. -->
{#if block}
  <main
    class="decision-page-insets grid h-dvh min-w-0 pb-(--page-inset-bottom)"
    data-slot="block-page"
  >
    <div
      class="kit-edge-fade-block min-h-0 overflow-y-auto overscroll-y-contain pt-(--page-inset-top) scrollbar-gutter-stable max-phone:no-scrollbar in-data-cawco-bare-scroll:no-scrollbar"
      data-slot="page-scroll"
    >
      <div
        class="mx-auto flex w-full min-w-0 max-w-(--column-w) flex-col overflow-x-clip px-(--page-in) py-(--page-in)"
        data-slot="page-column"
      >
        <OpenUiRenderer
          caw={stillCaw}
          class="min-w-0"
          library={HOST_BLOCK_LIBRARY}
          label={`kept block "${document.title}" (${location.pathname})`}
          response={program}
        />
      </div>
    </div>
  </main>
{:else}
  <OpenUiRenderer
    cardOf={decisionCardOf}
    caw={stillCaw}
    library={DECISION_LIBRARY}
    label={`decision page "${document.title}" (${location.pathname})`}
    response={program}
  />
{/if}
