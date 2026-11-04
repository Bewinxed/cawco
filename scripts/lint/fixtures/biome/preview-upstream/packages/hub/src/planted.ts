// Planted: an upstream kept outside the preview service, and an artifact's
// source read off its columns.
declare const address: string;
declare const token: string;
declare const port: number;
declare const artifacts: { sourceWorkspace: unknown; sourceSeen: unknown };
export const kept = { address, port, token };
export const told = { for: "key", address: "127.0.0.1", port: 1, token };
export const column = artifacts.sourceWorkspace;

// Left alone: an address beside no token, a token beside no address, the
// artifacts service's own method.
export const machine = { address, port };
export const pass = { host: address, port, token };
export const seen = artifacts.sourceSeen;
