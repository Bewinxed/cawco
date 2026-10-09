/**
 * pi sessions on CawCo accounts. A session on an account runs on a runtime
 * whose credential store is composite: the account's provider reads the
 * account's one credential (`~/.cawco/accounts/<id>/credential.json`, the
 * agent's), every other provider the machine's own `~/.pi/agent/auth.json`,
 * so a session on an account still sees the proxy and key models it always
 * did. pi 1.0.1's `ModelRuntime.create({ credentials })` takes the store
 * (dist/core/model-runtime.d.ts: `credentials?: CredentialStore`).
 *
 * pi never writes the account's credential: when pi wants it refreshed (its
 * `getAuth` refreshes under `modify` within five minutes of expiry), the
 * store asks the agent to refresh it (`POST /accounts/<id>/fresh` on the
 * agent's local gateway) and reads it again. The agent alone refreshes it,
 * through pi-ai's own refresh.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mcpGatewayPort } from "@cawco/core";
import { accountCredentialPath } from "@cawco/core/paths";
import type {
  AuthOperationOptions,
  Credential,
  CredentialInfo,
  CredentialStore,
} from "@earendil-works/pi-ai";
import { getAgentDir, ModelRuntime } from "@earendil-works/pi-coding-agent";

/** The machine's own pi auth file, where pi itself reads it. */
const machineAuthPath = (): string => join(getAgentDir(), "auth.json");

/**
 * pi's own file-backed store class. pi 1.0.1 exports no constructor for it
 * (its package `exports` stop at `.`); the runtime pi builds with no
 * `credentials` holds one (`new RuntimeCredentials(AuthStorage.create(path))`,
 * dist/core/model-runtime.js:79, its `store`, dist/core/runtime-credentials.js:3),
 * so the class is read off that one store. Any other shape is refused loudly.
 */
interface FileStoreClass {
  create: (authPath?: string) => CredentialStore;
}
let fileStoreClass: Promise<FileStoreClass> | undefined;
const machineStore = async (): Promise<CredentialStore> => {
  fileStoreClass ??= (async () => {
    const runtime = await ModelRuntime.create({
      refreshOnCreate: false,
      modelsPath: null,
      authPath: machineAuthPath(),
    });
    const store = (
      runtime as unknown as {
        credentials?: { store?: { constructor?: unknown } };
      }
    ).credentials?.store;
    const cls = store?.constructor as Partial<FileStoreClass> | undefined;
    if (typeof cls?.create !== "function") {
      throw new Error(
        "This pi build keeps its credentials in a shape CawCo does not know, so its sessions cannot run on CawCo accounts."
      );
    }
    return cls as FileStoreClass;
  })();
  return (await fileStoreClass).create(machineAuthPath());
};

/** The account's credential and its provider, as the agent last wrote it. */
const readAccount = (
  accountId: string
): { credential: Credential; provider: string } | undefined => {
  try {
    const [entry] = Object.entries(
      JSON.parse(
        readFileSync(accountCredentialPath(accountId), "utf8")
      ) as Record<string, Credential>
    );
    return entry ? { provider: entry[0], credential: entry[1] } : undefined;
  } catch {
    return undefined;
  }
};

/** Asks the agent to refresh the account's credential; it answers once it has, or why not. */
const askFresh = async (accountId: string): Promise<void> => {
  const response = await fetch(
    `http://127.0.0.1:${mcpGatewayPort()}/accounts/${encodeURIComponent(accountId)}/fresh`,
    { method: "POST", signal: AbortSignal.timeout(60_000) }
  );
  if (!response.ok) {
    throw new Error(
      `The agent did not refresh the account's sign-in: ${await response.text()}`
    );
  }
};

/** The account's provider from its store; everything else from the machine's. */
class AccountCredentials implements CredentialStore {
  readonly #accountId: string;
  readonly #provider: string;
  readonly #machine: CredentialStore;

  constructor(accountId: string, provider: string, machine: CredentialStore) {
    this.#accountId = accountId;
    this.#provider = provider;
    this.#machine = machine;
  }

  read(providerId: string, options?: AuthOperationOptions) {
    if (providerId !== this.#provider) {
      return this.#machine.read(providerId, options);
    }
    return Promise.resolve(readAccount(this.#accountId)?.credential);
  }

  async list(
    options?: AuthOperationOptions
  ): Promise<readonly CredentialInfo[]> {
    const machine = await this.#machine.list(options);
    const held = readAccount(this.#accountId);
    return [
      ...machine.filter((one) => one.providerId !== this.#provider),
      ...(held
        ? [{ providerId: this.#provider, type: held.credential.type }]
        : []),
    ];
  }

  /** pi refreshing the account's credential: the agent does it, and this reads the result. */
  async modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
    options?: AuthOperationOptions
  ): Promise<Credential | undefined> {
    if (providerId !== this.#provider) {
      return await this.#machine.modify(providerId, fn, options);
    }
    await askFresh(this.#accountId);
    return readAccount(this.#accountId)?.credential;
  }

  delete(providerId: string, options?: AuthOperationOptions): Promise<void> {
    if (providerId !== this.#provider) {
      return this.#machine.delete(providerId, options);
    }
    return Promise.reject(
      new Error(
        "A CawCo account's sign-in is forgotten in Configure → Accounts, not by a session."
      )
    );
  }
}

/**
 * The runtime a session on the account runs on: its provider's credential
 * from the account, everything else from the machine. Models, settings and
 * sessions are the machine's, so a session moves between accounts by being
 * reopened on another account's runtime.
 */
export const accountRuntime = async (
  accountId: string
): Promise<ModelRuntime> => {
  const held = readAccount(accountId);
  if (!held) {
    throw new Error(
      `CawCo account ${accountId} holds no sign-in on this machine; sign it in on this machine in Configure → Accounts.`
    );
  }
  return await ModelRuntime.create({
    refreshOnCreate: false,
    credentials: new AccountCredentials(
      accountId,
      held.provider,
      await machineStore()
    ),
  });
};
