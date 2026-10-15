/**
 * What a mockup's components read beside their props: the project's
 * specimen templates and its assets, from its library (hub mockups.ts). The
 * frame (MockupFrame) sets it; a mockup reads nothing else.
 */
import { getContext, setContext } from "svelte";

export interface MockupContext {
  /** One of the project's images, by its asset name: where it loads from and what it shows. */
  asset: (name: string) => { alt: string; url: string } | undefined;
  /** A specimen's checked template, by its component name. */
  template: (name: string) => string | undefined;
}

const KEY = Symbol("cawco-mockup");

export const setMockupContext = (context: MockupContext): MockupContext =>
  setContext(KEY, context);

export const mockupContext = (): MockupContext =>
  getContext<MockupContext>(KEY);

/** A string prop's text; nothing for what is not a string or a number. */
export const textOf = (value: unknown): string =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";
