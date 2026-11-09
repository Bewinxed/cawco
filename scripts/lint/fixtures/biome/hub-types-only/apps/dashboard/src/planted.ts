import type { HubApp } from "@cawco/hub/src/app";
import { createServer } from "@cawco/hub/src/server";
import { type HubApp as Again } from "@cawco/hub/src/app";
import * as hub from "@cawco/hub";

export type Both = [HubApp, Again, typeof createServer, typeof hub];
