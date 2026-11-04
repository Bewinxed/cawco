// Planted: an artifact's machine or source written through update.
declare const db: {
  artifacts: { update: (id: string, patch: object) => void };
};
declare const source: unknown;
db.artifacts.update("id", { source, revision: 2 });
db.artifacts.update("id", { machineId: "m", updatedAt: 1 });

// Left alone: a patch of anything else, and another table's machine.
declare const tunnels: { update: (id: string, patch: object) => void };
db.artifacts.update("id", { revision: 2, updatedAt: 1 });
tunnels.update("id", { machineId: "m" });

export {};
