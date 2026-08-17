# Agent Note: Configured vision model routing

Status: implemented

English | [中文](2026-08-18-configured-vision-model-routing.zh.md)

## Problem

The image-understanding plugin bypassed the application's model configuration and called one Qwen-compatible endpoint directly. That made `qwen3.7-flash`, its DashScope URL, and a separate credential reference part of the plugin's own settings, so users could not reuse another configured multimodal provider or choose a different visual model.

## Decision

Image understanding now selects an active provider route and one of its models that explicitly declares `image` input. The Plugins card stores only `visionProvider` and `visionModel`; provider endpoints, API keys, and each model's input capabilities remain owned by the Models settings surface.

The host model catalog now carries `inputModalities` into its client-facing model entries. The visual selector filters that catalog to image-capable models, refreshes on settings and adapter invalidations, and clears an incompatible model draft when its provider changes. At execution, `mcp__vision__analyze_image` resolves the saved route, rejects missing or text-only selections, and streams the prompt plus durable image attachments through `ctx.llm`. It no longer fetches any provider endpoint or reads a plugin-specific secret.

## Alternatives considered

- **Keep a Qwen fallback alongside the model selector** — rejected because an implicit fallback would still couple the plugin to one provider and make the displayed selection differ from the route that receives the image.
- **Embed custom-provider creation in the vision plugin** — rejected because Models already owns provider definitions, credentials, and input capabilities. Duplicating that editor would create two configuration paths for the same route.
- **List models with unknown input capability** — rejected because a visual tool must not advertise a selection it cannot prove accepts images. Users declare image input when defining a custom model in Models.

## Consequences

- Existing Qwen-specific vision settings no longer configure a route. A deployment that used them must add the desired provider and image-capable model in Models, then select it in the vision plugin.
- Providers expose their own model identifiers and credentials once, and both normal conversation and image understanding use the same adapter, retry policy, and transport behavior.
- A provider that omits image capability metadata is intentionally unavailable to image understanding until that capability is declared.

## Testing

The image-generation MCP tests cover routing the latest durable user image through the configured visual provider, and reject a missing visual route. The plugin controller tests cover filtering text-only models, paired selection persistence, and directory lookup failures. The host model catalog tests cover the wire contract used by the selector.
