# Agent Note: Remove the MiniMax H3 protocol label

Status: implemented

English | [中文](2026-08-18-remove-minimax-h3-protocol.zh.md)

## Problem

The MiniMax H3 protocol label was added to `llm-pi-ai` so a MiniMax H3 deployment could be distinguished from a generic gateway in a saved profile and in the Models settings selector, without reusing the bare `openai-completions` name. It was a configuration-level dialect label only: a profile naming `minimax-h3` was served by the exact same pi-ai OpenAI Chat Completions implementation as `openai-completions`, with the same Bearer authentication, `<baseURL>/chat/completions` requests, model listing, and streaming. No deployment adopted the label, and nothing distinguishes the two on the wire, so the name only widened the configuration surface, the discovery list, and the docs without adding a capability.

## Decision

`minimax-h3` was removed from the shipped protocol surface. The `MINIMAX_H3_API` constant and its `PROTOCOLS` entry in `llm-pi-ai`'s provider construction are gone, so `supportedProtocols()` no longer offers the label, the `Config` schema's `api` union — the Models settings protocol selector's source — no longer renders it, and the package root no longer exports the constant. The listable-protocol set in `discovery.ts` dropped the label, the README's MiniMax H3 section and example profile were deleted, and the adapter, discovery, and UI-schema tests that pinned the label were removed; the `declared-edit` snapshot no longer lists the option. The custom vision provider mirrors the model protocol set, so the `VISION_API_PROTOCOLS` lists in `mcp-image-generation` and the plugin-settings card dropped the label too — along with the vision README enumeration and the endpoint and option-list tests — and a saved `visionApi` of `minimax-h3` is refused by the vision `Config` union just like any other unknown protocol. A stored profile that names `minimax-h3` is refused loudly by the `api` schema as an unsupported protocol — the same refusal any unknown protocol gets — so no compatibility alias, migration, or stored-document handling is needed.

## Alternatives considered

**Keep the label as a documented alias for `openai-completions`.** Rejected: nothing differs on the wire, so the extra name only widens the surface; the original motivation, visible deployment identity in a saved profile, is served by the `displayName` field every profile already carries.

**Keep the label but hide it from new-route creation.** Rejected: a config-only label that the schema still accepts would remain in the schema, the discovery list, and the docs while being unreachable from the UI — the worst of both.

## Consequences

MiniMax H3 deployments now declare `openai-completions` and reach the identical requests, model listing, streaming, and Bearer authentication with one fewer name in the protocol table, the discovery list, the selector, and the docs. The capability given up is only the configuration-level label, not any wire behavior. Reintroduction is a one-line `PROTOCOLS` entry plus a discovery-list entry and a README section once an observed MiniMax dialect actually needs a distinct name; until then the original rationale stays covered by `displayName`. Absence is verified: no source, test, doc, or snapshot references `minimax-h3` or `MINIMAX_H3`; the `llm-pi-ai`, `mcp-image-generation`, `ui-settings-plugins`, and client suites pass (the pre-existing `convert.spec` and `apiproxy` failures are unchanged), and the keyless web snapshot replay renders both the model and vision protocol selectors without the option.
