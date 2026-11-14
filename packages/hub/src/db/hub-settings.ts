/** The hub's own settings rows: the supervisor's mode, images, the fleet watch, connections, what Jev may spend, out-of-date tools. */

import type { FleetWatchNotice } from "@cawco/core/fleet-watch";
import type { OfferedMode } from "@cawco/core/harness/kinds";
import {
  DEFAULT_IMAGE_SETTINGS,
  type ImageSettings,
} from "@cawco/core/image-generation";
import { TOOL_UPDATES_DEFAULT, type ToolUpdates } from "@cawco/core/tools";
import { eq } from "drizzle-orm";
import type { DbCore } from "./core";
import {
  FLEET_WATCH_ID,
  fleetWatchNotices,
  fleetWatchSettings,
  IMAGE_SETTINGS_ID,
  imageSettings,
  JEV_SETTINGS_ID,
  jevSettings,
  OPENROUTER_CONNECTION_ID,
  openrouterConnection,
  SUPERVISOR_CONFIG_ID,
  supervisorConfig,
  TOOL_UPDATES_ID,
  toolUpdateSettings,
} from "./schema";

export interface HubSettingsDb {
  /** The fleet's choices row (`supervisor_config`) and its tool denials. */
  /** The permission mode the fleet starts a project's conversation in (`supervisor_config.caw_mode`); null for none. */
  readonly cawMode: () => OfferedMode | null;
  /** Forget the OpenRouter key. */
  readonly clearOpenRouterConnection: () => void;
  /** Takes the session's notice down; true when it had one. */
  readonly dropWatchNotice: (instanceId: string) => boolean;
  /** Whether fleet watch is on for the fleet; on while no row says otherwise. */
  readonly fleetWatchOn: () => boolean;
  /**
   * Jev's own settings: the TypeSafe key the hub holds (null while none is,
   * or when the hub's key does not open it) and the suggestions switch.
   */
  readonly getJevSettings: () => {
    suggestWhileTyping: boolean;
    typesafeKey: string | null;
    typesafeKeySetAt: Date | null;
  };
  /** The stored OpenRouter key and when it was connected, or undefined while not connected. */
  readonly getOpenRouterConnection: () =>
    { apiKey: string; connectedAt: Date } | undefined;
  readonly getSupervisorConfig: () => {
    deniedTools: string[];
    updatedAt: Date;
  };
  /** The fleet's image default; core's `DEFAULT_IMAGE_SETTINGS` while no row says otherwise. */
  readonly imageSettings: () => ImageSettings;
  /** Raises (or replaces) the session's notice. */
  readonly putWatchNotice: (notice: FleetWatchNotice) => void;
  /** Sets {@link DbShape.cawMode}; null clears it. */
  readonly setCawMode: (mode: OfferedMode | null) => void;
  readonly setFleetWatchOn: (on: boolean) => void;
  /** Sets the fleet's image default. */
  readonly setImageSettings: (settings: ImageSettings) => void;
  /** Store (or replace) the OpenRouter key from a completed PKCE exchange. */
  readonly setOpenRouterConnection: (apiKey: string) => void;
  /** Turn composer suggestions on or off. Only meaningful while Jev is on. */
  readonly setSuggestWhileTyping: (enabled: boolean) => void;
  /** Sets {@link HubSettingsDb.toolUpdates}. */
  readonly setToolUpdates: (updates: ToolUpdates) => void;
  /** Hold (or replace) the TypeSafe key; null forgets it. */
  readonly setTypesafeKey: (key: string | null) => void;
  /** What the fleet does with a copy of a tool at a version CawCo does not run; core's `TOOL_UPDATES_DEFAULT` while no row says otherwise. */
  readonly toolUpdates: () => ToolUpdates;
  /** Fleet watch's open needs-you notices, oldest first. */
  readonly watchNotices: () => FleetWatchNotice[];
}

export const hubSettingsDb = (core: DbCore): HubSettingsDb => {
  const { db, supervisorChoices, deniedToolNames } = core;

  return {
    cawMode: () => supervisorChoices().cawMode,
    setCawMode: (mode) => {
      supervisorChoices();
      db.update(supervisorConfig)
        .set({ cawMode: mode, updatedAt: new Date() })
        .where(eq(supervisorConfig.id, SUPERVISOR_CONFIG_ID))
        .run();
    },
    getSupervisorConfig: () => {
      const row = supervisorChoices();
      return {
        deniedTools: deniedToolNames(),
        updatedAt: row.updatedAt,
      };
    },
    imageSettings: () => {
      const row = db
        .select()
        .from(imageSettings)
        .where(eq(imageSettings.id, IMAGE_SETTINGS_ID))
        .get();
      return row
        ? { provider: row.provider, model: row.model }
        : DEFAULT_IMAGE_SETTINGS;
    },
    setImageSettings: (settings) => {
      db.insert(imageSettings)
        .values({ id: IMAGE_SETTINGS_ID, ...settings })
        .onConflictDoUpdate({ target: imageSettings.id, set: settings })
        .run();
    },
    fleetWatchOn: () =>
      db
        .select({ value: fleetWatchSettings.on })
        .from(fleetWatchSettings)
        .where(eq(fleetWatchSettings.id, FLEET_WATCH_ID))
        .get()?.value ?? true,
    setFleetWatchOn: (on) => {
      db.insert(fleetWatchSettings)
        .values({ id: FLEET_WATCH_ID, on })
        .onConflictDoUpdate({ target: fleetWatchSettings.id, set: { on } })
        .run();
    },
    toolUpdates: () =>
      db
        .select({ value: toolUpdateSettings.updates })
        .from(toolUpdateSettings)
        .where(eq(toolUpdateSettings.id, TOOL_UPDATES_ID))
        .get()?.value ?? TOOL_UPDATES_DEFAULT,
    setToolUpdates: (updates) => {
      db.insert(toolUpdateSettings)
        .values({ id: TOOL_UPDATES_ID, updates })
        .onConflictDoUpdate({ target: toolUpdateSettings.id, set: { updates } })
        .run();
    },
    watchNotices: () =>
      db
        .select()
        .from(fleetWatchNotices)
        .orderBy(fleetWatchNotices.at)
        .all()
        .map((row) => ({ ...row, at: row.at.getTime() })),
    putWatchNotice: (notice) => {
      const row = { ...notice, at: new Date(notice.at) };
      db.insert(fleetWatchNotices)
        .values(row)
        .onConflictDoUpdate({ target: fleetWatchNotices.instanceId, set: row })
        .run();
    },
    dropWatchNotice: (instanceId) =>
      db
        .delete(fleetWatchNotices)
        .where(eq(fleetWatchNotices.instanceId, instanceId))
        .returning({ id: fleetWatchNotices.id })
        .all().length > 0,
    getOpenRouterConnection: () => {
      const row = db
        .select()
        .from(openrouterConnection)
        .where(eq(openrouterConnection.id, OPENROUTER_CONNECTION_ID))
        .get();
      // A key the hub's key does not open reads as not connected: connect again.
      return row?.apiKey
        ? { apiKey: row.apiKey, connectedAt: row.connectedAt }
        : undefined;
    },
    getJevSettings: () => {
      const row = db
        .select()
        .from(jevSettings)
        .where(eq(jevSettings.id, JEV_SETTINGS_ID))
        .get();
      return {
        typesafeKey: row?.typesafeKey || null,
        typesafeKeySetAt: row?.typesafeKey ? row.typesafeKeySetAt : null,
        suggestWhileTyping: row?.suggestWhileTyping ?? false,
      };
    },
    setTypesafeKey: (key) => {
      const typesafeKeySetAt = key === null ? null : new Date();
      db.insert(jevSettings)
        .values({ id: JEV_SETTINGS_ID, typesafeKey: key, typesafeKeySetAt })
        .onConflictDoUpdate({
          target: jevSettings.id,
          set: { typesafeKey: key, typesafeKeySetAt },
        })
        .run();
    },
    setSuggestWhileTyping: (enabled) => {
      db.insert(jevSettings)
        .values({ id: JEV_SETTINGS_ID, suggestWhileTyping: enabled })
        .onConflictDoUpdate({
          target: jevSettings.id,
          set: { suggestWhileTyping: enabled },
        })
        .run();
    },
    setOpenRouterConnection: (apiKey) => {
      const connectedAt = new Date();
      db.insert(openrouterConnection)
        .values({ id: OPENROUTER_CONNECTION_ID, apiKey, connectedAt })
        .onConflictDoUpdate({
          target: openrouterConnection.id,
          set: { apiKey, connectedAt },
        })
        .run();
    },
    clearOpenRouterConnection: () => {
      db.delete(openrouterConnection)
        .where(eq(openrouterConnection.id, OPENROUTER_CONNECTION_ID))
        .run();
    },
  };
};
