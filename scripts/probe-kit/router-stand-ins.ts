/**
 * A home router's port mappers as local stand-ins, so a spec maps ports with
 * no request reaching a real router: a UPnP Internet Gateway Device (IGD v1
 * or v2, its descriptor, its service description and its SOAP control URL)
 * and a NAT-PMP responder (RFC 6886), each keeping the table a spec reads.
 * relay-journey.ts names them to the agent; any spec can stand one up.
 */
import { createSocket, type Socket } from "node:dgram";

/** One mapping in a stand-in router's table. */
export interface RouterMapping {
  client: string;
  lease: number;
  port: number;
  protocol: string;
}

/** A SOAPAction header's action: `"urn:…:WANIPConnection:2#AddAnyPortMapping"`. */
const SOAP_ACTION = /#(\w+)"?$/;

/** WANIPConnection's actions as each version's service description lists them. */
const ACTIONS_V1 = [
  "GetExternalIPAddress",
  "AddPortMapping",
  "DeletePortMapping",
  "GetSpecificPortMappingEntry",
  "GetGenericPortMappingEntry",
];
const ACTIONS_V2 = [
  ...ACTIONS_V1,
  "AddAnyPortMapping",
  "DeletePortMappingRange",
  "GetListOfPortMappings",
];

/**
 * A UPnP gateway answering on 127.0.0.1: IGD v1 or v2 by `mode.version`;
 * `mode.off` answers its descriptor 404 (a router with UPnP turned off);
 * `mode.refuse` refuses every mapping (718), `mode.cap` every one past that
 * many (728), and `mode.permanentOnly` every finite lease (725,
 * OnlyPermanentLeasesSupported). Every action asked is kept in `actions`
 * (`AddPortMapping UDP 3478 3600`), and every document fetched in `fetched`.
 */
export const upnpGatewayStandIn = (publicAddress: string) => {
  const mode = {
    version: 1 as 1 | 2,
    off: false as boolean,
    refuse: false as boolean,
    cap: null as number | null,
    permanentOnly: false as boolean,
  };
  const table = new Map<string, RouterMapping>();
  const actions: string[] = [];
  const fetched: string[] = [];
  const envelope = (inner: string) =>
    `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body>${inner}</s:Body></s:Envelope>`;
  const xml = (text: string, status = 200) =>
    new Response(text, {
      status,
      headers: { "content-type": 'text/xml; charset="utf-8"' },
    });
  const fault = (code: number, said: string) =>
    xml(
      envelope(
        `<s:Fault><faultcode>s:Client</faultcode><faultstring>UPnPError</faultstring><detail><UPnPError xmlns="urn:schemas-upnp-org:control-1-0"><errorCode>${code}</errorCode><errorDescription>${said}</errorDescription></UPnPError></detail></s:Fault>`
      ),
      500
    );
  const answer = (service: string, action: string, inner = "") =>
    xml(
      envelope(
        `<u:${action}Response xmlns:u="${service}">${inner}</u:${action}Response>`
      )
    );
  const descriptor = (v: 1 | 2, service: string) =>
    xml(
      `<?xml version="1.0"?><root xmlns="urn:schemas-upnp-org:device-1-0"><specVersion><major>1</major><minor>0</minor></specVersion><device><deviceType>urn:schemas-upnp-org:device:InternetGatewayDevice:${v}</deviceType><friendlyName>probe gateway</friendlyName><manufacturer>CawCo probe</manufacturer><modelName>probe IGD v${v}</modelName><UDN>uuid:probe-igd-${v}</UDN><deviceList><device><deviceType>urn:schemas-upnp-org:device:WANDevice:${v}</deviceType><UDN>uuid:probe-wan</UDN><deviceList><device><deviceType>urn:schemas-upnp-org:device:WANConnectionDevice:${v}</deviceType><UDN>uuid:probe-conn</UDN><serviceList><service><serviceType>${service}</serviceType><serviceId>urn:upnp-org:serviceId:WANIPConn1</serviceId><controlURL>/ctl</controlURL><eventSubURL>/evt</eventSubURL><SCPDURL>/scpd.xml</SCPDURL></service></serviceList></device></deviceList></device></deviceList></device></root>`
    );
  const scpd = (v: 1 | 2) =>
    xml(
      `<?xml version="1.0"?><scpd xmlns="urn:schemas-upnp-org:service-1-0"><specVersion><major>1</major><minor>0</minor></specVersion><actionList>${(v === 2 ? ACTIONS_V2 : ACTIONS_V1).map((name) => `<action><name>${name}</name></action>`).join("")}</actionList><serviceStateTable></serviceStateTable></scpd>`
    );
  /** What a SOAP action was asked with: its service, its arguments, and the table entry it names. */
  interface Asked {
    action: string;
    arg: (name: string) => string;
    key: string;
    protocol: string;
    service: string;
  }
  /** Why a mapping asked is refused, in the router's fault; none when it is granted. */
  const refusalOf = (action: string, key: string, lease: number) => {
    if (action === "AddAnyPortMapping" && mode.version === 1) {
      return fault(401, "Invalid Action");
    }
    if (mode.refuse) {
      return fault(718, "ConflictInMappingEntry");
    }
    if (mode.permanentOnly && lease !== 0) {
      return fault(725, "OnlyPermanentLeasesSupported");
    }
    if (mode.cap !== null && !table.has(key) && table.size >= mode.cap) {
      return fault(728, "NoPortMapsAvailable");
    }
  };
  const add = ({ action, arg, key, protocol, service }: Asked): Response => {
    const lease = Number(arg("NewLeaseDuration"));
    const refusal = refusalOf(action, key, lease);
    if (refusal) {
      return refusal;
    }
    table.set(key, {
      protocol,
      port: Number(arg("NewExternalPort")),
      client: arg("NewInternalClient"),
      lease,
    });
    return answer(
      service,
      action,
      action === "AddAnyPortMapping"
        ? `<NewReservedPort>${arg("NewExternalPort")}</NewReservedPort>`
        : ""
    );
  };
  const removeRange = ({ action, arg, protocol, service }: Asked) => {
    if (mode.version === 1) {
      return fault(401, "Invalid Action");
    }
    const first = Number(arg("NewStartPort"));
    const last = Number(arg("NewEndPort"));
    const inRange = [...table].filter(
      ([, one]) =>
        one.protocol === protocol && one.port >= first && one.port <= last
    );
    for (const [held] of inRange) {
      table.delete(held);
    }
    return inRange.length === 0
      ? fault(730, "PortMappingNotFound")
      : answer(service, action);
  };
  /** Each SOAP action the control URL answers, as a router does; any other is 401 Invalid Action. */
  const ANSWERS: Record<string, (asked: Asked) => Response> = {
    GetExternalIPAddress: ({ action, service }) =>
      answer(
        service,
        action,
        `<NewExternalIPAddress>${publicAddress}</NewExternalIPAddress>`
      ),
    AddPortMapping: add,
    AddAnyPortMapping: add,
    DeletePortMapping: ({ action, key, service }) =>
      table.delete(key)
        ? answer(service, action)
        : fault(714, "NoSuchEntryInArray"),
    DeletePortMappingRange: removeRange,
    GetSpecificPortMappingEntry: ({ action, key, service }) => {
      const one = table.get(key);
      return one
        ? answer(
            service,
            action,
            `<NewInternalPort>${one.port}</NewInternalPort><NewInternalClient>${one.client}</NewInternalClient><NewEnabled>1</NewEnabled><NewPortMappingDescription>held</NewPortMappingDescription><NewLeaseDuration>${one.lease}</NewLeaseDuration>`
          )
        : fault(714, "NoSuchEntryInArray");
    },
  };
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      const url = new URL(request.url);
      const v = mode.version;
      const service = `urn:schemas-upnp-org:service:WANIPConnection:${v}`;
      if (request.method === "GET") {
        fetched.push(url.pathname);
      }
      if (mode.off) {
        return new Response("", { status: 404 });
      }
      if (url.pathname === "/rootDesc.xml") {
        return descriptor(v, service);
      }
      if (url.pathname === "/scpd.xml") {
        return scpd(v);
      }
      if (url.pathname !== "/ctl") {
        return new Response("", { status: 404 });
      }
      const action =
        SOAP_ACTION.exec(request.headers.get("soapaction") ?? "")?.[1] ?? "";
      const body = await request.text();
      const arg = (name: string) =>
        new RegExp(`<${name}>([^<]*)</${name}>`).exec(body)?.[1] ?? "";
      const range = arg("NewStartPort")
        ? `${arg("NewStartPort")}-${arg("NewEndPort")}`
        : "";
      actions.push(
        [
          action,
          arg("NewProtocol"),
          arg("NewExternalPort") || range,
          arg("NewLeaseDuration"),
        ]
          .filter((part) => part !== "")
          .join(" ")
      );
      const protocol = arg("NewProtocol").toLowerCase();
      const asked: Asked = {
        action,
        arg,
        protocol,
        key: `${protocol}:${arg("NewExternalPort")}`,
        service,
      };
      return (ANSWERS[action] ?? (() => fault(401, "Invalid Action")))(asked);
    },
  });
  return {
    server,
    mode,
    table,
    actions,
    fetched,
    descriptor: `http://127.0.0.1:${server.port}/rootDesc.xml`,
  };
};

/** NAT-PMP's server port (RFC 6886 §3), where every client sends. */
const NAT_PMP_PORT = 5351;

/**
 * A NAT-PMP gateway (RFC 6886) on 127.0.0.1:5351, the port every client
 * sends to: its external address (opcode 0), and UDP or TCP mappings
 * (opcodes 1 and 2), a lifetime of 0 deleting one. `mode.off` answers
 * nothing, `mode.refuse` every mapping Not Authorized (2), `mode.cap` every
 * one past that many Out of Resources (4). A request of another version
 * (PCP's 2) is answered Unsupported Version (1), as §3.5 has a NAT-PMP
 * server do. Each request is kept in `asked` (`map UDP 3478 3600`).
 */
export const natPmpStandIn = (
  publicAddress: string
): Promise<{
  asked: string[];
  mode: { cap: number | null; off: boolean; refuse: boolean };
  socket: Socket;
  table: Map<string, RouterMapping>;
}> =>
  new Promise((resolve, reject) => {
    const mode = {
      off: false as boolean,
      refuse: false as boolean,
      cap: null as number | null,
    };
    const table = new Map<string, RouterMapping>();
    const asked: string[] = [];
    const started = Date.now();
    const socket = createSocket("udp4");
    const epoch = () => Math.floor((Date.now() - started) / 1000);
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one stand-in gateway answering each NAT-PMP opcode as RFC 6886 §3 lays it out.
    socket.on("message", (message, remote) => {
      if (mode.off || message.length < 2) {
        return;
      }
      const version = message.readUInt8(0);
      const op = message.readUInt8(1);
      const head = (result: number, size: number) => {
        const reply = Buffer.alloc(size);
        reply.writeUInt8(0, 0);
        reply.writeUInt8(128 + op, 1);
        reply.writeUInt16BE(result, 2);
        reply.writeUInt32BE(epoch(), 4);
        return reply;
      };
      if (version !== 0) {
        asked.push(`version ${version}`);
        socket.send(head(1, 8), remote.port, remote.address);
        return;
      }
      if (op === 0) {
        asked.push("address");
        const reply = head(0, 12);
        publicAddress.split(".").forEach((octet, at) => {
          reply.writeUInt8(Number(octet), 8 + at);
        });
        socket.send(reply, remote.port, remote.address);
        return;
      }
      if ((op !== 1 && op !== 2) || message.length < 12) {
        socket.send(head(5, 8), remote.port, remote.address);
        return;
      }
      const protocol = op === 1 ? "udp" : "tcp";
      const internal = message.readUInt16BE(4);
      const suggested = message.readUInt16BE(6);
      const lifetime = message.readUInt32BE(8);
      asked.push(`map ${protocol.toUpperCase()} ${internal} ${lifetime}`);
      const key = `${protocol}:${internal}`;
      const reply = head(0, 16);
      reply.writeUInt16BE(internal, 8);
      if (lifetime === 0) {
        table.delete(key);
        socket.send(reply, remote.port, remote.address);
        return;
      }
      if (
        mode.refuse ||
        (mode.cap !== null && !table.has(key) && table.size >= mode.cap)
      ) {
        socket.send(head(mode.refuse ? 2 : 4, 16), remote.port, remote.address);
        return;
      }
      const external = suggested || internal;
      table.set(key, {
        protocol,
        port: external,
        client: remote.address,
        lease: lifetime,
      });
      reply.writeUInt16BE(external, 10);
      reply.writeUInt32BE(lifetime, 12);
      socket.send(reply, remote.port, remote.address);
    });
    socket.once("error", reject);
    socket.bind(NAT_PMP_PORT, "127.0.0.1", () =>
      resolve({ socket, mode, table, asked })
    );
  });
