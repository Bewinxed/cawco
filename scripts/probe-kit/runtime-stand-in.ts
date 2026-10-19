/**
 * A container runtime's Engine API as a stand-in on a unix socket: it says
 * who it is (`/_ping`, `/version`, `/info`, what agent runtime.ts
 * `probeEndpoint` asks) and refuses everything else, so an agent finds a
 * runtime there and runs nothing on it. relay-journey.ts stands one at a
 * Colima profile's socket, so the agent reads Colima's running settings.
 */

/** A version prefix dockerode may put before a path: `/v1.46/info`. */
const API_VERSION = /^\/v\d+\.\d+/;

/** The Engine API's answers at `socket`, as Docker Engine `version` and `info` (`operatingSystem`, as `info` names it) say. */
export const engineStandIn = (socket: string, operatingSystem: string) => {
  const asked: string[] = [];
  const server = Bun.serve({
    unix: socket,
    fetch: (request) => {
      const path = new URL(request.url).pathname.replace(API_VERSION, "");
      asked.push(`${request.method} ${path}`);
      if (path === "/_ping") {
        return new Response("OK", {
          headers: { "content-type": "text/plain" },
        });
      }
      if (path === "/version") {
        return Response.json({
          Version: "28.4.0",
          ApiVersion: "1.51",
          Components: [{ Name: "Engine", Version: "28.4.0" }],
        });
      }
      if (path === "/info") {
        return Response.json({
          Name: "probe-engine",
          OperatingSystem: operatingSystem,
          SecurityOptions: ["name=seccomp,profile=builtin"],
        });
      }
      return Response.json(
        { message: `the stand-in engine answers no ${request.method} ${path}` },
        { status: 501 }
      );
    },
  });
  return { server, asked };
};
