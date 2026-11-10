/**
 * The machines the hub knows: reading them, their media, and removing one.
 */

import { Elysia, problem, t } from "elysia";
import { hidden } from "../hidden";
import type { HubContext } from "../hub-context";
import { machineOut } from "../machine-out";

/**
 * A file's bytes as an answer to a request that may ask for a range of them:
 * a video element asks for ranges, and Safari plays nothing from a server
 * that answers a range with the whole file.
 */
const rangedResponse = (
  bytes: Uint8Array<ArrayBuffer>,
  mediaType: string,
  rangeHeader: string | null
): Response => {
  const total = bytes.byteLength;
  const headers = {
    "Content-Type": mediaType,
    "Cache-Control": "no-store",
    "Accept-Ranges": "bytes",
  };
  const range = BYTE_RANGE.exec(rangeHeader ?? "");
  if (!(range && (range[1] || range[2]))) {
    return new Response(bytes, {
      headers: { ...headers, "Content-Length": String(total) },
    });
  }
  const [, from, to] = range;
  const start = from ? Number(from) : Math.max(0, total - Number(to));
  const end = from && to ? Math.min(Number(to), total - 1) : total - 1;
  if (start > end || start >= total) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${total}` },
    });
  }
  return new Response(bytes.slice(start, end + 1), {
    status: 206,
    headers: {
      ...headers,
      "Content-Range": `bytes ${start}-${end}/${total}`,
      "Content-Length": String(end - start + 1),
    },
  });
};

/** A `Range: bytes=a-b` header (one range, either end open). */
const BYTE_RANGE = /^bytes=(\d*)-(\d*)$/u;

export const agentListRoutes = ({
  db,
  machineFault,
  machineRow,
  withPresence,
}: Pick<HubContext, "db" | "machineFault" | "machineRow" | "withPresence">) =>
  new Elysia()
    // The fleet's list is the person's. A machine reads its own row alone,
    // by its own id (hub-auth.ts): what its CLI's health, install and
    // service checks ask.
    .get("/api/agents", () => withPresence(db.listAgents()).map(machineOut))
    .get("/api/agents/:machineId", hidden, ({ params }) => {
      const row = machineRow(params.machineId);
      return row
        ? machineOut(row)
        : problem(404, {
            code: "no-machine",
            detail: machineFault(params.machineId, "unknown"),
          });
    });

export const agentMediaRoutes = ({
  contact,
  db,
  forgetInstances,
  hubAuth,
  machineCredentials,
  machineFault,
  publishInstances,
  readMachineMedia,
  registry,
  sshTunnels,
}: Pick<
  HubContext,
  | "contact"
  | "db"
  | "forgetInstances"
  | "hubAuth"
  | "machineCredentials"
  | "machineFault"
  | "publishInstances"
  | "readMachineMedia"
  | "registry"
  | "sshTunnels"
>) =>
  new Elysia()
    // What a restart polls to find a moment that cuts nothing in half.
    // A picture or video on a machine's disk, for the transcript's cards. No
    // caching: the file is the agent's working state and may be rewritten or
    // removed between two looks.
    .get(
      "/api/agents/:machineId/media",
      { query: t.Object({ path: t.String() }) },
      async ({ params, query, request }) => {
        const answer = await readMachineMedia(params.machineId, query.path);
        if (answer === "offline") {
          return problem(503, {
            code: "machine-offline",
            detail: machineFault(params.machineId, "offline"),
          });
        }
        if (answer === "timeout") {
          return problem(504, {
            code: "machine-silent",
            detail: machineFault(params.machineId, "silent"),
          });
        }
        if ("refused" in answer) {
          return problem(404, {
            code: "agent-refused",
            detail: answer.refused,
          });
        }
        return rangedResponse(
          answer.bytes,
          answer.mediaType,
          request.headers.get("range")
        );
      }
    )
    // Forgetting a machine the fleet no longer has. Only an offline one: a
    // connected daemon would register straight back, and its sessions are
    // live. Nothing on the machine is touched — if its agent ever starts
    // again it rejoins as new, and its stored transcripts come back with it.
    // One never listed (admitted, or added over SSH, whose agent never
    // proved its key) has no row, and what the hub holds for it goes all
    // the same: its key, its held connection, its SSH connection.
    .delete("/api/agents/:machineId", ({ params }) => {
      const row = db
        .listAgents()
        .find((agent) => agent.machineId === params.machineId);
      if (!row) {
        if (!(
          hubAuth.holdsMachine(params.machineId) ||
          sshTunnels.holds(params.machineId)
        )) {
          return problem(404, {
            code: "no-machine",
            detail: "No machine with that id on this hub.",
          });
        }
        hubAuth.forgetMachine(params.machineId);
        sshTunnels.forget(params.machineId);
        return { sessions: 0 };
      }
      if (registry.agent(params.machineId)) {
        return problem(409, {
          code: "online-stop-agent-first",
          detail: `${row.hostname} is online. Stop its agent first, then remove it.`,
        });
      }
      const gone = db.deleteMachine(params.machineId);
      forgetInstances(gone.instanceIds);
      contact.forget(params.machineId);
      // A removed machine proves nothing to the git remote any more.
      machineCredentials.forget(params.machineId);
      // Its key, a connection held for it and a refusal go too: if it
      // comes back, the person admits it again.
      hubAuth.forgetMachine(params.machineId);
      // The hub's SSH connection to it, if it was added over SSH, ends.
      sshTunnels.forget(params.machineId);
      // The frame that carries the machine list: every dashboard drops the
      // machine and its sessions without a reload.
      publishInstances(params.machineId);
      return { sessions: gone.instanceIds.length };
    });
