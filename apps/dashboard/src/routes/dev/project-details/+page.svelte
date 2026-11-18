<script lang="ts">
  import ProjectDetailsLive from "#lib/cawco/project/project-details-live.svelte";
  /**
   * A project's details tray, for judging it at its widths: HyucksField's
   * tray as it unfolds under its head, every read and change answered by the
   * fixture (project-details-live.svelte). The bench reaches no hub.
   *
   * `?machines=1` (one machine in the fleet), `?tracked=cawco` (its tasks in
   * CawCo alone), `?account=work` or `signed-out` (an account named, or one
   * signed in nowhere), `?decides=own` (two kinds its own).
   */
  import { page } from "$app/state";

  const query = $derived(page.url.searchParams);
  const machinesJoined = $derived(query.get("machines") === "1" ? 1 : 2);
  const tracked = $derived(
    query.get("tracked") === "cawco" ? "cawco" : "github"
  );
  const account = $derived.by(() => {
    const asked = query.get("account");
    return asked === "work" || asked === "signed-out" ? asked : "routing";
  });
  const decides = $derived(query.get("decides") === "own" ? "own" : "fleet");
</script>

<main class="min-h-dvh bg-background pt-space-6">
  <ProjectDetailsLive {account} {decides} {machinesJoined} {tracked} />
</main>
