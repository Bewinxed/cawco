// Planted: the client taking the hub's code.
import { createServer } from "./server";
import { type HubApp } from "./app";
import { problem } from "@cawco/hub/refusal";

// Left alone: the hub's types, and a library.
import type { HubApp as App } from "./app";
import { join } from "node:path";

export type Seen = [HubApp, App];
export const used = [createServer, problem, join];
