/**
 * What a story's `play` is handed by CawCo's canvas (component canvas,
 * moves): the live instance's `update`, the frame's `canvas` queries and
 * `userEvent`, only the parts these states files use.
 */
export interface PlayContext {
  canvas: { getByText: (text: string) => Element };
  update: (next: Record<string, unknown>) => Promise<void>;
  userEvent: { click: (target: Element) => Promise<void> };
}
