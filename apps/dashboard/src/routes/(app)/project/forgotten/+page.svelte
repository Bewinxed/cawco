<script lang="ts">
  /**
   * Forgotten projects: the hub's trash of projects (`GET
   * /api/projects/forgotten`) and the rows restores held back (`GET
   * /api/projects/held`), opened from the glyph in the rail's Projects
   * head, from a refused Bring back and from a restore's held rows. Read as the page opens and again
   * whenever the projects change (a forget, a restore, a delete anywhere),
   * the last good list kept while it is read again.
   */
  import { detach } from "@cawco/core/detach";
  import type {
    ForgottenProject,
    HeldRows,
  } from "@cawco/core/forgotten-project";
  import { projectEndWords } from "@cawco/core/words/project-ends";

  import ForgottenPage from "#lib/cawco/forgotten/ForgottenPage.svelte";
  import {
    bringBack,
    bringBackKey,
    bringBackRefusal,
    deleteHeld,
    heldSaid,
    tryHeldAgain,
  } from "#lib/cawco/project-end.svelte.js";
  import { refusals } from "#lib/cawco/refusals.svelte.js";
  import {
    deleteProjectForGood,
    projectsStore,
    readForgottenProjects,
    readHeldRows,
  } from "#lib/cawco/stores/projects.svelte.js";
  import { failureWords } from "#lib/platform/hub-read.js";

  let list = $state<ForgottenProject[] | null>(null);
  let held = $state<HeldRows[]>([]);
  let unread = $state<string | null>(null);
  /** The latest read: an answer to an earlier one is dropped. */
  let latest = 0;

  async function read(): Promise<void> {
    latest += 1;
    const mine = latest;
    try {
      const [answer, rows] = await Promise.all([
        readForgottenProjects(),
        readHeldRows(),
      ]);
      if (mine === latest) {
        list = answer;
        held = rows;
        unread = null;
      }
    } catch (error) {
      if (mine === latest) {
        unread = failureWords(error);
      }
    }
  }

  // Read as it opens, and again as the projects change.
  $effect(() => {
    if (projectsStore.projects) {
      detach(read(), "forgotten");
    }
  });

  /** The live project that holds one of its checkouts now: a refused restore links to it. */
  function holderOf(
    one: ForgottenProject
  ): { href: string; name: string } | null {
    const mine = new Set(
      one.places.map((place) => `${place.machineId}\0${place.path}`)
    );
    const holder = projectsStore.projects.find((project) =>
      project.places.some((place) =>
        mine.has(`${place.machineId}\0${place.path}`)
      )
    );
    return holder
      ? { href: `/project/${encodeURIComponent(holder.id)}`, name: holder.name }
      : null;
  }

  async function remove(
    one: ForgottenProject,
    fromDisk: boolean
  ): Promise<void> {
    await deleteProjectForGood(one.id, fromDisk);
    refusals.delete(bringBackKey(one.id));
    list = list?.filter((each) => each !== one) ?? null;
    await read();
  }
</script>

<svelte:head>
  <title>{projectEndWords.forgottenTitle} &middot; CawCo</title>
</svelte:head>

<ForgottenPage
  bringBack={(one, name) =>
    bringBack(one.id, { forgottenAt: one.forgottenAt, name })}
  {held}
  heldSaidOf={heldSaid}
  {list}
  {holderOf}
  refusalOf={bringBackRefusal}
  removeHeld={async (one) => {
    await deleteHeld(one);
    held = held.filter((each) => each !== one);
    await read();
  }}
  reread={read}
  {remove}
  retry={async (one) => {
    await tryHeldAgain(one);
    await read();
  }}
  {unread}
/>
