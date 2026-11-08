// Planted: each hand-written shell quote no-hand-shell-quote refuses, then the ones it leaves alone.
declare const value: string;

export const doubled = `'${value.replaceAll("'", "'\\''")}'`;
export const backticked = `'${value.replaceAll("'", `'\\''`)}'`;

export const other = value.replaceAll("'", '"');
export const html = value.replaceAll("'", "&#39;");
