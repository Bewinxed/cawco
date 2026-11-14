// Planted: the hub's code by its package name, other than its client.
import { createServer } from "@cawco/hub";
import { type HubApp } from "@cawco/hub/app";
import "@cawco/hub/app";
export { createServer as server } from "@cawco/hub";

// Left alone: the hub's types, and its client.
import type { HubApp as App } from "@cawco/hub/app";
import { hubClient, hubPath } from "@cawco/hub/client";
import type { HubClient } from "@cawco/hub/client";

export type Seen = [HubApp, App, HubClient];
export const used = [createServer, hubClient, hubPath];
