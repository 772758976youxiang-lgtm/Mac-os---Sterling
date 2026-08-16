# Agent Note: SMTP daily digest for scheduled results

Status: implemented

English | [中文](2026-08-16-email-digest-smtp.zh.md)

## Problem

Session-local Schedule can wake a live conversation and obtain an assistant result, but it cannot notify a user who is not watching the conversation. A mail feature must retain the same durable authority as Schedule, avoid placing SMTP passwords in configuration or Session logs, and avoid claiming delivery before an SMTP server has accepted a message.

## Decision

`@deepseek-ai/dsh-email-digest` is an optional Cordis function plugin. It observes only root Agents created after the plugin loads. When a Schedule-framed user message is followed by an assistant message, the plugin appends a versioned `email-digest/change` `collect` event to that Agent's Session. The event records the response, source prompt, optional Schedule id, collection timestamp, and Session identity.

At the configured daily IANA-zone wall-clock time, each live root independently folds its Session suffix and sends its pending collected items through SMTP. The SMTP password is a `passwordRef`, resolved from `ctx.credentials` for every send; neither the configuration nor the durable log receives the secret. QQ and 163 are supported through ordinary SMTP with the provider-issued client authorization code.

SMTP acceptance is followed by a durable `deliver` event naming the sent item ids and then a normal Session flush. This provides at-least-once delivery: a crash after SMTP acceptance but before the marker may send the same digest again. A send failure leaves items pending and retries after the configured delay. Cold Sessions are never scanned or woken, so they only participate once resumed under a root Agent.

## Alternatives considered

**Use a mailbox API or browser login.** Provider-specific OAuth refresh and browser sessions introduce expiry, consent, and provider behavior into the core feature. SMTP with an app authorization code works across common providers and keeps the transport boundary narrow.

**Store delivery state in a private database.** A second store would need identity reconciliation and crash recovery against the Session log. Append-only Session events already provide the needed durable collection and delivery ledger.

**Mark items delivered before SMTP.** This can silently lose a digest whenever network delivery fails. Recording only after acceptance accepts bounded duplication instead of loss.

**Run a process-wide cold-session scan.** That needs persistent ownership, startup enumeration, global batching, and a policy for waking inactive tasks. The feature intentionally preserves Schedule's live Session-local delivery boundary.

## Consequences

- SMTP credentials can be rotated by updating the configured credential source; the next attempt rereads them.
- Every live root Session produces its own digest, even when all share the same recipient list; cross-Session aggregation is deliberately deferred.
- The durable event protocol is strict and generated into the repository persistence catalog.
- Operators must configure an SMTP authorization code and tolerate an occasional duplicate after a process failure at the SMTP/log boundary.
- The Web bundle exposes an expandable Plugins settings card for this plugin. It uses a flat editable projection for SMTP, recipients, schedule time, time zone, sender, subject, retry delay, and an enable switch; the authorization code remains a write-only credential control. The bundled Web row starts disabled with inert placeholder values, so an operator can complete setup before enabling delivery.
