<!-- A project's tab: `/project/<id>` is one of the workspace's addresses, as
     `/session/<id>` is, and the project is drawn in its tab by the
     workspace (SessionSurface, a group's ProjectPage), which the Shell keeps
     mounted. This page declares the route and names the document; its load
     paints the project in the server's HTML on a cold load. -->
<script lang="ts">
  import WorkspaceTitle from "#lib/cawco/workspace/WorkspaceTitle.svelte";
</script>

<WorkspaceTitle />
