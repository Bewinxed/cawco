<script lang="ts">
  /**
   * A session's accounts to move to, one PickRow each, wherever the move is
   * picked: the session card's account chip (a popover's list), and its
   * row's and tab's menus (`menu`, a context menu's radio group). Each row
   * is the account's dot, its name, and its room, or the limit it is at;
   * the check stands on `picked`, the account the session shows (the one it
   * is moving to from the moment it is picked). A row at its limit as last
   * read is asked again before its pick goes (limit-checks.svelte.ts): the
   * live dot while it is asked, then the pick goes, or Move anyway.
   */
  import { type Account, CLAUDE_PROVIDER } from "@cawco/core/accounts";
  import { detach } from "@cawco/core/detach";
  import { limitPickWords } from "@cawco/core/words/limit-picks";
  import PickList from "../pick/PickList.svelte";
  import PickRow from "../pick/PickRow.svelte";
  import { usageStore } from "../stores/usage.svelte";
  import { forcePast, pickPastLimit } from "./limit-checks.svelte";
  import { hueVar, nameOf } from "./model.svelte";
  import { limitRowOf } from "./room";
  import { roomOf } from "./room-of";

  let {
    accounts,
    picked,
    pick,
    menu = false,
  }: {
    accounts: Account[];
    /** The account the check stands on; null on none. */
    picked: string | null;
    /** The move to `id`, once the pick goes. */
    pick: (id: string) => void;
    /** The rows are a context menu's radio group, not a popover's list. */
    menu?: boolean;
  } = $props();

  /** The clock the rows' limits are read against, a minute at a time. */
  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => {
      now = Date.now();
    }, 60_000);
    return () => clearInterval(timer);
  });
</script>

<PickList label="Account" menu={menu ? { value: picked ?? "" } : undefined}>
  {#each accounts as account (account.id)}
    {@const key = `account:${account.id}`}
    {@const limit = limitRowOf(
      key,
      account.provider === CLAUDE_PROVIDER
        ? roomOf(usageStore.claudeLimits[account.id], null, now)
        : null,
      now
    )}
    <PickRow
      checking={limit.checking}
      detail={limit.detail}
      force={limit.held
        ? {
            action: limitPickWords.moveAnyway,
            onforce: () => forcePast(key, () => pick(account.id)),
          }
        : undefined}
      full={[account.label ? account.email : null, limit.detail, limit.why]
        .filter(Boolean)
        .join("\n")}
      limited={limit.limited}
      name={nameOf(account)}
      onpick={() => {
        if (limit.limited) {
          detach(
            pickPastLimit(key, account.id, null, () => pick(account.id)),
            "pickPastLimit"
          );
        } else {
          pick(account.id);
        }
      }}
      picked={account.id === picked}
      value={account.id}
    >
      {#snippet lead()}
        <span
          aria-hidden="true"
          class="size-space-2 rounded-pill bg-(--c)"
          data-box
          style:--c={hueVar(account.hue)}
        ></span>
      {/snippet}
    </PickRow>
  {/each}
</PickList>
