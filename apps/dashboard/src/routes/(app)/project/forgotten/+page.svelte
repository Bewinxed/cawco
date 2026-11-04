<script lang="ts">
  /**
   * Forgotten projects: the hub's trash of projects (`GET
   * /api/projects/forgotten`), opened from the glyph in the rail's Projects
   * head and from a refused Bring back. Read as the page opens and again
   * whenever the projects change (a forget, a restore, a delete anywhere),
   * the last good list kept while it is read again.
   */
  import { detach } from "@cawco/core/detach";
  import type { ForgottenProject } from "@cawco/core/forgotten-project";
  import { projectEndWords } from "@cawco/core/words/project-ends";
  import {
    cawco,
    deleteProjectForGood,
    readForgottenProjects,
  } from "#lib/cawco/client.svelte.js";
  import ForgottenPage from "#lib/cawco/forgotten/ForgottenPage.svelte";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { bringBack, bringBackKey } from "#lib/cawco/project-end.svelte.js";
  import { refusals } from "#lib/cawco/refusals.svelte.js";

  let list = $state<ForgottenProject[] | null>(null);
  let unread = $state<string | null>(null);
  /** The latest read: an answer to an earlier one is dropped. */
  let latest = 0;

  async function read(): Promise<void> {
    latest += 1;
    const mine = latest;
    try {
      const answer = await readForgottenProjects();
      if (mine === latest) {
        list = answer;
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
    if (cawco.projects) {
      detach(read(), "forgotten");
    }
  });

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
  {list}
  refusalOf={(id) => refusals.reason(bringBackKey(id))}
  reread={read}
  {remove}
  {unread}
/>
