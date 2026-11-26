/**
 * The hub's services that are layers, merged: what `createServer` builds
 * once, on its lifetime (lifetime.ts `build`), from the four services it is
 * handed (`Db`, `Registry`, `Pending`, `HubLifetime`), and reads each of
 * them from.
 *
 * Each is a factory the hub's wiring graph finds with no dependency but
 * those services and each other (slice W1 of the backend's move to Effect):
 * the rest of `createServer`'s factories read one another through its
 * closure, most of them in one cycle, and join this layer as that cycle is
 * taken apart. A layer here makes its service and starts nothing: what
 * starts work is a step of `main` (index.ts), as `tailnet.start()` is.
 */
import { Effect, Layer } from "effect";
import { AdmissionLayer } from "./admission";
import { PageStoresLayer } from "./artifacts/page-stores";
import { openBrowserPass } from "./browser-passes";
import { DASHBOARD_PORT } from "./config";
import { dashboardUrl, secureDashboardUrl } from "./dashboard-url";
import { Db } from "./db";
import { createHubAuth, HubAuth } from "./hub-auth";
import { hubId } from "./hub-id";
import { HubRecord, HubRecordLayer } from "./hub-record";
import { LawsLayer } from "./laws";
import { HubLifetime } from "./lifetime";
import { MachineCredentialsLayer } from "./machine-credentials";
import { PreviewLinkLayer } from "./preview-control";
import { Registry } from "./registry";
import { SessionIdentities, SessionIdentitiesLayer } from "./session-identity";
import { SessionRuntimeLayer } from "./session-runtime";
import { createTailnetHttps, TailnetHttps } from "./tailnet-https";
import { ToolCallKeysLayer } from "./tool-call-keys";
import { ToolFactsLayer } from "./tool-facts";
import { TriggerSettingsLayer } from "./trigger-settings";

/**
 * HTTPS on the machine's tailnet name (tailnet-https.ts), its door relaying
 * to the dashboard on loopback. Here, not beside its class: the preview
 * server loads that file, and nothing of the hub's lifetime.
 */
const TailnetHttpsLayer = Layer.effect(TailnetHttps)(
  Effect.gen(function* () {
    return createTailnetHttps({
      dashboardPort: DASHBOARD_PORT,
      lifetime: yield* HubLifetime,
    });
  })
);

/**
 * Who asks (hub-auth.ts). Here, not beside its class: a browser's pass and
 * the dashboard's address, which it is built from, import that file.
 */
const HubAuthLayer = Layer.effect(HubAuth)(
  Effect.gen(function* () {
    const db = yield* Db;
    const registry = yield* Registry;
    const identities = yield* SessionIdentities;
    return createHubAuth({
      // A browser's pass names a machine the hub still knows: one removed
      // takes its browsers' passes with it.
      browserPass: (pass) => {
        const held = openBrowserPass(pass);
        return held && db.machineFactsOf(held.machineId) ? held : undefined;
      },
      // Where a pairing's code and QR send the person: https once a dashboard reached the hub over it.
      dashboard: () => secureDashboardUrl(registry) ?? dashboardUrl(registry),
      db: db.hubAuth,
      hubId,
      recordHubEvent: yield* HubRecord,
      session: (authorization) => identities.resolve(authorization),
      sshKeys: {
        pending: () => db.sshMachines.pendingKeys(),
        adopted: (id) => db.sshMachines.update(id, { pendingKey: null }),
      },
    });
  })
);

/** The services the others here read: made first, and kept in what the layer gives. */
const FirstLayer = Layer.mergeAll(
  HubRecordLayer,
  SessionIdentitiesLayer,
  TailnetHttpsLayer
);

export const HubLayer = Layer.mergeAll(
  AdmissionLayer,
  HubAuthLayer,
  LawsLayer,
  MachineCredentialsLayer,
  PageStoresLayer,
  PreviewLinkLayer,
  SessionRuntimeLayer,
  ToolCallKeysLayer,
  ToolFactsLayer,
  TriggerSettingsLayer
).pipe(Layer.provideMerge(FirstLayer));
