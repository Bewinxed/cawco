/**
 * A machine never keeps a store for an account its hub doesn't have. At
 * every connect the machine agent names its account stores (every id under
 * `~/.cawco/accounts/`), the hub answers the ids it has no account for (one
 * removed while this machine was offline, or joined into another), and each
 * is forgotten here the way removing the account forgets it on a machine
 * that is online (`forgetOn`): Claude Code signs its dir out, pi-ai a
 * provider credential, and the store goes. This is the one path that clears
 * a removed account's store from a machine that missed its removal.
 */
import { existsSync, readdirSync } from "node:fs";
import {
  accountConfigDir,
  accountCredentialPath,
  accountsRoot,
  removeAccountRoot,
} from "@cawco/core/paths";
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
 * Forgets each store the hub named as no account of its own. Only ids this
 * machine itself listed are acted on; a store whose sign-out fails is left
 * for the next connect, and the others go on.
 */
export const forgetUnknownAccounts = async (ids: string[]): Promise<void> => {
  const ours = new Set(accountStoreIds());
  for (const id of ids.filter((one) => ours.has(one))) {
    try {
      if (existsSync(accountConfigDir(id))) {
        // biome-ignore lint/performance/noAwaitInLoops: one store at a time, each signed out by its own harness
        await forgetAccount(id);
      }
      if (existsSync(accountCredentialPath(id))) {
        await forgetProviderAccount(id);
      }
      await removeAccountRoot(id);
      console.log(
        `[accounts] ${id}: the hub has no such account; signed out and removed here`
      );
    } catch (error) {
      console.warn(
        `[accounts] ${id}: the hub has no such account, but it could not be signed out here: ${error instanceof Error ? error.message : String(error)}; tried again at the next connect`
      );
    }
  }
};
