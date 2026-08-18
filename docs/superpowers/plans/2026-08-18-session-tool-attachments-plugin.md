# Session Tool Attachments Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a plugin-composed, session-authorized attachment catalog that lets every enabled tool lazily read images and arbitrary bounded files from the complete current session, including real email attachments and Web UI upload/history support.

**Architecture:** Extend the existing attachment Service Definition and local Service Provider for generic files, add an attachment-neutral execution-context provider registry to `dsh-tools`, and implement `dsh-tool-attachment-access` as the Consumer that contributes `exec.attachments`. Existing host, client, vision, email, and LLM adapter plugins consume those interfaces; the agent loop remains unchanged.

**Tech Stack:** TypeScript 6, Cordis services/plugins, Schemastery, Vitest, React, Typert RPC, Nodemailer, content-addressed filesystem storage, pnpm workspaces.

---

## File map

New files:

- `packages/attachment/tool-attachment-access/package.json` — Consumer package manifest.
- `packages/attachment/tool-attachment-access/tsconfig.json` — host TypeScript face.
- `packages/attachment/tool-attachment-access/src/index.ts` — catalog derivation and `exec.attachments` provider registration.
- `packages/attachment/tool-attachment-access/src/invariant.ts` — package-owned relationship invariant.
- `packages/attachment/tool-attachment-access/tests/access.spec.ts` — chronology, lazy read, authorization, and cancellation tests.
- `packages/attachment/tool-attachment-access/README.md`, `README.zh.md`, `README.i18n.yaml` — package contract and translated counterpart.
- `packages/attachment/attachment-local/tests/file.spec.ts` — generic file provider tests.
- `packages/core/tools/tests/run-context.spec.ts` — generic execution-context extension tests.
- `packages/client/ui-attachment/src/FileChip.tsx` and `FileChip.module.css` — draft/history file presentation.
- `packages/client/ui-attachment/tests/file-chip.client.spec.tsx` — file chip interaction tests.
- `.agents/notes/implemented/feature/2026-08-18-session-tool-attachments.md`, `.zh.md`, `.i18n.yaml` — shipped decision and alternatives.
- `examples/acp-agent/tests/fixtures/session-attachment-tool.ts` — assembled fixture tool that lists and reads one attachment.
- `examples/acp-agent/session-attachment.cordis.yml`, `session-attachment.cordis.snapshot.yml` — runnable profile overlays.
- `examples/acp-agent/tests/snapshots/session-attachment/*` — keyless input, replay, durable log, and expected output.

Primary modified files:

- `packages/core/tools/src/index.ts`, package READMEs — declaration-mergeable runtime context and provider registration.
- `packages/attachment/attachment/src/types.ts`, `src/index.ts`, `src/error.ts`, package READMEs — generic references, limits, and store methods.
- `packages/attachment/attachment-local/src/index.ts`, `src/store.ts`, package READMEs — file limits and verified generic object operations.
- `packages/llm/llm/src/types.ts`, `packages/llm/llm-deepseek/src/serialize.ts`, `packages/llm/llm-pi-ai/src/context.ts` — durable file blocks and text-only metadata notices.
- `packages/host/apiproxy/src/api/sessions.ts`, `sessions.schema.ts`, `api-proxy.ts`, `session-export.ts`, tests — mixed prompt admission, session authorization, read, and export.
- `packages/client/runtime/src/client/contract/session.ts`, `src/client/sessions/session.ts`, tests — generic attachment RPC result.
- `packages/client/ui-conversation/src/client/input/{contract,facade,hub,machine}.ts`, `src/client/{apply,service}.ts`, `src/client/contract/slots.ts`, `src/client/skeleton/InputBar.tsx`, `src/client/chat/MessageItem.tsx`, styles/locales/tests — generic draft IDs, file serialization, chips, and downloads.
- `packages/mcp/mcp-image-generation/src/index.ts`, tests — shared catalog with unchanged latest-human-image default.
- `packages/session/email-digest/src/index.ts`, `src/mailer.ts`, tests/package docs — `attachment_ids` and Nodemailer buffers.
- `packages/bundle/base/{package.json,cordis.patch.yml}`, `packages/bundle/web-app/package.json`, root TS configs, `pnpm-lock.yaml` — compose the Consumer plugin.
- `docs/subsystems/{attachment,tools}.md`, Chinese counterparts and sidecars, plus generated catalogs/graphs — public architecture and API projections.

### Task 0: Isolate implementation from the dirty Sterling checkout

**Files:**
- Read: `docs/superpowers/specs/2026-08-18-session-tool-attachments-design.md`
- Read: `docs/superpowers/plans/2026-08-18-session-tool-attachments-plugin.md`

- [ ] **Step 1: Invoke the worktree workflow**

Use the `using-git-worktrees` skill before any production edit. Create branch `codex/session-tool-attachments` from the commit containing this plan, and use an isolated worktree chosen by that skill. Do not stage, stash, or alter the existing Sterling worktree's branding and generated-file changes.

- [ ] **Step 2: Verify repository identity and baseline**

Run:

```powershell
git remote get-url origin
git branch --show-current
git log -1 --oneline
git status --short
pnpm exec vitest run packages/attachment/attachment-local/tests packages/core/tools/tests/tools.spec.ts packages/session/email-digest/tests/plugin.spec.ts packages/mcp/mcp-image-generation/tests/image-generation.spec.ts
```

Expected: the remote is `git@github.com:772758976youxiang-lgtm/Sterling.git`, the branch is `codex/session-tool-attachments`, the new worktree is clean, and the focused baseline passes.

### Task 1: Add the attachment-neutral tool runtime context extension

**Files:**
- Modify: `packages/core/tools/src/index.ts`
- Create: `packages/core/tools/tests/run-context.spec.ts`
- Modify: `packages/core/tools/README.md`
- Modify: `packages/core/tools/README.zh.md`
- Modify: `packages/core/tools/README.i18n.yaml`

- [ ] **Step 1: Write failing runtime-context tests**

Create `run-context.spec.ts` using the existing `Context` + `SystemPrompt` + `ToolRuntime` setup. Declaration-merge one test key and prove global registration, scoped shadowing, disposal, duplicate rejection, provider failure normalization, and no model-schema leakage:

```ts
declare module '@deepseek-ai/dsh-tools' {
  interface ToolRunContextMap {
    fixture?: { readonly value: string }
  }
}

const seen: Array<{ readonly value: string } | undefined> = []
ctx.tools.context('fixture', () => Object.freeze({ value: 'global' }))
ctx.tools.register(defineTool({
  name: 'capture-context',
  description: 'capture runtime context',
  parameters: {},
  output: { schema: { type: 'boolean' }, render: () => [{ type: 'text', text: 'captured' }] },
  async execute(_args, exec) {
    seen.push(exec.fixture)
    return true
  },
}))
```

Assert that `ctx.tools.schemas()` contains no `fixture`, a disposed provider yields `undefined`, and two registrations of `fixture` in one scope throw `tools.context("fixture") is already registered in this scope`.

- [ ] **Step 2: Run the new tests and verify the missing API failure**

Run:

```powershell
pnpm exec vitest run packages/core/tools/tests/run-context.spec.ts
```

Expected: FAIL because `ToolRunContextMap` and `ToolRuntime.context()` do not exist.

- [ ] **Step 3: Implement the merge-extensible context registry**

Add these public types beside `ToolRunContext`:

```ts
/** Plugin-owned values materialized once for a tool execution. */
export interface ToolRunContextMap {}

/** One plugin-owned execution value, resolved before pre-execute policy. */
export type ToolRunContextProvider<K extends keyof ToolRunContextMap & string> =
  (execution: Readonly<ToolExecution>) => ToolRunContextMap[K]

export interface ToolRunContext extends ToolExecution, ToolRunContextMap {
  deferContext(context: UserMessage): void
  concludeTurn(): void
}
```

Add a `NamedEntries<ErasedToolRunContextProvider>` table to `ToolLayer`, where the erased internal provider is `(execution: Readonly<ToolExecution>) => unknown`. Include it in `isEmpty()` and expose this effect-owned method:

```ts
context<K extends keyof ToolRunContextMap & string>(
  key: K,
  provider: ToolRunContextProvider<K>,
): () => void {
  if (key === 'signal' || key === 'arguments' || key === 'deferContext' || key === 'concludeTurn') {
    throw new Error(`tools.context(${JSON.stringify(key)}) conflicts with a built-in execution field`)
  }
  return this.layers.effect(
    this.ctx,
    layer => layer.contexts.insert(key, provider as ErasedToolRunContextProvider),
    { label: `tools.context(${JSON.stringify(key)})`, notify: false },
  )
}
```

Resolve global providers followed by the calling scope chain, with the nearest key shadowing its ancestor. Materialize the selected providers inside `createExecution()` after arguments are detached but before `tools/pre-execute`, then spread the frozen result onto the execution object. A thrown provider error must follow the existing final tool-error path.

- [ ] **Step 4: Run focused runtime tests**

Run:

```powershell
pnpm exec vitest run packages/core/tools/tests/run-context.spec.ts packages/core/tools/tests/tools.spec.ts packages/core/tools/tests/scoped.spec.ts packages/core/tools/tests/execution-signal-types.spec.ts
```

Expected: PASS; existing tool context and signal behavior remain unchanged.

- [ ] **Step 5: Document and commit the generic extension point**

Document registration ownership, scope shadowing, one-time materialization, and absence from model schemas in both package READMEs, update the translation sidecar, then run:

```powershell
git add packages/core/tools
git diff --cached --check
git commit -m "feat(tools): add plugin runtime context providers"
```

### Task 2: Generalize the attachment Service Definition and local provider

**Files:**
- Modify: `packages/attachment/attachment/src/types.ts`
- Modify: `packages/attachment/attachment/src/index.ts`
- Modify: `packages/attachment/attachment/src/error.ts`
- Modify: `packages/attachment/attachment-local/src/index.ts`
- Modify: `packages/attachment/attachment-local/src/store.ts`
- Create: `packages/attachment/attachment-local/tests/file.spec.ts`
- Modify: `packages/attachment/attachment-local/tests/index.spec.ts`
- Modify: package READMEs and translation sidecars under both packages.

- [ ] **Step 1: Write failing generic-file store tests**

Cover zero-byte round trips, 25 MiB defaults, per-file and aggregate admission metadata, path-like names, empty MIME fallback, malformed MIME rejection, deduplication, digest corruption, metadata mismatch, missing objects, and cancellation. The happy-path fixture is:

```ts
const data = new TextEncoder().encode('PK\u0003\u0004archive fixture')
const ref = await service.saveFile({
  data,
  mediaType: 'application/zip',
  name: 'C:\\Users\\PC\\Desktop\\bundle.zip',
})
expect(ref).toMatchObject({
  mediaType: 'application/zip',
  bytes: data.byteLength,
  name: 'bundle.zip',
})
await expect(service.readAttachment(ref)).resolves.toEqual({ ref, data })
```

Assert `FILE_TOO_LARGE`, `INVALID_FILE_MEDIA_TYPE`, `ATTACHMENT_CORRUPT`, and `ATTACHMENT_NOT_FOUND` codes exactly.

- [ ] **Step 2: Run the provider tests and verify missing methods**

Run:

```powershell
pnpm exec vitest run packages/attachment/attachment-local/tests/file.spec.ts packages/attachment/attachment-local/tests/index.spec.ts
```

Expected: FAIL because `saveFile`, `validateFile`, `readAttachment`, and `fileLimits` do not exist.

- [ ] **Step 3: Add generic attachment vocabulary**

Add these types while preserving every existing image export:

```ts
export interface AttachmentRef {
  attachmentId: AttachmentId
  mediaType: string
  bytes: number
  name?: string
}

export interface FileAttachmentRef extends AttachmentRef {
  width?: never
  height?: never
}

export interface ImageAttachmentRef extends AttachmentRef {
  mediaType: ImageMediaType
  width: number
  height: number
}

export interface FileAttachmentLimits {
  maxFileBytes: number
  maxFilesPerMessage: number
  maxMessageFileBytes: number
}

export interface SaveFileAttachment {
  data: Uint8Array
  mediaType: string
  name?: string
}

export interface StoredAttachment<T extends AttachmentRef = AttachmentRef> {
  ref: T
  data: Uint8Array
}
```

Extend `AttachmentStore` with `fileLimits`, `validateFile`, `saveFile`, and `readAttachment`; retain `imageLimits`, `validateImage`, `saveImage`, and `readImage` unchanged.

- [ ] **Step 4: Implement bounded generic storage**

In `attachment-local`, add explicit defaults:

```ts
export const DEFAULT_MAX_FILE_BYTES = 25 * 1024 * 1024
export const DEFAULT_MAX_FILES_PER_MESSAGE = 20
export const DEFAULT_MAX_MESSAGE_FILE_BYTES = 100 * 1024 * 1024
```

Extend `Config` and Schemastery with positive integers. Factor the existing content-addressed publication/read helpers inside `store.ts` so image and file writes share durable directory creation, hard-link deduplication, digest verification, and display-name sanitization. `saveFileFile()` accepts zero bytes, normalizes an empty/whitespace media type to `application/octet-stream`, lowercases a valid `type/subtype`, and rejects control characters, parameters, values over 127 characters, or values outside `^[a-z0-9!#$&^_.+-]+/[a-z0-9!#$&^_.+-]+$`; `readAttachmentFile()` verifies identifier, digest, `bytes`, and `mediaType`. `readAttachment()` delegates image references containing numeric `width` and `height` to `readImageFile()` so image metadata verification remains intact.

- [ ] **Step 5: Run attachment package tests**

Run:

```powershell
pnpm exec vitest run packages/attachment/attachment-local/tests
```

Expected: PASS, including all existing image normalization and durability tests.

- [ ] **Step 6: Update package docs and commit**

Document generic files as opaque bounded bytes, no extraction, untrusted names, and all resolved defaults. Then run:

```powershell
git add packages/attachment/attachment packages/attachment/attachment-local
git diff --cached --check
git commit -m "feat(attachment): store bounded generic files"
```

### Task 3: Add durable file content and adapter metadata notices

**Files:**
- Modify: `packages/llm/llm/src/types.ts`
- Modify: `packages/llm/llm-deepseek/src/serialize.ts`
- Modify: `packages/llm/llm-deepseek/tests/serialize.spec.ts`
- Modify: `packages/llm/llm-pi-ai/src/context.ts`
- Modify: `packages/llm/llm-pi-ai/tests/context.spec.ts`
- Modify: `packages/client/runtime/src/client/sessions/conversation.ts`
- Modify: `packages/client/runtime/tests/conversation.client.spec.ts`

- [ ] **Step 1: Write failing content and serialization tests**

Use a durable reference with `attachmentId: sha256:bbbb...`, `name: bundle.zip`, `mediaType: application/zip`, and `bytes: 19`. Assert both text routes serialize:

```text
[Attachment: bundle.zip; media type application/zip; 19 bytes; id sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb. File bytes are available to attachment-aware tools.]
```

Also assert a user message containing text, image, and file preserves source order in notices; pi-ai never calls `readAttachment()` for files; nested tool-result files receive the same notice; and client finalized assistant content classifies `file` as an explicit file block rather than JSON fallback.

- [ ] **Step 2: Run tests to verify `file` is unsupported**

Run:

```powershell
pnpm exec vitest run packages/llm/llm-deepseek/tests/serialize.spec.ts packages/llm/llm-pi-ai/tests/context.spec.ts packages/client/runtime/tests/conversation.client.spec.ts
```

Expected: FAIL because `FileBlock` is absent and serializers ignore it.

- [ ] **Step 3: Add `FileBlock` and deterministic notices**

Add to `dsh-llm`:

```ts
export interface FileBlock {
  type: 'file'
  attachment: FileAttachmentRef
}

export interface ContentBlockMap {
  'text': TextBlock
  'reasoning': ReasoningBlock
  'image': ImageBlock
  'file': FileBlock
  'tool-call': ToolCallBlock
  'tool-result': ToolResultBlock
}
```

Create one private notice formatter per adapter that uses the safe reference metadata and opaque identifier. DeepSeek and text-only pi-ai append notices without reading bytes. Image-capable pi-ai continues reading only `image` blocks and emits file notices as text. Add `{ kind: 'file'; attachment: FileAttachmentRef }` to client `AssistantBlock` and map it explicitly.

- [ ] **Step 4: Run focused serialization tests and commit**

Run:

```powershell
pnpm exec vitest run packages/llm/llm-deepseek/tests/serialize.spec.ts packages/llm/llm-pi-ai/tests/context.spec.ts packages/client/runtime/tests/conversation.client.spec.ts
git add packages/llm packages/client/runtime
git diff --cached --check
git commit -m "feat(llm): preserve durable file attachments"
```

Expected: tests PASS and model-visible metadata is fully reconstructable from logged file blocks.

### Task 4: Implement `dsh-tool-attachment-access` Consumer plugin

**Files:**
- Create: all files under `packages/attachment/tool-attachment-access/`
- Modify: `packages/attachment/README.md`
- Modify: `packages/attachment/README.zh.md`
- Modify: `packages/attachment/README.i18n.yaml`
- Modify: `tsconfig.base.json`
- Modify: `tsconfig.host.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Scaffold the package and failing tests**

Create a standard public package named `@deepseek-ai/dsh-tool-attachment-access` with peers on `dsh-agent`, `dsh-attachment`, `dsh-llm`, `dsh-tools`, and Cordis. In `access.spec.ts`, build an agent-like fixture whose `session.deriveMessages()` returns direct user, assistant, inserted plugin, and nested tool-result file/image blocks.

The expected catalog entry is:

```ts
{
  attachment: zipRef,
  blockType: 'file',
  messageId: 'message-2',
  messageIndex: 1,
  role: 'user',
  sourceKind: 'user',
  eventSeq: 12,
}
```

Assert chronological occurrences are retained, repeated IDs appear twice in `list()`, `read()` touches no bytes before invocation, cross-session/unknown IDs fail with `ATTACHMENT_NOT_IN_SESSION`, reads receive the execution signal, and a catalog snapshot does not change if later messages are appended.

- [ ] **Step 2: Run tests to verify the plugin is absent**

Run:

```powershell
pnpm install
pnpm exec vitest run packages/attachment/tool-attachment-access/tests/access.spec.ts
```

Expected: FAIL until the plugin registers `exec.attachments`.

- [ ] **Step 3: Implement the catalog and lazy reader**

Export these contracts:

```ts
interface ToolAttachmentProvenance {
  readonly messageId: string
  readonly messageIndex: number
  readonly role: Message['role']
  readonly sourceKind: string
  readonly eventSeq?: number
}

export type ToolAttachmentEntry = ToolAttachmentProvenance & (
  | { readonly blockType: 'image'; readonly attachment: ImageAttachmentRef }
  | { readonly blockType: 'file'; readonly attachment: FileAttachmentRef }
)

export interface ToolAttachmentAccess {
  list(): readonly ToolAttachmentEntry[]
  read(attachmentId: AttachmentId): Promise<StoredAttachment>
}
```

Declaration-merge `ToolRunContextMap` with optional `attachments`. Recursively scan `tool-result.content`, freeze entries and the returned array, build an ID-to-reference authorization map, and register the provider. Derive chronology from `session.deriveMessages()` so replaced surface nodes do not leak into the catalog, then best-effort map message IDs back to durable events for `eventSeq` without changing which messages are visible:

```ts
export const inject = ['tools', 'attachments']

export function apply(ctx: Context): void {
  ctx.tools.context('attachments', exec => attachmentAccess(ctx.attachments, exec))
}
```

No agent means an empty catalog whose `read()` always throws `ATTACHMENT_NOT_IN_SESSION`. The package invariant checks that an execution with a referenced attachment receives a catalog entry when this plugin is active; an empty session is an explained empty companion.

- [ ] **Step 4: Run package and core integration tests**

Run:

```powershell
pnpm exec vitest run packages/attachment/tool-attachment-access/tests packages/core/tools/tests/run-context.spec.ts
```

Expected: PASS with no attachment package imported by `dsh-tools`.

- [ ] **Step 5: Document package topology and commit**

Update the attachment group map and package README triplet, then run:

```powershell
git add packages/attachment/tool-attachment-access packages/attachment/README.md packages/attachment/README.zh.md packages/attachment/README.i18n.yaml tsconfig.base.json tsconfig.host.json pnpm-lock.yaml
git diff --cached --check
git commit -m "feat(attachment): expose session files to tools"
```

### Task 5: Generalize host admission, authorization, download, and export

**Files:**
- Modify: `packages/host/apiproxy/src/api/sessions.ts`
- Modify: `packages/host/apiproxy/src/api/sessions.schema.ts`
- Modify: `packages/host/apiproxy/src/api-proxy.ts`
- Modify: `packages/host/apiproxy/src/session-export.ts`
- Modify: `packages/host/apiproxy/tests/api-proxy-view.spec.ts`
- Modify: `packages/host/apiproxy/tests/rpc-schemas.spec.ts`
- Modify: `packages/host/apiproxy/tests/session-export.spec.ts`
- Modify: `packages/client/connection/src/client/fixture.ts`

- [ ] **Step 1: Write failing mixed-admission and authorization tests**

Add a `PromptContentPart` file case:

```ts
{ type: 'file', mediaType: 'application/zip', data: 'UEsDBA==', name: 'bundle.zip' }
```

Assert the host validates every image/file before calling either save method, rejects file count/size atomically, appends `{ type: 'file', attachment }`, authorizes direct and nested tool-result references, rejects an ID present only in another session, returns generic metadata and base64 bytes, and exports `media/<digest>.zip` once when repeated.

- [ ] **Step 2: Run host tests and verify schema rejection**

Run:

```powershell
pnpm exec vitest run packages/host/apiproxy/tests/rpc-schemas.spec.ts packages/host/apiproxy/tests/api-proxy-view.spec.ts packages/host/apiproxy/tests/session-export.spec.ts
```

Expected: FAIL because the wire schema rejects `type: file` and authorization scans images only.

- [ ] **Step 3: Extend wire schemas and atomic admission**

Extend the prompt union with `file`, add a generic attachment-ref schema that discriminates images by `width`/`height`, and change the attachment response to `AttachmentRef`. Add a `fileLimits` session projection beside the unchanged `imageLimits` projection, backed by `ctx.attachments.fileLimits`, so clients can preflight the same deployment values. In `durablePromptContent()`, decode all parts, enforce file count and aggregate limits, call every `validate*` before any `save*`, then save in source order and append text/image/file blocks.

Replace `referencedImage()` with a recursive `referencedAttachment()` over all durable event content and presentation metadata. Call `readAttachment()` only after that session-local scan succeeds. Preserve existing error mapping and avoid exposing provider paths.

- [ ] **Step 4: Generalize export naming**

Collect both image and file blocks recursively. Use the verified image extension table for images; for files derive only a conservative extension from a MIME allowlist (`application/zip` → `.zip`, `application/pdf` → `.pdf`, plain text → `.txt`) and otherwise `.bin`. Never use the display name as a ZIP path.

- [ ] **Step 5: Run host tests and commit**

Run:

```powershell
pnpm exec vitest run packages/host/apiproxy/tests/rpc-schemas.spec.ts packages/host/apiproxy/tests/api-proxy-view.spec.ts packages/host/apiproxy/tests/session-export.spec.ts packages/host/apiproxy/tests/client-handler.spec.ts
git add packages/host/apiproxy packages/client/connection
git diff --cached --check
git commit -m "feat(host): admit and authorize generic attachments"
```

### Task 6: Add generic client drafts, file chips, and history downloads

**Files:**
- Modify: `packages/client/runtime/src/client/contract/session.ts`
- Modify: `packages/client/runtime/src/client/sessions/session.ts`
- Modify: `packages/client/runtime/tests/session.client.spec.ts`
- Create: `packages/client/ui-attachment/src/FileChip.tsx`
- Create: `packages/client/ui-attachment/src/FileChip.module.css`
- Create: `packages/client/ui-attachment/tests/file-chip.client.spec.tsx`
- Modify: `packages/client/ui-attachment/src/index.ts`, `src/css-modules.d.ts`, package README triplet.
- Modify: conversation input/service/UI files and focused tests listed in the file map.

- [ ] **Step 1: Write failing runtime and UI tests**

Assert `ISession.readAttachment()` returns `AttachmentRef`; `FileChip` renders safe name, media type, formatted bytes, remove/download controls; composer paste/drop accepts one PNG plus one ZIP; image previews remain images; ZIP is a file chip; removing either updates one ordered draft list; a file-only draft can submit; and a history chip downloads bytes through the session-authorized RPC.

Use this draft union:

```ts
export type ComposerAttachment =
  | { kind: 'image'; id: DraftAttachmentId; file: File; previewUrl: string }
  | { kind: 'file'; id: DraftAttachmentId; file: File }
```

- [ ] **Step 2: Run client tests and verify image-only assumptions fail**

Run:

```powershell
pnpm exec vitest run packages/client/runtime/tests/session.client.spec.ts packages/client/ui-attachment/tests/file-chip.client.spec.tsx packages/client/ui-conversation/tests/input-bar.client.spec.tsx packages/client/ui-conversation/tests/service-orchestration.client.spec.ts packages/client/ui-conversation/tests/input-machine.client.spec.ts
```

Expected: FAIL on generic RPC typing and image-only draft APIs.

- [ ] **Step 3: Generalize the runtime and input machine vocabulary**

Change `readAttachment()` to return `AttachmentRef`. Mechanically rename internal `imageIds` to `attachmentIds` and `addImages/removeImage/pruneImages` to `addAttachments/removeAttachment/pruneAttachments` across contract, machine, facade, hub, apply wiring, tests, and slot contracts. Add the `fileLimits` projection declaration and read it with `useProjection('fileLimits')`. Keep image-specific names only for image rendering and URL caches.

- [ ] **Step 4: Serialize and validate mixed drafts**

`createDraftAttachments()` classifies supported image MIME/extension cases as `kind: image`; every other `File` is `kind: file`. `serializeAttachments()` emits image parts through existing canonical MIME logic and file parts with `file.type.trim() || 'application/octet-stream'`. Apply projected image limits only to images and projected file limits only to files; reject an added batch atomically.

- [ ] **Step 5: Render draft and history file chips**

Keep `AttachmentRail` and lightbox for the image partition. Render the file partition with `FileChip`; clicking a history download reads the attachment, creates a Blob, uses a sanitized leaf name for `HTMLAnchorElement.download`, clicks once, and revokes the object URL. `MessageItem.contentParts()` returns `{ text, images, files, rest }` so file blocks no longer render as JSON.

- [ ] **Step 6: Run focused client tests**

Run:

```powershell
pnpm exec vitest run packages/client/runtime/tests/session.client.spec.ts packages/client/ui-attachment/tests packages/client/ui-conversation/tests/input-bar.client.spec.tsx packages/client/ui-conversation/tests/input-machine.client.spec.ts packages/client/ui-conversation/tests/input-scenarios.client.spec.tsx packages/client/ui-conversation/tests/service-orchestration.client.spec.ts packages/client/ui-conversation/tests/chat-snapshot.client.spec.tsx
```

Expected: PASS; existing image rail/lightbox snapshots remain semantically unchanged.

- [ ] **Step 7: Update UI docs/locales and commit**

Add English and Chinese strings for generic file limits, remove, and download. Update package README pairs and sidecars, then run:

```powershell
git add packages/client/runtime packages/client/ui-attachment packages/client/ui-conversation
git diff --cached --check
git commit -m "feat(client): upload and render generic attachments"
```

### Task 7: Migrate vision to the common catalog

**Files:**
- Modify: `packages/mcp/mcp-image-generation/package.json`
- Modify: `packages/mcp/mcp-image-generation/src/index.ts`
- Modify: `packages/mcp/mcp-image-generation/tests/image-generation.spec.ts`
- Modify: package README triplet.

- [ ] **Step 1: Replace private-scan tests with catalog tests**

Provide `exec.attachments.list()` entries containing historical images and files. Assert generation reference images and `mcp__vision__analyze_image` choose the newest direct-human image when explicit `images` are omitted, ignore non-images, preserve explicit image arguments, and call `exec.attachments.read()` only for selected IDs.

- [ ] **Step 2: Run tests to verify the current private scan path**

Run:

```powershell
pnpm exec vitest run packages/mcp/mcp-image-generation/tests/image-generation.spec.ts
```

Expected: FAIL because the plugin still calls `latestHumanImages(exec.agent)` and `ctx.attachments.readImage()`.

- [ ] **Step 3: Implement catalog selection without changing schemas**

Delete `latestHumanImages()`. Select entries with `blockType === 'image'`, `role === 'user'`, and `sourceKind === 'user'`, then take the final message occurrence group. Read chosen identifiers through `exec.attachments.read()`, narrow the returned reference to `ImageAttachmentRef`, and retain the current explicit `images` schema and output.

- [ ] **Step 4: Run tests and commit**

Run:

```powershell
pnpm exec vitest run packages/mcp/mcp-image-generation/tests/image-generation.spec.ts
git add packages/mcp/mcp-image-generation
git diff --cached --check
git commit -m "refactor(vision): use session attachment access"
```

### Task 8: Send selected session attachments through email

**Files:**
- Modify: `packages/session/email-digest/package.json`
- Modify: `packages/session/email-digest/src/index.ts`
- Modify: `packages/session/email-digest/src/mailer.ts`
- Modify: `packages/session/email-digest/tests/plugin.spec.ts`
- Modify: package README triplet.

- [ ] **Step 1: Write failing email attachment tests**

Add `attachment_ids` to a tool call with an agent and active attachment plugin. Assert the access reader receives IDs in argument order, Nodemailer input receives:

```ts
attachments: [{
  filename: 'bundle.zip',
  content: Buffer.from(zipBytes),
  contentType: 'application/zip',
}]
```

Assert duplicate IDs are rejected before SMTP, out-of-session IDs produce no send, an abort during read produces no send, path-like names become safe leaf names, missing names use `attachment-<12 digest chars>.bin`, and omitted `attachment_ids` leaves the mail object attachment-free.

- [ ] **Step 2: Run tests and verify schema rejection**

Run:

```powershell
pnpm exec vitest run packages/session/email-digest/tests/plugin.spec.ts
```

Expected: FAIL because the tool schema has no `attachment_ids` and `DigestMail` has no attachments.

- [ ] **Step 3: Extend the tool and transport adapter**

Add this optional parameter:

```ts
attachment_ids: {
  type: 'array',
  items: { type: 'string' },
  description: 'Session attachment ids to include, in email order. Use ids shown in attachment metadata notices.',
}
```

Change execute to receive `exec`, reject duplicates, require `exec.attachments` only when IDs are present, lazily read each branded ID with `Promise.all` after credential/recipient validation but before SMTP side effects, and pass safe metadata to `DigestMail.attachments`. Extend `DigestMail` with a readonly attachment array and map it directly to Nodemailer `attachments`.

- [ ] **Step 4: Run email tests and commit**

Run:

```powershell
pnpm exec vitest run packages/session/email-digest/tests/plugin.spec.ts packages/session/email-digest/tests/domain.spec.ts
git add packages/session/email-digest
git diff --cached --check
git commit -m "feat(email): send session attachments"
```

### Task 9: Compose the plugin and add assembled keyless coverage

**Files:**
- Modify: `packages/bundle/base/package.json`
- Modify: `packages/bundle/base/cordis.patch.yml`
- Modify: `packages/bundle/web-app/package.json`
- Modify: `examples/package.json`
- Create: example and snapshot files listed in the file map.
- Modify: `examples/acp-agent/tests/acp.snapshot.ts`

- [ ] **Step 1: Add composition dependencies and plugin row**

Load `@deepseek-ai/dsh-tool-attachment-access` immediately after `attachment-local` in the base bundle so every downstream tool sees the execution catalog. Add workspace manifest dependencies wherever the raw Cordis overlays resolve the new package.

- [ ] **Step 2: Add a real fixture tool and snapshot scenario**

The fixture tool `fixture__attachment_read` has one required `attachment_id`; its execute function calls `exec.attachments?.list()`, reads the chosen ID, and returns only `{ catalogCount, name, mediaType, bytes, sha256 }`. The scenario's durable input contains an image and `bundle.zip`, and replay calls the fixture with the ZIP identifier. The expected transcript must show the logged file block, tool call, and compact result without embedding file bytes in model context.

- [ ] **Step 3: Run the keyless snapshot in replay and refresh modes**

Run:

```powershell
pnpm exec vitest run --config vitest.snapshot.config.ts examples/acp-agent/tests/acp.snapshot.ts -t "session attachment"
pnpm run test:snapshot:refresh -- -t "session attachment"
git diff -- examples/acp-agent/tests/snapshots/session-attachment
```

Expected: replay PASS after refresh; the diff contains deterministic IDs/metadata and no base64 payload in `stdout.expected.jsonl`.

- [ ] **Step 4: Verify Loader composition and commit**

Run:

```powershell
pnpm run verify-cordis-config
pnpm exec vitest run packages/bundle/base/tests/base.spec.ts
pnpm exec vitest run --config vitest.snapshot.config.ts examples/acp-agent/tests/acp.snapshot.ts -t "session attachment"
git add packages/bundle/base packages/bundle/web-app examples pnpm-lock.yaml
git diff --cached --check
git commit -m "feat(bundle): compose tool attachment access"
```

### Task 10: Record the decision, update generated docs, and run final verification

**Files:**
- Create: Agent Note triplet listed in the file map.
- Modify: `docs/subsystems/attachment.md`, `.zh.md`, `.i18n.yaml`
- Modify: `docs/subsystems/tools.md`, `.zh.md`, `.i18n.yaml`
- Regenerate: `docs/config-catalog.md`, `docs/config-catalog.zh.md`, `docs/module-graph.md`, `docs/module-graph.zh.md`, `docs/capability-seams.md`, `docs/capability-seams.zh.md`, `docs/tool-catalog.md`, `docs/tool-catalog.zh.md`, `apps/cli/composition.md`, and other generator-owned outputs.

- [ ] **Step 1: Invoke Agent Note and prose workflows**

Use `dsh-archive-agent-notes` before adding the note, confirm no active note already owns session attachment access, then use `dsh-prose-standard` and `dsh-doc-standards`. Record the shipped plugin seam, session-reference authorization, lazy reads, why the agent loop was not changed, why archives remain opaque, and why arbitrary workspace materialization was rejected. Add the Chinese counterpart and sidecar.

- [ ] **Step 2: Update hand-authored subsystem documentation**

In attachment docs, specify generic/file/image references, local limits, authorization, and the Consumer package. In tools docs, specify `ToolRunContextMap`, `tools.context()`, one-time materialization, scope behavior, and model-schema invisibility. Keep English/Chinese section structure matched and regenerate sidecars.

- [ ] **Step 3: Regenerate owned projections**

Run:

```powershell
pnpm run gen-config-catalog
pnpm run gen-tool-catalog
pnpm run gen-doc-graphs
pnpm run gen-module-graph
pnpm run gen-cordis-api
pnpm run gen-client-catalog
pnpm run gen-third-party-notices
```

Expected: generated outputs include `dsh-tool-attachment-access`, new attachment limits, `attachment_ids`, runtime context APIs, and dependency edges. Do not hand-edit generated sections.

- [ ] **Step 4: Run the focused behavior suite**

Run:

```powershell
pnpm exec vitest run packages/core/tools/tests/run-context.spec.ts packages/attachment/attachment-local/tests packages/attachment/tool-attachment-access/tests packages/llm/llm-deepseek/tests/serialize.spec.ts packages/llm/llm-pi-ai/tests/context.spec.ts packages/host/apiproxy/tests/rpc-schemas.spec.ts packages/host/apiproxy/tests/api-proxy-view.spec.ts packages/host/apiproxy/tests/session-export.spec.ts packages/client/runtime/tests/session.client.spec.ts packages/client/ui-attachment/tests packages/client/ui-conversation/tests/input-bar.client.spec.tsx packages/client/ui-conversation/tests/input-machine.client.spec.ts packages/client/ui-conversation/tests/service-orchestration.client.spec.ts packages/mcp/mcp-image-generation/tests/image-generation.spec.ts packages/session/email-digest/tests/plugin.spec.ts
pnpm exec vitest run --config vitest.snapshot.config.ts examples/acp-agent/tests/acp.snapshot.ts -t "session attachment"
```

Expected: every listed test passes.

- [ ] **Step 5: Run static, package, and documentation gates**

Use `dsh-pre-push-checks` to confirm the smallest final gate set for the complete diff, then run at least:

```powershell
pnpm run typecheck
pnpm run lint
pnpm run build
pnpm run hygiene
pnpm run doc-sync
git diff --check
```

Expected: all commands exit 0. If a gate fails because of a pre-existing unrelated worktree change, record the exact failure and rerun from the isolated feature worktree before diagnosing the feature.

- [ ] **Step 6: Verify the assembled Web application manually**

Start the real profile with `pnpm dsh web`, verify the served app identifies as Sterling/DeepSeek Harness from this worktree, then perform: upload PNG + ZIP, send, inspect both history presentations, ask the model to call the fixture/vision tool using the IDs, and download the ZIP. Confirm no file bytes were eagerly sent to the text model and no archive was extracted.

- [ ] **Step 7: Commit documentation and generated outputs**

Run:

```powershell
git add .agents/notes packages docs apps/cli/composition.md THIRD_PARTY_NOTICES.md pnpm-lock.yaml tsconfig.base.json tsconfig.host.json tsconfig.client.json
git diff --cached --check
git commit -m "docs: document session tool attachments"
git status --short
git log --oneline --decorate -12
```

Expected: the feature worktree is clean and the commit history contains small TDD-oriented commits for core context, storage, durable content, Consumer plugin, host, client, vision, email, composition, and docs.

- [ ] **Step 8: Run completion verification before reporting success**

Invoke `verification-before-completion`, inspect the final command output rather than relying on earlier runs, and report exactly which tests/gates passed. Do not merge, push, or modify the user's dirty main worktree unless the user separately authorizes that integration action.
