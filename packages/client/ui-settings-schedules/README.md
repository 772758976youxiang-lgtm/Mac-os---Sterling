# @deepseek-ai/dsh-client-ui-settings-schedules

English | [中文](README.zh.md)

Scheduled-task settings plugin. It registers the `schedules` section at order 12, between Models and Plugins, and manages active reminders through the typed Host Schedule API.

## Behavior

The page lists reminders across live root Sessions that currently own a Schedule runtime. Each row shows its owning Session, one-shot or fixed-rate cadence, next target, and `scheduled` or `overdue` state. Users can create a one-shot task at a browser-local date and time, create a fixed-rate task with a minimum five-minute interval, edit either form, delete after confirmation, or refresh the directory.

Create and delete preserve the Schedule package's persistence barriers. Edit is a transactional replacement in the same Session: the old record receives a delete event, a new record with a never-reused id receives a create event, and the operation confirms only after the combined append reaches the persistence barrier. The form keeps the owner fixed while editing and sends absolute targets as UTC RFC 3339 instants.

The page store refreshes after every accepted mutation and after connection reset. Fixture mode carries two in-memory reminders and implements the same CRUD contract for standalone browser verification.

## Model Experience

### Scheduled-task settings surface

#### What the model sees

This client package adds no model tool or prompt content. When a managed reminder becomes due, `@deepseek-ai/dsh-schedule` delivers it through its ordinary Session follow-up behavior.

#### Token effect

None from this package. Due reminders retain the token behavior documented by the Schedule package.

#### KV Cache effect

None from this package.

## Known Limitations and Deferred Work

- The directory includes only live root Sessions with an attached Schedule runtime. Reading settings never resumes cold Sessions or activates their overdue reminders.
- Cross-tab changes have no Schedule event frame; the page converges after manual refresh, connection reset, or its own mutation.
- Recurrence is a fixed interval of at least five minutes. Calendar and Cron rules are outside the Schedule protocol.
