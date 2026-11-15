import type {
  OAuthClientInformationMixed,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  connectionAreas,
  connectionProjects,
  connectionSecrets,
  connections,
  projects,
} from "./schema";

export type ConnectionRow = typeof connections.$inferSelect;

/**
 * An `app` connection's registration (connections.ts): a GitHub App the hub
 * registered from a manifest (its id, slug, private key, client and webhook
 * secrets, and once installed its installation), or a Linear OAuth app's
 * client id and secret.
 */
export type HeldApp =
  | {
      appId: string;
      clientId?: string;
      clientSecret?: string;
      /** Set once GitHub's setup redirect names it and the app's JWT reads it. */
      installationId?: string;
      privateKey: string;
      service: "github";
      slug?: string;
      webhookSecret?: string;
    }
  | { clientId: string; clientSecret: string; service: "linear" };

/**
 * A `device` connection's code sign-in under way: the device code the hub
 * polls GitHub with, the code the person enters and where, when it lapses
 * (epoch ms), and the least seconds between two polls.
 */
export interface HeldDevice {
  deviceCode: string;
  expiresAt: number;
  interval: number;
  userCode: string;
  verificationUri: string;
}

/** A `gh` connection's machine and account, whose gh the token (`key`) is read from. */
export interface HeldGh {
  host: string;
  login: string;
  machineId: string;
}

/**
 * What a connection holds, its plain facts and its secrets together: what
 * connections.ts reads and changes as one ({@link ConnectionsDb.held},
 * {@link ConnectionsDb.hold}). Stored as columns of its row and of
 * `connection_secrets`, each secret sealed alone.
 */
export interface ConnectionHeld {
  app?: HeldApp;
  client?: OAuthClientInformationMixed;
  device?: HeldDevice;
  gh?: HeldGh;
  key?: string;
  /** A GitHub App's organization, which its sign-in registers it under again when restarted from its row. */
  org?: string;
  tokens?: OAuthTokens;
  verifier?: string;
}

/** An app's registration without its secrets: what names it. */
export type AppFacts =
  | {
      appId: string;
      clientId?: string;
      installationId?: string;
      service: "github";
      slug?: string;
    }
  | { clientId: string; service: "linear" };

/**
 * What a connection's row says of it in plain columns, read with nothing
 * opened: what a match, a filter or a view decides on.
 */
export interface ConnectionFacts {
  app?: AppFacts;
  device?: Omit<HeldDevice, "deviceCode">;
  gh?: HeldGh;
  org?: string;
}

/** A nullable column's value as an optional field's. */
const given = <T>(value: T | null): T | undefined => value ?? undefined;

/** `r`'s plain facts, each placed only when every column it needs is there. */
export const factsOf = (r: ConnectionRow): ConnectionFacts => {
  const facts: ConnectionFacts = {};
  if (r.ghMachineId !== null && r.ghHost !== null && r.ghLogin !== null) {
    facts.gh = { machineId: r.ghMachineId, host: r.ghHost, login: r.ghLogin };
  }
  if (r.org !== null) {
    facts.org = r.org;
  }
  if (r.appService === "github" && r.appId !== null) {
    facts.app = {
      service: "github",
      appId: r.appId,
      clientId: given(r.appClientId),
      installationId: given(r.appInstallationId),
      slug: given(r.appSlug),
    };
  }
  if (r.appService === "linear" && r.appClientId !== null) {
    facts.app = { service: "linear", clientId: r.appClientId };
  }
  if (
    r.deviceUserCode !== null &&
    r.deviceVerificationUri !== null &&
    r.deviceExpiresAt !== null &&
    r.deviceInterval !== null
  ) {
    facts.device = {
      userCode: r.deviceUserCode,
      verificationUri: r.deviceVerificationUri,
      expiresAt: r.deviceExpiresAt.getTime(),
      interval: r.deviceInterval,
    };
  }
  return facts;
};

type SecretsRow = typeof connectionSecrets.$inferSelect;

/** What `r` holds: its facts, and the secrets each needs, opened; a part whose secret is not there (or does not open) is not held. */
const heldOf = (r: ConnectionRow, secrets: SecretsRow | undefined) => {
  const facts = factsOf(r);
  const held: ConnectionHeld = {};
  if (facts.gh) {
    held.gh = facts.gh;
  }
  if (facts.org !== undefined) {
    held.org = facts.org;
  }
  if (facts.app?.service === "github" && secrets?.appPrivateKey) {
    held.app = {
      ...facts.app,
      privateKey: secrets.appPrivateKey,
      clientSecret: given(secrets.appClientSecret),
      webhookSecret: given(secrets.appWebhookSecret),
    };
  }
  if (facts.app?.service === "linear" && secrets?.appClientSecret) {
    held.app = { ...facts.app, clientSecret: secrets.appClientSecret };
  }
  if (facts.device && secrets?.deviceCode) {
    held.device = { ...facts.device, deviceCode: secrets.deviceCode };
  }
  held.key = given(secrets?.key ?? null);
  held.tokens = given(secrets?.tokens ?? null);
  held.client = given(secrets?.client ?? null);
  held.verifier = given(secrets?.verifier ?? null);
  return held;
};

/** `held`'s plain facts as the row's columns; a part not held is null in every column. */
const factColumns = (held: ConnectionHeld) => {
  const github = held.app?.service === "github" ? held.app : undefined;
  return {
    ghMachineId: held.gh?.machineId ?? null,
    ghHost: held.gh?.host ?? null,
    ghLogin: held.gh?.login ?? null,
    org: held.org ?? null,
    appService: held.app?.service ?? null,
    appId: github?.appId ?? null,
    appSlug: github?.slug ?? null,
    appClientId: held.app?.clientId ?? null,
    appInstallationId: github?.installationId ?? null,
    deviceUserCode: held.device?.userCode ?? null,
    deviceVerificationUri: held.device?.verificationUri ?? null,
    deviceExpiresAt: held.device ? new Date(held.device.expiresAt) : null,
    deviceInterval: held.device?.interval ?? null,
  };
};

/** `held`'s secrets as `connection_secrets`' columns, each sealed by its column. */
const secretColumns = (held: ConnectionHeld) => ({
  key: held.key ?? null,
  tokens: held.tokens ?? null,
  client: held.client ?? null,
  verifier: held.verifier ?? null,
  appPrivateKey: held.app?.service === "github" ? held.app.privateKey : null,
  appClientSecret: held.app?.clientSecret ?? null,
  appWebhookSecret:
    held.app?.service === "github" ? (held.app.webhookSecret ?? null) : null,
  deviceCode: held.device?.deviceCode ?? null,
});

/** The rows connections.ts keeps; only that module opens `connection_secrets`. */
export interface ConnectionsDb {
  /** The areas that grant a connection to every project in them, by its id. */
  readonly areasOf: (id: string) => string[];
  readonly byId: (id: string) => ConnectionRow | undefined;
  readonly byName: (name: string) => ConnectionRow | undefined;
  /** The row a sign-in's redirect names by its `state`. */
  readonly bySignInState: (state: string) => ConnectionRow | undefined;
  /** What `r` holds: its plain facts and its secrets, opened ({@link ConnectionHeld}). */
  readonly held: (r: ConnectionRow) => ConnectionHeld;
  /**
   * Keeps `held` as what the connection holds, in one transaction: its
   * facts in its row's columns, its secrets each sealed alone, none of them
   * no `connection_secrets` row; what was kept as not read (`sealed_unread`)
   * is let go.
   */
  readonly hold: (id: string, held: ConnectionHeld) => void;
  readonly insert: (row: typeof connections.$inferInsert) => void;
  readonly list: () => ConnectionRow[];
  /**
   * The names of the connections a project grants its sessions: its own
   * grants and its area's, the area read as it stands now.
   */
  readonly namesForProject: (projectId: string) => string[];
  /** The projects that grant a connection, by its id. */
  readonly projectsOf: (id: string) => string[];
  /** The areas that grant it, all at once. */
  readonly setAreas: (id: string, areaIds: string[]) => void;
  /** The projects that grant it, all at once. */
  readonly setProjects: (id: string, projectIds: string[]) => void;
  readonly update: (
    id: string,
    patch: Partial<Omit<ConnectionRow, "id" | "createdAt">>
  ) => void;
}

export const connectionsDb = (db: BunSQLiteDatabase): ConnectionsDb => ({
  areasOf: (id) =>
    db
      .select({ areaId: connectionAreas.areaId })
      .from(connectionAreas)
      .where(eq(connectionAreas.connectionId, id))
      .all()
      .map((row) => row.areaId),
  byId: (id) =>
    db.select().from(connections).where(eq(connections.id, id)).get(),
  byName: (name) =>
    db.select().from(connections).where(eq(connections.name, name)).get(),
  bySignInState: (state) =>
    db
      .select()
      .from(connections)
      .where(eq(connections.signInState, state))
      .get(),
  held: (r) =>
    heldOf(
      r,
      db
        .select()
        .from(connectionSecrets)
        .where(eq(connectionSecrets.connectionId, r.id))
        .get()
    ),
  hold: (id, held) => {
    const secrets = secretColumns(held);
    db.transaction((tx) => {
      tx.update(connections)
        .set({
          ...factColumns(held),
          sealedUnread: null,
          updatedAt: new Date(),
        })
        .where(eq(connections.id, id))
        .run();
      if (Object.values(secrets).every((one) => one === null)) {
        tx.delete(connectionSecrets)
          .where(eq(connectionSecrets.connectionId, id))
          .run();
        return;
      }
      tx.insert(connectionSecrets)
        .values({ connectionId: id, ...secrets })
        .onConflictDoUpdate({
          target: connectionSecrets.connectionId,
          set: secrets,
        })
        .run();
    });
  },
  insert: (row) => {
    db.insert(connections).values(row).run();
  },
  list: () => db.select().from(connections).orderBy(connections.name).all(),
  namesForProject: (projectId) => {
    const own = db
      .select({ name: connections.name })
      .from(connectionProjects)
      .innerJoin(
        connections,
        eq(connections.id, connectionProjects.connectionId)
      )
      .where(eq(connectionProjects.projectId, projectId))
      .all()
      .map((row) => row.name);
    const areaId = db
      .select({ areaId: projects.areaId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .get()?.areaId;
    const area = areaId
      ? db
          .select({ name: connections.name })
          .from(connectionAreas)
          .innerJoin(
            connections,
            eq(connections.id, connectionAreas.connectionId)
          )
          .where(eq(connectionAreas.areaId, areaId))
          .all()
          .map((row) => row.name)
      : [];
    return [...new Set([...own, ...area])];
  },
  projectsOf: (id) =>
    db
      .select({ projectId: connectionProjects.projectId })
      .from(connectionProjects)
      .where(eq(connectionProjects.connectionId, id))
      .all()
      .map((row) => row.projectId),
  setAreas: (id, areaIds) => {
    db.transaction((tx) => {
      tx.delete(connectionAreas)
        .where(eq(connectionAreas.connectionId, id))
        .run();
      for (const areaId of new Set(areaIds)) {
        tx.insert(connectionAreas).values({ connectionId: id, areaId }).run();
      }
    });
  },
  setProjects: (id, projectIds) => {
    db.transaction((tx) => {
      tx.delete(connectionProjects)
        .where(eq(connectionProjects.connectionId, id))
        .run();
      for (const projectId of new Set(projectIds)) {
        tx.insert(connectionProjects)
          .values({ connectionId: id, projectId })
          .run();
      }
    });
  },
  update: (id, patch) => {
    db.update(connections)
      .set({ ...patch, updatedAt: patch.updatedAt ?? new Date() })
      .where(eq(connections.id, id))
      .run();
  },
});
