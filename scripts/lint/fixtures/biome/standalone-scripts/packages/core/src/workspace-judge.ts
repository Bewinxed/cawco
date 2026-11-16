// Planted: a sibling module, by value, by an inline type, re-exported, on demand and by require.
import { errnoCode } from "./absent";
import { type HarnessKind as Kind } from "./harness/kinds";
export { isRecord } from "./is-record";
import "./effect";
export const later = () => import("./later");
export const old = require("./old");

// Left alone: Node's built-ins, by scheme and by bare name, and a type.
import { readFileSync } from "node:fs";
import { readFile } from "fs/promises";
import { join } from "path";
import type { HarnessKind } from "./harness/kinds";
export type { Policy } from "./policy";

export type Seen = [HarnessKind, Kind];
export const used = [errnoCode, readFileSync, readFile, join];
