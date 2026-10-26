<!--
  The decision page's host: its program drawn with the decision library on
  the one OpenUI renderer (the dashboard's OpenUiRenderer.svelte). A
  revision (artifact_update's statements) reaches the overlay as the doc's
  new page hash; the overlay hands it here as `cawco:revision`, and this
  draws the new program in place, never swapping the page's DOM, then says
  `cawco:hmr` with the program's hash, so the overlay re-reads its pins and
  marks every option again from the stored picks.
-->
<script lang="ts">
  import { onMount, tick } from "svelte";
  import OpenUiRenderer from "../../views/openui/OpenUiRenderer.svelte";
  import { DECISION_LIBRARY } from "./library.js";
  import { overlayTag, programIn, takeServed } from "./page.svelte.js";

  let program = $state(programIn(document));
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

<OpenUiRenderer library={DECISION_LIBRARY} response={program} />
