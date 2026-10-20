declare module "cawco:pi-config" {
  export function setEmbeddedQuickJSWasmPath(path: string): void;
  export function getCodemodeWorkerSpecifier(): string | URL | undefined;
}
declare module "cawco:quickjs" {
  const path: string;
  export default path;
}
