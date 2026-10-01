---
name: generating-images
description: Generates raster images and reference-guided variations through CawCo using the owner's ChatGPT subscription. Use when asked to generate an image, draw an illustration, create a photo, make an image asset, or revise a generated image using a reference.
---

# Generating images

Use CawCo's `generate_image` tool directly. Claude Code exposes it as
`mcp__cawco__generate_image`; OpenCode exposes it as `cawco_generate_image`.
The calling model does not need native image-generation support.

## Write the brief

Name the intended use and subject, then specify composition, framing, placement,
visual medium, materials, lighting, colors, and exclusions. Use concrete visible
details rather than mood words alone. For people, specify framing, pose, gaze,
and interaction when they matter. For complex requests, use short labeled
sections: **Scene / Subject / Details / Constraints**. No special syntax is
required.

Quote exact wording and say where it belongs, its typography, and how many times
it should appear. Request no extra text when appropriate. Verify spelling,
legibility, and diagram labels in the result rather than assuming correctness.

For edits, separate **Change only** from **Preserve**. Name the identity, geometry,
layout, lighting, labels, and surrounding elements that must stay. Assign every
reference a numbered role: “Image 1: subject identity; Image 2: clothing;
Image 3: background.” Explain how they should combine.

For a follow-up, attach the previous output, request one change, and repeat the
critical preservation constraints. Check the result before adding another
change. A requirement for pixel-identical regions needs compositing, not a
promise that prompting will preserve every pixel.

## Generate and deliver

1. Write one prompt describing the subject, composition, style, lighting, and
   required text. For an edit, explain what to preserve and what to change.
2. Choose a `.png` output path on the calling session's machine. Relative paths
   resolve from its working directory. Use a new path for each revision.
3. Pass local `reference_images` when an existing image should guide the result.
   Identify each reference's role in the prompt.
4. Call the tool once per requested image. Size and quality are requests to the
   backend; use the returned dimensions as the actual result.
5. Show the returned `path` with CawCo's `show_image` tool. Use `send_to_user`
   with an attachment when the user needs delivery to Telegram.

The tool uses the owner's configured ChatGPT OAuth account. Never supply an API
key, select a different provider, or delegate generation to another model.
Authentication and subscription-limit errors must be reported as returned;
do not switch to paid API credits or repeatedly retry an uncertain generation.

For SVGs, icons, or code-native graphics, edit their source directly instead.
Reference-guided edits are generative, not guaranteed pixel-exact inpainting.

## Parameters and model claims

Set `size` and `quality` in their tool parameters, separately from the creative
brief. Use `auto` unless the task supplies requirements; consider `high` for
dense text, diagrams, or fine detail. Higher quality is not always better.

This tool uses the ChatGPT subscription backend with an outer `gpt-5.5` request
and a hosted `image_generation` tool. It does not pin or report the underlying
image model. Do not claim GPT Image 2.5 Flare or Sunburst was used. The public API
guide's model selectors, `xhigh`/`max`, `background="transparent"`, and masks are
not exposed by this tool. Do not invent those arguments or promise transparent
alpha from prompt text alone.

Size and quality are requested settings, not confirmed output settings. The
subscription backend can normalize them; use the returned dimensions and inspect
the image rather than claiming the requested settings were enforced.

Source: [OpenAI image-prompting guide](https://developers.openai.com/api/docs/guides/image-prompting).
The prompting fundamentals apply here; public API parameter support does not
establish support on the subscription endpoint.
