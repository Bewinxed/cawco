/**
 * What a states file's `play` is handed on the component canvas: `update`
 * moves the live instance's props in place, `canvas` finds elements by
 * words and roles, `userEvent` presses and types as a person does.
 */
export type Play = (context: {
  update: (next: Record<string, unknown>) => Promise<void>;
  canvas: {
    getByText: (text: string | RegExp) => HTMLElement;
    getByRole: (
      role: string,
      options?: { name?: string | RegExp }
    ) => HTMLElement;
  };
  userEvent: {
    click: (element: Element) => Promise<void>;
    type: (element: Element, text: string) => Promise<void>;
  };
}) => Promise<void>;
