/**
 * A machine never keeps a store for an account its hub removed. At every
 * connect the machine agent names its account stores (every id under
 * `~/.cawco/accounts/`), the hub answers the ones it removed (while this
 * machine was offline, or joined into another), and each is forgotten here
 * the way removing the account forgets it on a machine that is online
 * (`forgetOn`): Claude Code signs its dir out, pi-ai a provider credential,
 * and the store goes. A store the hub has never heard of is never named:
 * the hub keeps a record of what it removed. This is the one path that
 * clears a removed account's store from a machine that missed its removal.
 */
import { existsSync, readdirSync } from "node:fs";
import {
  accountConfigDir,
  accountCredentialPath,
  accountsRoot,
} from "@cawco/core/paths";
import { changingSignins, removeAccountDir } from "./accounts";
import { forgetAccount } from "./login";
import { forgetProviderAccount } from "./provider-accounts";

/** Every account id with a store on this machine. */
export const accountStoreIds = (): string[] => {
  try {
    return readdirSync(accountsRoot(), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
};

/**
 * Forgets each store the hub named as an account it removed. Only ids this
 * machine itself listed are acted on; a store whose sign-out fails is left
 * for the next connect, and the others go on.
 */
export const forgetUnknownAccounts = async (ids: string[]): Promise<void> => {
  const ours = new Set(accountStoreIds());
  for (const id of ids.filter((one) => ours.has(one))) {
    try {
      if (existsSync(accountConfigDir(id))) {
        // biome-ignore lint/performance/noAwaitInLoops: one store at a time, each signed out by its own harness
        await changingSignins(forgetAccount(id));
      }
      if (existsSync(accountCredentialPath(id))) {
        await forgetProviderAccount(id);
      }
      await removeAccountDir(id);
      console.log(
        `[accounts] ${id}: the hub removed this account; signed out and removed here`
      );
    } catch (error) {
      console.warn(
        `[accounts] ${id}: the hub removed this account, but it could not be signed out here: ${error instanceof Error ? error.message : String(error)}; tried again at the next connect`
      );
    }
  }
};
