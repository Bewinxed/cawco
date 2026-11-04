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
  import ForgottenProjects from "#lib/cawco/forgotten/ForgottenProjects.svelte";
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

<!-- The pages' one gutter (as Usage stands on it), the ledger capped at the
     house's section width so its columns stay beside their names. -->
<div
  class="min-w-0 flex-auto overflow-y-auto pt-space-6 pr-space-6 pb-space-6 pl-space-7 max-desk:px-space-5 max-phone:px-space-5 max-phone:py-space-4"
>
  <div class="flex max-w-c-config-max-w flex-col gap-space-group">
    <header class="flex min-w-0 flex-col gap-space-1">
      <h1 class="m-0 type-title text-balance text-ink-strong">
        {projectEndWords.forgottenTitle}
      </h1>
      <p class="m-0 type-body text-pretty text-ink-muted">
        {projectEndWords.forgottenLine}
      </p>
    </header>
    <div class="rounded-lg bg-surface-raised px-space-4 py-space-2 shadow-tile">
      <ForgottenProjects
        bringBack={(one, name) =>
          bringBack(one.id, { forgottenAt: one.forgottenAt, name })}
        {list}
        refusalOf={(id) => refusals.reason(bringBackKey(id))}
        reread={read}
        {remove}
        {unread}
      />
    </div>
  </div>
</div>
