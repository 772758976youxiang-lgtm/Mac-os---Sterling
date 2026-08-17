# Collapsed mode menu portal design

## Goal

The mode menu remains fully visible when opened from the 56px collapsed sidebar rail.

## Scope

- Keep the mode trigger in the sidebar brand-action slot.
- Preserve the Harness and infinite-creation choices, selected-mode marker, Escape handling, outside-click dismissal, and expanded-sidebar placement.
- Keep the sidebar column's overflow clipping because it owns the collapse animation.
- Reuse the shared UI-primitives menu instead of adding another positioning implementation.

## Components and flow

`ModeMenu` will render the shared `Menu` with portal mode enabled. The trigger remains in the sidebar DOM position, while the open list renders under `document.body` and uses the trigger rectangle for fixed positioning. The shared menu clamps its card to the viewport and repositions it on scroll or resize.

The collapsed trigger uses start alignment so the menu opens toward the conversation area. The expanded trigger continues to honor its requested alignment. Selecting an entry updates the canvas store and closes the menu.

## Failure behavior

The shared menu keeps the list hidden until it can measure the trigger and menu dimensions. Closing the owner removes the portal and its document listeners. The sidebar keeps clipping ordinary content during collapse and expansion.

## Verification

- A component test confirms that opening the collapsed menu renders the list under `document.body`, outside the sidebar wrapper.
- Existing selection, Escape, alignment, and active-mode tests remain green.
- The sidebar and infinite-canvas package tests pass.
- A production build succeeds.
- Browser verification confirms that the open menu extends beyond the 56px rail without clipping and that both choices are visible and selectable.
