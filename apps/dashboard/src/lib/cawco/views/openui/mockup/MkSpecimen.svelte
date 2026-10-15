<svelte:options css="injected" />

<script lang="ts">
  /**
   * One of the project's component specimens: its template (checked by the
   * hub, hub mockups.ts) drawn with this call's props. The template is
   * parsed inert (`<template>`), each `{{prop}}` filled as text, never as
   * markup, each `asset:<name>` the asset's file, and anything the hub's
   * check would refuse left out again here; its `<slot>` holds the call's
   * children. It sits in the mockup's shadow root, where the project's CSS
   * styles it.
   */
  import {
    ASSET_REF,
    SPECIMEN_ELEMENTS,
    SPECIMEN_PLACEHOLDER,
    specimenAttributeProblem,
  } from "@cawco/core/mockups";
  import { getAllContexts, mount, unmount } from "svelte";
  import type { OpenUIRenderProps } from "../OpenUiRenderer.svelte";
  import { mockupContext } from "./context";
  import SlotChildren from "./SlotChildren.svelte";

  let {
    props,
    renderNode,
    typeName = "",
  }: OpenUIRenderProps<Record<string, unknown>> = $props();
  const mockup = mockupContext();
  const contexts = getAllContexts();
  let host = $state<HTMLElement>();

  const valueText = (value: unknown): string =>
    value === undefined || value === null || typeof value === "object"
      ? ""
      : String(value);

  /** The template's DOM with this call's values in it, and where its children go. */
  function drawn(template: string, values: Record<string, unknown>) {
    const fill = (text: string): string =>
      text.replace(SPECIMEN_PLACEHOLDER, (_whole, name: string) =>
        valueText(values[name])
      );
    const holder = document.createElement("template");
    holder.innerHTML = template;
    const fragment = holder.content;
    for (const element of [...fragment.querySelectorAll("*")]) {
      if (!SPECIMEN_ELEMENTS.has(element.localName.toLowerCase())) {
        element.remove();
        continue;
      }
      for (const attribute of [...element.attributes]) {
        const value = fill(attribute.value);
        const asset = ASSET_REF.exec(value)?.[1];
        if (specimenAttributeProblem(attribute.name, value)) {
          element.removeAttribute(attribute.name);
        } else {
          element.setAttribute(
            attribute.name,
            asset ? (mockup.asset(asset)?.url ?? "") : value
          );
        }
      }
    }
    const texts = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
    for (let node = texts.nextNode(); node; node = texts.nextNode()) {
      node.nodeValue = fill(node.nodeValue ?? "");
    }
    const slot = fragment.querySelector("slot");
    let place: HTMLElement | null = null;
    if (slot) {
      place = document.createElement("div");
      place.style.display = "contents";
      place.dataset.mkSlot = "";
      slot.replaceWith(place);
    }
    return { fragment, place };
  }

  $effect(() => {
    if (!host) {
      return;
    }
    const target = host;
    const { fragment, place } = drawn(mockup.template(typeName) ?? "", props);
    target.replaceChildren(fragment);
    const children =
      place && props.children !== undefined
        ? mount(SlotChildren, {
            target: place,
            props: { renderNode, value: props.children },
            context: contexts,
          })
        : null;
    return () => {
      if (children) {
        unmount(children);
      }
      target.replaceChildren();
    };
  });
</script>

<div
  bind:this={host}
  class="specimen"
  data-mk={typeName}
  data-mk-specimen=""
></div>

<style>
  .specimen {
    display: contents;
  }
</style>
