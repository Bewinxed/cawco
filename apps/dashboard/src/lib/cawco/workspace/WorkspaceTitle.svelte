<!-- The document's title for whatever the workspace shows: a conversation's
     name, a project's, or Fleet for the board. Both workspace routes
     (`/session`, `/project/<id>`) draw it: the workspace moves between
     their tabs by shallow navigation, which leaves `page.url` on the page
     the route was entered at and puts the URL shown in `page.shallow.url`,
     so the tab is read off that. A `<title>` only writes `document.title`,
     and the page left behind takes nothing back, so every route says its
     own. -->
<script lang="ts">
  import { sessionName } from "#lib/cawco/home/home-state.svelte.js";
  import { projectsStore } from "#lib/cawco/stores/projects.svelte.js";
  import { page } from "$app/state";
  import { projectOfTab, tabOfPath } from "./tabs";

  const tab = $derived(tabOfPath((page.shallow?.url ?? page.url).pathname));
  const projectId = $derived(projectOfTab(tab));
  const title = $derived(
    projectId
      ? (projectsStore.project(projectId)?.name ?? "Project")
      : sessionName(tab ?? undefined)
  );
</script>

<svelte:head><title>{title} · CawCo</title></svelte:head>
