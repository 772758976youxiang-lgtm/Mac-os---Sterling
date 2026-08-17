# @deepseek-ai/dsh-client-ui-infinite-canvas

English | [中文](README.zh.md)

The browser plugin adds a mode menu beside the sidebar brand row and an Infinite creation mode backed by `@xyflow/react`. Harness mode remains the existing conversation/workspace frame. Infinite creation mode is a local canvas with pan, zoom, movable and vertically resizable text nodes, connections, deletion, controls, and a minimap. Each node has a dedicated drag strip, and newly created nodes use the nearest free position instead of overlapping an existing node.

The plugin bundles React Flow's global stylesheet with its selectors unchanged and uses tokenized CSS Modules for product styling. This keeps React Flow's viewport, controls, minimap, handles, and edges in their library-defined layout while preserving plugin style ownership and hot-reload cleanup.

Canvas documents are stored in browser `localStorage` under the current session, workspace, or global fallback key. Storage failures do not block in-memory editing. The plugin does not call the Host API, change the session log, send canvas data to a model, or execute AI nodes.

The plugin registers into the `sidebar.brand.action` and `shell.overlay` slots and shares one root-scoped store handle between them. The overlay keeps the Harness tree mounted beneath the canvas and provides its own mode menu so the user can return to Harness mode. Each menu uses the shared body portal and opens toward the viewport interior, so sidebar clipping cannot crop it.

## Model Experience

None, as the canvas is browser-local viewing state and registers no model-facing surface.

#### KV Cache effect

None; this plugin does not assemble or send provider requests.

## Known Limitations and Deferred Work

- **Local-only persistence** — canvas documents are not synchronized across browsers or workspaces on the Host.
- **Text nodes only** — file, image, task, and AI execution nodes are deferred.
- **No import/export** — the first version has no document transfer format.
