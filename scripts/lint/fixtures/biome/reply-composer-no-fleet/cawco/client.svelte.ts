export interface SendExtras {
  text: string;
}
export interface SessionState {
  id: string;
}
export interface PendingPermission {
  tool: string;
}
export const latestCommandFor = (id: string): string => id;
export const pendingRestore = (id: string): string => id;
