# Multi-provider balance design

## Goal

Replace the native composer statistics row with the plugin while preserving ChatGPT/Codex and OpenCode Go subscription quota windows. Balance-backed providers must report the balance for the currently selected provider route instead of a global hard-coded provider.

## Provider resolution

The active model selection remains the authority for the provider route. Subscription routes keep the existing mutually exclusive subscription path. Balance routes resolve metadata from the registered `llm-pi-ai` or `llm-deepseek` settings namespace without reading secret values from the settings document.

The plugin ships two balance adapters:

- DeepSeek endpoints use `/user/balance` and the route's configured credential reference, defaulting to `DEEPSEEK_API_KEY`.
- Rayplus endpoints use the origin-relative `/v1/usage` endpoint and the route's configured credential reference.

Additional gateways may be declared through `DSH_BOTTOM_INFO_BAR_BALANCE_ADAPTERS`. The variable contains a JSON object keyed by provider route. Each entry names `endpoint`, `credential`, and one parser kind: `deepseek`, `rayplus`, or `paths`. A `paths` parser names dot-separated `balancePath` and optional `currencyPath`/`currency` fields. Invalid declarations fail closed for that route and never expose a credential.

## Snapshot behavior

Snapshots are keyed by provider route. A model switch refreshes and reads the selected route. Failed refreshes retain the last successful snapshot for that route. An unsupported route returns a clear unsupported status; it never falls back to another provider's balance or invents an initial top-up.

## Client behavior

The replacement row continues to show the original statistics. Subscription providers render the existing ChatGPT/Codex or OpenCode Go quota windows. Balance providers render the selected route's balance, provider/model identity, pricing when known, and accumulated cost when priced. Unknown pricing hides price-derived fields.

## Verification

Tests cover adapter discovery, endpoint normalization, response parsing, route-specific credentials, unsupported routes, stale snapshot retention, and subscription regression behavior. The plugin full suite, build, installed profile dump, and live RPC response are required before completion.
