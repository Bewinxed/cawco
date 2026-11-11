import type {
  EmblaCarouselSvelteType,
  default as emblaCarouselSvelte,
} from "embla-carousel-svelte";
import { getContext, hasContext, setContext } from "svelte";
import type { HTMLAttributes } from "svelte/elements";
import type { WithElementRef } from "#lib/utils.js";

export type CarouselAPI =
  NonNullable<
    NonNullable<EmblaCarouselSvelteType["$$_attributes"]>["on:emblaInit"]
  > extends (evt: CustomEvent<infer Api>) => void
    ? Api
    : never;

type EmblaCarouselConfig = NonNullable<
  Parameters<typeof emblaCarouselSvelte>[1]
>;

type CarouselOptions = EmblaCarouselConfig["options"];
type CarouselPlugins = EmblaCarouselConfig["plugins"];

////

export type CarouselProps = {
  opts?: CarouselOptions;
  plugins?: CarouselPlugins;
  setApi?: (api: CarouselAPI | undefined) => void;
  orientation?: "horizontal" | "vertical";
} & WithElementRef<HTMLAttributes<HTMLDivElement>>;

const EMBLA_CAROUSEL_CONTEXT = Symbol("EMBLA_CAROUSEL_CONTEXT");

export interface EmblaContext {
  api: CarouselAPI | undefined;
  canScrollNext: boolean;
  canScrollPrev: boolean;
  handleKeyDown: (e: KeyboardEvent) => void;
  onInit: (e: CustomEvent<CarouselAPI>) => void;
  options: CarouselOptions;
  orientation: "horizontal" | "vertical";
  plugins: CarouselPlugins;
  scrollNext: () => void;
  scrollPrev: () => void;
  scrollSnaps: number[];
  scrollTo: (index: number, jump?: boolean) => void;
  selectedIndex: number;
}

export function setEmblaContext(config: EmblaContext): EmblaContext {
  setContext(EMBLA_CAROUSEL_CONTEXT, config);
  return config;
}

export function getEmblaContext(name = "This component") {
  if (!hasContext(EMBLA_CAROUSEL_CONTEXT)) {
    throw new Error(`${name} must be used within a <Carousel.Root> component`);
  }
  return getContext<ReturnType<typeof setEmblaContext>>(EMBLA_CAROUSEL_CONTEXT);
}
