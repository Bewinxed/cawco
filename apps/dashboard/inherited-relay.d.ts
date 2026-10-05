import type { IncomingMessage, Server } from "node:http";
export function applyRelayPeer(request: IncomingMessage): {
  address: string;
  port: number;
};
export function listenInherited(
  server: Server,
  fd: number,
  ready: () => void
): Promise<{ stopAccepting: () => void; destroy: () => void }>;
