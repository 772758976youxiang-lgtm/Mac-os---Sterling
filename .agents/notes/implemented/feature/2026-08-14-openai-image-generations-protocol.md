# Agent Note: OpenAI-compatible image-generation routes

Status: implemented

English | [中文](2026-08-14-openai-image-generations-protocol.zh.md)

## Problem

The configurable-provider UI exposed only chat-oriented protocols. A route serving OpenAI-compatible `POST /images/generations`, such as a `gpt-image-2` gateway, could be stored only by lying about its protocol and then failed on a chat endpoint. The Harness already has durable image attachments and assistant image rendering, but no adapter path produced those blocks from an image-generation response.

## Decision

`llm-pi-ai` now exposes `openai-image-generations` beside its chat protocols. The route resolves models through the existing profile catalog, declares `text` and `image` input by default, and adapter dispatch intercepts this protocol before pi-ai's chat stream. It selects the latest submitted message (`source.kind === 'user'`) rather than role-only runtime context, so a following context injection cannot replace the prompt or discard its reference images. A text-only submitted message goes to `<baseURL>/images/generations` as JSON with `model`, `prompt`, `size`, `quality`, `n`, and `response_format`. When that message contains durable image attachments, the adapter reads their verified bytes and sends them as multipart `image[]` fields to `<baseURL>/images/edits` with the same controls and credentials.

`imageGeneration` config controls `size`, `quality`, `n`, and `responseFormat`; its defaults are `1024x1024`, `high`, `1`, and `b64_json`, matching the supplied invocation. Base64 replies are decoded as PNG, while URL replies are fetched under the attachment service's encoded-byte limit and require a supported image media type. The attachment service accepts AVIF and HEIC/HEIF uploads as well as its original formats, normalizing those two browser formats to JPEG before they reach an Image API edit request. After local input-image reads complete, the adapter emits the first image block start before waiting for the remote image response; client partial state represents it as `image-pending`, which renders an animated generation placeholder and is replaced by the durable `image` block on success. That temporary state is neither a context message nor interruption evidence, so a failed request leaves no empty image card in the transcript. Every result validates and persists through `ctx.attachments` before the adapter emits ordered assistant `image` blocks and a successful finish.

## Alternatives considered

**Expose the protocol as a chat-completions alias.** Rejected because image endpoints accept `prompt`, not message history or tool schemas, and their response carries image data rather than streamed text.

**Add only a dropdown item.** Rejected because an unimplemented protocol would let users save a provider that fails every request. The option is backed by the actual endpoint request, result decoding, attachment persistence, and assistant content stream.

**Use provider URLs directly in conversation content.** Rejected because presigned URLs expire and bypass the attachment store's decoding, media-type, byte-limit, and durable-reference guarantees.

## Consequences

An image-generation provider can be declared from the existing Models settings flow and selected like another model. An attached image no longer makes the host substitute its configured vision fallback; it remains on the chosen image route and performs an Image API edit. The call ignores conversation history, system text, and tools because the supported endpoint accepts one prompt; it requires non-empty user text and a mounted durable attachment service. Masks, provider-specific output formats, and token usage reporting remain outside this protocol.
