<script lang="ts">
  /** One area's page: its name, its settings and its projects (AreaPage). */
  import AreaPage from "#lib/cawco/areas/AreaPage.svelte";
  import { page } from "$app/state";
</script>

<AreaPage id={page.params.id ?? ""} />
