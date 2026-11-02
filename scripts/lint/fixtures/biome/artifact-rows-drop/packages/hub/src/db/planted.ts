// Planted: an artifact row deleted outside dropArtifactRows.
declare const artifacts: unknown;
declare const where: unknown;
declare const tx: {
  delete: (table: unknown) => { where: (w: unknown) => { run: () => void } };
};
tx.delete(artifacts).where(where).run();

export {};
