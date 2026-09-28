/** What @pierre/diffs is told a file is written in, by its extension. */
const LANGUAGES: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  svelte: "svelte",
  vue: "vue",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  cpp: "cpp",
  h: "c",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  html: "html",
  css: "css",
  scss: "scss",
  less: "less",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  xml: "xml",
  md: "markdown",
  sql: "sql",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  dockerfile: "dockerfile",
  toml: "toml",
};

/** The file's language for highlighting, or undefined to let the library guess. */
export function languageOf(path: string): string | undefined {
  const ext = path.split(".").pop()?.toLowerCase();
  return ext ? LANGUAGES[ext] : undefined;
}

export const fileName = (path: string): string => path.split("/").pop() || path;
