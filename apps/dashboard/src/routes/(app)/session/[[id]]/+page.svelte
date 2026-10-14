<!-- One route for the whole strip: `/session` is the fleet board and
     `/session/<id>` is a conversation, and both are drawn by
     `SessionSurface`, which the Shell keeps mounted once a `/session` page
     has shown (parked under any other spoke) and which holds all of them at
     once, showing whichever the URL points at. The id is optional so that
     moving between the board and a conversation is a parameter change
     rather than a change of route — the router swaps no components for it,
     which is what makes Fleet cost the same as any other tab. This page
     declares the route and names the document: a `<title>` only writes
     `document.title`, and the page left behind takes nothing back, so every
     route says its own. The workspace moves between conversations by
     shallow navigation, which leaves `page.url` and `page.params` on the
     page the route was entered at and puts the URL shown in
     `page.shallow.url`: the id is read off that, as the bar's crumb reads it. -->
<script lang="ts">
  import { sessionName } from "#lib/cawco/home/home-state.svelte.js";
  import { page } from "$app/state";

  const id = $derived(
    (page.shallow?.url ?? page.url).pathname
      .split("/")
      .filter(Boolean)
      .map(decodeURIComponent)[1]
  );
</script>

<svelte:head><title>{sessionName(id)} · CawCo</title></svelte:head>
