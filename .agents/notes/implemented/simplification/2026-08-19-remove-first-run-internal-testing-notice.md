# Agent Note: Remove the first-run internal-testing notice

Status: implemented

English | [中文](2026-08-19-remove-first-run-internal-testing-notice.zh.md)

## Problem

The welcome step was a versioned, blocking internal-testing notice: the browser half of `ui-settings-models` rendered it first in the `settings.onboarding` ledger until the user acknowledged the current copy version. Acknowledgement was durable through a dedicated settings namespace (`ui-onboarding.welcomeNoticeVersion`), which pulled in a whole supporting surface — a Host-side settings registration in `ui-settings-general`, an `apiproxy` settings allowlist entry, a remote-browser process-local fallback, fixture and scaffold acknowledgement wiring, and dedicated e2e lanes and goldens. The notice announced an internal-testing posture the GUI had moved past, and all of that machinery existed solely to gate one modal.

## Decision

The internal-testing notice was removed end to end. `WELCOME_NOTICE_COPY`, the `WELCOME_NOTICE_VERSION` gate, and the constants in `onboarding-copy.ts` are gone along with the `WelcomeNotice` component, its store, its styles, its locale keys, and its `settings.onboarding` registration — first run now lands directly on the remaining conditional DeepSeek credential step. The now-ownerless `ui-onboarding` settings namespace went with it: the `ui-settings-general` Host half is back to the standard empty node-half `apply`, `ui-onboarding` left the `apiproxy` product settings allowlist, and the connection fixture's welcome acknowledgement special-case in `settings.mutate` was simplified to the same read-only refusal as `update`/`replace`. The web e2e lane lost the welcome steps and its `welcome.expected.md` golden, `remote-welcome.e2e.ts` was deleted, the scaffold's mirrored constants and pre-acknowledgement step are gone, and the generated slot catalog no longer lists the `welcome-notice` occupant. A stale `welcomeNoticeVersion` a user's `settings.yaml` already carries is simply ignored: the namespace is no longer registered, so no schema refuses it and the value stays harmlessly in the file.

## Alternatives considered

**Keep the notice but reword the copy.** Rejected: rewording just bumps `WELCOME_NOTICE_VERSION` and every user sees the modal once more, while the versioned-acknowledgement machinery — the namespace, the allowlist entry, the remote fallback — keeps its full maintenance cost for the same one modal.

**Keep the acknowledgement namespace for a future notice.** Rejected: the repo convention requires a current owner and need; the namespace, allowlist entry, fixture handling, and docs were all dead weight with no registered consumer. Reintroducing a notice restores the namespace together with its consumers.

## Consequences

First run proceeds straight to the DeepSeek credential step (or to the ordinary UI when a provider is already reachable), with no modal blocking startup and no acknowledgement write. The `ui-onboarding` namespace left the settings allowlist, so nothing exposes it to the browser; leftover values in existing settings documents are inert. Absence is verified: no source, test, doc, or snapshot references the welcome notice, `ui-onboarding`, or the acknowledgement field; the `ui-settings-models`, `ui-settings-general`, connection-fixture, and apiproxy suites pass, and the repo typecheck is green.
