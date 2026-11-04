// Left alone: the one write of an artifact's source.
declare const db: { update: (id: string, patch: object) => void };
declare const source: unknown;
db.update("id", { source, machineId: "m" });

export {};
