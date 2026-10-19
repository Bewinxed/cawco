import type { IncomingMessage, Server } from "node:http";
export function applyRelayPeer(request: IncomingMessage): {
  address: string;
  port: number;
};
export function listenInherited(
  server: Server,
  fds: number[],
  ready: () => void
): Promise<{ stopAccepting: () => void; destroy: () => void }>;
