<script lang="ts">
  /**
   * A session's accounts to move to, one PickRow each, wherever the move is
   * picked: the session card's account chip (a popover's list), and its
   * row's and tab's menus (`menu`, a context menu's radio group). Each row
   * is the account's dot, its name, and its room (the house ring and its
   * figure), or the limit it is at;
   * the check stands on `picked`, the account the session shows (the one it
   * is moving to from the moment it is picked). A row at its limit as last
   * read is asked again before its pick goes (limit-checks.svelte.ts): the
   * live dot while it is asked, then the pick goes, or Move anyway.
   *
   * Where the pick may also be the fleet's routing (a project's account),
   * `auto` stands first as a row of its own, its lead empty, checked while
   * `picked` is null; `note` says, in place of an account's room, what keeps
   * it from taking a session (signed out everywhere).
   */
  import { type Account, CLAUDE_PROVIDER } from "@cawco/core/accounts";
  import { detach } from "@cawco/core/detach";
  import { limitPickWords } from "@cawco/core/words/limit-picks";
  import PickList from "../pick/PickList.svelte";
  import PickRow from "../pick/PickRow.svelte";
  import { usageStore } from "../stores/usage.svelte";
  import { forcePast, pickPastLimit } from "./limit-checks.svelte";
  import { minuteClock } from "./minute-clock.svelte";
  import { hueVar, nameOf } from "./model.svelte";
  import { limitRowOf, meterOf } from "./room";
  import { roomOf } from "./room-of";

  let {
    accounts,
    picked,
    pick,
    menu = false,
    auto,
    note,
  }: {
    accounts: Account[];
    /** The account the check stands on; null on none. */
    picked: string | null;
    /** The move to `id`, once the pick goes. */
    pick: (id: string) => void;
    /** The rows are a context menu's radio group, not a popover's list. */
    menu?: boolean;
    /** The fleet's routing as the first row: its name, its line, its pick. */
    auto?: { name: string; detail?: string; onpick: () => void };
    /** An account's line in place of its room, where something keeps it from taking a session. */
    note?: (id: string) => string | null;
  } = $props();

  /** The clock the rooms are read against, a minute at a time. */
  const clock = minuteClock();
</script>

<PickList label="Account" menu={menu ? { value: picked ?? "" } : undefined}>
  {#if auto}
    <PickRow
      detail={auto.detail ?? ""}
      full={auto.detail ?? ""}
      name={auto.name}
      onpick={auto.onpick}
      picked={picked === null}
      value=""
    >
      {#snippet lead()}
        <span aria-hidden="true" class="size-space-2" data-box></span>
      {/snippet}
    </PickRow>
  {/if}
  {#each accounts as account (account.id)}
    {@const key = `account:${account.id}`}
    {@const room =
      account.provider === CLAUDE_PROVIDER
        ? roomOf(usageStore.claudeLimits[account.id], null, clock.now)
        : null}
    {@const limit = limitRowOf(key, room, clock.now)}
    {@const said = note?.(account.id) ?? null}
    <PickRow
      checking={limit.checking}
      detail={said ?? limit.detail}
      force={limit.held
        ? {
            action: limitPickWords.moveAnyway,
            onforce: () => forcePast(key, () => pick(account.id)),
          }
        : undefined}
      full={[
        account.label ? account.email : null,
        said ?? limit.detail,
        limit.why,
      ]
        .filter(Boolean)
        .join("\n")}
      limited={limit.limited}
      meter={said === null ? meterOf(room) : null}
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
