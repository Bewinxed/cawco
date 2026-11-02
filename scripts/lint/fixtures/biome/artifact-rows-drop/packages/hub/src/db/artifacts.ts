// The one delete: dropArtifactRows itself.
declare const artifacts: unknown;
declare const where: unknown;
declare const tx: {
  delete: (table: unknown) => { where: (w: unknown) => { run: () => void } };
};
tx.delete(artifacts).where(where).run();

export {};
