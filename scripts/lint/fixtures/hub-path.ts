// The hub paths house/hub-path-by-hand must refuse (expected.txt), and those it must let stand.
import { hubClient } from "../../../packages/hub/src/client";

declare const base: string;
declare const id: string;
declare const url: URL;

await fetch("/api/projects");
await fetch(`${base}/api/projects/${id}/tasks`);
const health = "http://127.0.0.1:3456/health";

// Asked through Eden, compared, or no hub's: each stands.
await hubClient(base, fetch).api.projects.get();
const asked = url.pathname === "/api/find" || url.pathname.startsWith("/api/");
switch (url.pathname) {
  case "/api/jev":
    break;
  default:
}
const notApi = "/apiary/honey";

export { asked, health, notApi };
