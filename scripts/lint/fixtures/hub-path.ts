// The hub paths house/hub-path-by-hand must refuse (expected.txt), and those it must let stand.
import { hubRequest } from "../../../packages/core/src/hub-request";

declare const base: string;
declare const id: string;
declare const url: URL;

await fetch("/api/projects");
await fetch(`${base}/api/projects/${id}/tasks`);
const health = "http://127.0.0.1:3456/health";

// Built by the door, compared, or no hub's: each stands.
await fetch(hubRequest("GET /api/projects").path);
const asked = url.pathname === "/api/find" || url.pathname.startsWith("/api/");
switch (url.pathname) {
  case "/api/jev":
    break;
  default:
}
const notApi = "/apiary/honey";

export { asked, health, notApi };
