/** biome-ignore-all lint/style/useFilenamingConvention: the spec fixes this public module name. */
import type { HarnessKind } from "@cawco/core";
import { z } from "zod";
import { HarnessKindSchema, ModelUseSchema } from "#lib/cawco/stored-shapes.js";
import { MODEL_STORAGE_PREFIX } from "../models.svelte";
import { readJson, writeJson } from "../storage";

export interface ModelUse {
  lastSpawnAt?: string;
  lastUsedAt: Record<string, string>;
}

const KEY = `${MODEL_STORAGE_PREFIX}:use`;
const history = $state(
  readJson(KEY, z.partialRecord(HarnessKindSchema, ModelUseSchema), {})
);

export function recordModelUse(harness: HarnessKind, id: string): void {
  const now = new Date().toISOString();
  history[harness] ??= { lastUsedAt: {} };
  const use = history[harness];
  use.lastSpawnAt = now;
  if (id) {
    use.lastUsedAt[id] = now;
  }
  writeJson(KEY, history);
}

export function lastSpawnAt(harness: HarnessKind): string | undefined {
  return history[harness]?.lastSpawnAt;
}

export function lastUsedAt(
  harness: HarnessKind,
  id: string
): string | undefined {
  return history[harness]?.lastUsedAt[id];
}
