// Left alone: the artifacts table's own module reads its columns.
declare const artifacts: { sourceDir: unknown };
export const dir = artifacts.sourceDir;
