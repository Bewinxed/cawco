// Planted: the artifacts service's own table written past resource.
declare const db: { update: (id: string, patch: object) => void };
declare const source: unknown;
db.update("id", { source });

export {};
