// Planted: the hub's code in the CLI, at its top and on demand.
import { createServer } from "@cawco/hub";

// Left alone: its client.
import { refusalText, unwrap } from "@cawco/hub/client";

export const used = [createServer, refusalText, unwrap];
export const later = () => import("@cawco/hub");
