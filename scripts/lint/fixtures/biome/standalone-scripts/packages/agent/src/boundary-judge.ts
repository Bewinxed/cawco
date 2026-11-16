// Planted: core by package name, and a sibling not written beside it.
import { isRecord } from "@cawco/core/is-record";
import { quote } from "./shell";

// Left alone: Node's built-ins, the protocol beside it, and the judge it loads by a computed path.
import { createServer } from "node:net";
import { join } from "node:path";
import { JUDGE_READY } from "./boundary/protocol";

export const judge = await import(join(import.meta.dir, "workspace-judge.ts"));
export const used = [isRecord, quote, createServer, JUDGE_READY];
