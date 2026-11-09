import type { HubApp } from "@cawco/hub/app";
import { createServer } from "@cawco/hub/src/server";
import { type HubApp as Again } from "@cawco/hub/app";
import * as hub from "@cawco/hub";
import "@cawco/hub/src/server";

export type { HubApp as Reexported } from "@cawco/hub/app";
export { createServer as made } from "@cawco/hub/src/server";
export * from "@cawco/hub";

export const later = () => import("@cawco/hub/src/server");
export const required = () => require("@cawco/hub/src/server");

export type Both = [HubApp, Again, typeof createServer, typeof hub];
