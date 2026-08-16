# Agent Note: Scheduled-task settings management

Status: implemented

English | [中文](2026-08-16-scheduled-task-settings-management.zh.md)

## Problem

Schedule reminders were durable and model-manageable, but users had no settings view of what a live Session would run. Creating or correcting a reminder required another model turn, and deleting one required knowing its Session-local id. A global settings document could make the rows easy to enumerate, but it would create a second authority beside the Session event log and could diverge from dispatch state.

## Decision

The settings shell registers a standalone `ui-settings-schedules` client plugin at order 12, between Models and Plugins. Its page lists active reminders with owner Session, cadence, next target, and delivery state, and provides localized create, edit, delete-confirmation, loading, empty, failure, and busy states. One-shot form input uses the browser's local `datetime-local` value and sends a UTC RFC 3339 instant; recurrence remains the Schedule protocol's fixed interval of at least five minutes.

`ScheduleService` owns management for both the existing model tools and the new Host API. It tracks the live root Agents whose Schedule runtime is attached, serializes all calls with due delivery in the existing Agent-scoped transaction queue, folds the Session log after a persistence preflight, and requests timer recomputation after confirmed reads or mutations. The `schedule.list/create/update/delete` RPC domain contains failures as business values and adds the owner Session id to each active view.

Edit is a replacement, not a new durable event shape. Within one managed transaction the service verifies that the old id is active, allocates a never-reused id, appends delete followed by create, and applies one post-mutation persistence barrier to the combined append. The page keeps the owner Session fixed during edit. Successful mutations refresh the complete directory; connection reset and a manual refresh cover external changes.

The directory deliberately covers attached live root owners only. Listing does not resume cold Sessions, because resuming merely to inspect settings could immediately admit overdue work and start a model turn. Durable reminders in a cold Session become visible when that Session is live again.

## Alternatives considered

**Store task rows in settings.** This makes global enumeration simple but duplicates Schedule state, requires reconciliation with `schedule/change`, and can report tasks that dispatch or replay has already terminated.

**Resume every Session while listing.** This exposes cold reminders but changes behavior during a read: overdue work may run, model resources may be acquired, and many dormant Sessions may become live.

**Add a durable update event.** A fourth mutation shape would require versioned decoder, replay, persistence, and invariant changes. Delete plus create already expresses replacement while preserving id non-reuse and the existing event grammar.

**Call model tools from the browser.** Tool execution is scoped to a model turn and uses model-facing snake_case inputs and presentation. A typed Host RPC keeps human UI management independent of tool-call history while sharing the same service implementation.

## Verification

Schedule tests pin replacement ordering, id allocation, persistence checkpoints, and the resulting active fold. Host API type checks cover the request and response schemas and fixture dispatch. Client tests cover list projection, domain and transport failures, write-after-refresh behavior, settings registration and localization, recurrence validation, and create, edit, and confirmed delete interactions. Browser verification exercises the assembled fixture page at desktop and mobile widths.

## Consequences

- Users can inspect and manage scheduled work without spending a model turn or handling Schedule ids.
- Session logs remain the only durable authority; the settings page stores no task copy.
- Editing gives a task a new id and retains persistence uncertainty semantics for the combined replacement.
- Cold Session reminders are absent from the directory until their Session becomes live; the settings read remains side-effect free with respect to Agent activation.
- Changes made in another tab require manual refresh or connection reset because Schedule does not publish a client invalidation frame.
