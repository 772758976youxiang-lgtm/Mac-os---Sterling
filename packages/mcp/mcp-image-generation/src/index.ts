/** Local image-generation capability exposed in the MCP tool namespace. */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import type { ImageAttachmentRef, ImageMediaType } from '@deepseek-ai/dsh-attachment'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { generateOpenAIImages } from '@deepseek-ai/dsh-llm-pi-ai/src/image-generation.ts'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolResult } from '@deepseek-ai/dsh-tools'

/** Default configured model id for the existing image route. */
export const DEFAULT_IMAGE_MODEL = 'gpt-image-2'
/** Public MCP-style tool name available to text models. */
export const GENERATE_IMAGE_TOOL = 'mcp__image__generate_image'
/** Public MCP-style tool name available to text models. */
export const ANALYZE_IMAGE_TOOL = 'mcp__vision__analyze_image'
/** Settings namespace shown by the MCP management page. */
export const IMAGE_GENERATION_SETTINGS_NAMESPACE = settingsNamespace('mcp-image-generation')
/** API protocols accepted by the visual-recognition provider form. */
export const VISION_API_PROTOCOLS = [
  'openai-completions',
  'openai-responses',
  'anthropic-messages',
  'openai-image-generations',
] as const
type VisionApi = typeof VISION_API_PROTOCOLS[number]

/** API protocols accepted by the image-generation provider form. */
export const IMAGE_API_PROTOCOLS = [
  'openai-completions',
  'openai-responses',
  'anthropic-messages',
  'openai-image-generations',
] as const
type ImageApi = typeof IMAGE_API_PROTOCOLS[number]

/** Cordis plugin name used by Loader diagnostics. */
export const name = 'mcp-image-generation'
/** The tool uses the existing image router, attachment store, and settings. */
export const inject = ['tools', 'llm', 'attachments', 'settings']

/** Configuration for the local image MCP bridge. */
export interface Config {
  /** Optional provider route; when omitted the first route owning `model` is used. */
  provider?: string
  /** Configured OpenAI Image API model id. Defaults to `gpt-image-2`. */
  model?: string
  /** Cooperative upper bound for one image-generation request. */
  timeoutMs?: number
  /** Custom provider id used for visual understanding. */
  visionProvider?: string
  /** Custom provider display name. */
  visionDisplayName?: string
  /** OpenAI-compatible endpoint used for visual understanding. */
  visionBaseURL?: string
  /** Wire protocol used by the custom provider. */
  visionApi?: VisionApi
  /** Credential reference resolved for each vision request. */
  visionApiKeyEnv?: string
  /** Write-only API key slot for schema and settings redaction. */
  visionApiKey?: string
  /** Custom visual model id. */
  visionModel?: string
  /** Maximum output tokens requested from the visual model. */
  visionMaxTokens?: number
  /** Cooperative upper bound for one vision request. */
  visionTimeoutMs?: number
  /** Custom provider id used for image generation (empty = route-based path). */
  imageProvider?: string
  /** Custom provider display name. */
  imageDisplayName?: string
  /** OpenAI-compatible endpoint used for image generation (empty = route-based path). */
  imageBaseURL?: string
  /** Wire protocol used by the custom image provider. */
  imageApi?: ImageApi
  /** Credential reference resolved for each generation request. */
  imageApiKeyEnv?: string
  /** Write-only API key slot for schema and settings redaction. */
  imageApiKey?: string
}

export const Config: z<Config> = z.object({
  provider: z.string().default(''),
  model: z.string().default(DEFAULT_IMAGE_MODEL),
  timeoutMs: z.number().default(120_000),
  visionProvider: z.string().default(''),
  visionDisplayName: z.string().default(''),
  visionBaseURL: z.string().default(''),
  visionApi: z.union([...VISION_API_PROTOCOLS]).default('openai-completions'),
  visionApiKeyEnv: z.string().role('credential-ref').default('STERLING_VISION_API_KEY'),
  visionApiKey: z.string().role('secret'),
  visionModel: z.string().default(''),
  visionMaxTokens: z.number().step(1).min(1).default(2_048),
  visionTimeoutMs: z.number().step(1).min(1).default(120_000),
  imageProvider: z.string().default(''),
  imageDisplayName: z.string().default(''),
  imageBaseURL: z.string().default(''),
  imageApi: z.union([...IMAGE_API_PROTOCOLS]).default('openai-image-generations'),
  imageApiKeyEnv: z.string().role('credential-ref').default('STERLING_IMAGE_API_KEY'),
  imageApiKey: z.string().role('secret'),
})

/** Flat settings projection consumed by the MCP management form. */
export interface VisionSettings {
  visionProvider: string
  visionDisplayName: string
  visionBaseURL: string
  visionApi: string
  visionApiKeyEnv: string
  visionModel: string
  visionMaxTokens: number
  visionTimeoutMs: number
}

interface ImageValue {
  attachmentId: string
  mediaType: ImageMediaType
  bytes: number
  width: number
  height: number
  name?: string
}

interface GenerationValue {
  provider: string
  model: string
  images: ImageValue[]
}

interface VisionValue {
  model: string
  images: number
  text: string
}

function imageValue(ref: ImageAttachmentRef): ImageValue {
  return {
    attachmentId: ref.attachmentId,
    mediaType: ref.mediaType,
    bytes: ref.bytes,
    width: ref.width,
    height: ref.height,
    ...ref.name === undefined ? {} : { name: ref.name },
  }
}

/** Resolve the configured image model without duplicating provider keys or endpoints. */
async function resolveImageRoute(ctx: Context, config: Required<Config>): Promise<{ provider: string; model: string }> {
  const providers = config.provider === ''
    ? ctx.llm.listProviders().map(provider => provider.id)
    : [config.provider]
  for (const provider of providers) {
    const models = await ctx.llm.listModels(provider)
    if (models.some(model => model.id === config.model)) return { provider, model: config.model }
  }
  const route = config.provider === '' ? `for model "${config.model}"` : `at provider "${config.provider}"`
  throw new Error(`image generation is unavailable: no configured image route was found ${route}`)
}

/** Model-facing completion stays textual so a text-only caller never has to consume its generated image. */
function generationText(value: GenerationValue): string {
  return `Generated ${String(value.images.length)} image${value.images.length === 1 ? '' : 's'} with ${value.model} on ${value.provider}. The image is already attached to this result and displayed in the conversation; do not search for, copy, or analyze it unless the user explicitly asks.`
}

/** Find images on the newest human message, skipping user-role runtime context. */
type ImageMessageAgent = {
  session: {
    deriveMessages: () => readonly {
      role: string
      source: { kind: string }
      content: readonly unknown[]
    }[]
  }
}

function latestHumanImages(agent: ImageMessageAgent | undefined): ImageAttachmentRef[] {
  if (agent === undefined) return []
  for (const message of [...agent.session.deriveMessages()].reverse()) {
    if (message.role !== 'user' || message.source.kind !== 'user') continue
    return message.content
      .filter((block): block is { type: 'image'; attachment: ImageAttachmentRef } => (
        typeof block === 'object' && block !== null
        && (block as { type?: unknown }).type === 'image'
        && 'attachment' in block
      ))
      .map(block => block.attachment)
  }
  return []
}

/** Resolve the custom provider form before dispatching any image bytes. */
function resolveVisionRoute(config: Required<Config>): { provider: string; model: string; baseURL: string; api: string } {
  if (config.visionProvider === '' || config.visionBaseURL === '' || config.visionModel === '') {
    throw new Error('image understanding is unavailable: complete the custom provider in 插件 > 视觉识别')
  }
  if (!VISION_API_PROTOCOLS.includes(config.visionApi as VisionApi)) {
    throw new Error(`image understanding does not support the "${config.visionApi}" protocol`)
  }
  return {
    provider: config.visionProvider,
    model: config.visionModel,
    baseURL: config.visionBaseURL,
    api: config.visionApi,
  }
}

/** Resolve a custom provider key at request time so rotation applies without restart. */
async function resolveVisionApiKey(ctx: Context, config: Required<Config>): Promise<string | undefined> {
  const ref = credentialRef(config.visionApiKeyEnv)
  const credentials = ctx.get('credentials')
  if (credentials !== undefined) return (await credentials.resolve(ref))?.value
  const ambient = launchEnvironmentOf(ctx).get(ref)
  return ambient !== undefined && ambient.value.length > 0 ? ambient.value : undefined
}

/** Resolve the image-generation credential the same way the vision tool does. */
async function resolveImageApiKey(ctx: Context, config: Required<Config>): Promise<string | undefined> {
  const ref = credentialRef(config.imageApiKeyEnv)
  const credentials = ctx.get('credentials')
  if (credentials !== undefined) return (await credentials.resolve(ref))?.value
  const ambient = launchEnvironmentOf(ctx).get(ref)
  return ambient !== undefined && ambient.value.length > 0 ? ambient.value : undefined
}

/** Upper bound for one decoded generated raster. */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

/** Decode a `b64_json` raster and refuse a payload above the ceiling. */
function decodeB64Image(b64: string): Uint8Array {
  const bytes = new Uint8Array(Buffer.from(b64, 'base64'))
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error('the image-generation response has an invalid b64_json image')
  }
  return bytes
}

/** Read a provider-returned image URL with the same bound as b64 payloads. */
async function readImageUrl(url: string, signal: AbortSignal): Promise<Uint8Array> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`image-generation response URL answered ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error('the image-generation response URL is empty or exceeds the size ceiling')
  }
  return bytes
}

/** Resolve one raster candidate (decoded b64 or fetched URL) into bytes. */
async function resolveRaster(
  candidate: { b64?: string; url?: string },
  signal: AbortSignal,
): Promise<Uint8Array | null> {
  if (candidate.b64 !== undefined) return decodeB64Image(candidate.b64)
  if (candidate.url !== undefined) return readImageUrl(candidate.url, signal)
  return null
}

/** Save decoded rasters as durable attachments and project the row values. */
async function saveRasters(
  ctx: Context,
  rasters: readonly { bytes: Uint8Array; mediaType: ImageMediaType }[],
  model: string,
): Promise<ImageValue[]> {
  const values: ImageValue[] = []
  for (const raster of rasters) {
    const ref = await ctx.attachments.saveImage({ data: raster.bytes, mediaType: raster.mediaType, name: 'generated.png' })
    values.push(imageValue(ref))
  }
  if (values.length === 0) {
    throw new Error(`image model "${model}" returned no images`)
  }
  return values
}

/** Collect `image_url` / image content blocks into URL candidates. */
function pushImageBlocks(candidates: Array<{ b64?: string; url?: string }>, blocks: unknown): void {
  if (!Array.isArray(blocks)) return
  for (const block of blocks) {
    if (typeof block !== 'object' || block === null) continue
    const value = block as Record<string, unknown>
    const imageUrl = (value.image_url ?? value) as { url?: unknown } | undefined
    if (typeof imageUrl?.url === 'string') candidates.push({ url: imageUrl.url })
    const source = value.source as { url?: unknown } | undefined
    if (typeof source?.url === 'string') candidates.push({ url: source.url })
    if (typeof value.url === 'string') candidates.push({ url: value.url })
  }
}

/** Tolerantly read image rasters from any chat/responses/anthropic reply:
 *  an Image-API-shaped `data` array, `choices[].message` (b64 or content
 *  blocks), `output[]` items, or a top-level `content` block list. */
function replyRasters(body: unknown): Array<{ b64?: string; url?: string }> {
  const candidates: Array<{ b64?: string; url?: string }> = []
  const data = (body as { data?: unknown } | null)?.data
  if (Array.isArray(data)) {
    for (const entry of data as { b64_json?: unknown; url?: unknown }[]) {
      if (typeof entry?.b64_json === 'string') candidates.push({ b64: entry.b64_json })
      else if (typeof entry?.url === 'string') candidates.push({ url: entry.url })
    }
  }
  const message = (body as { choices?: { message?: { content?: unknown; b64_json?: unknown } }[] } | null)
    ?.choices?.[0]?.message
  if (message !== undefined) {
    if (typeof message.b64_json === 'string') candidates.push({ b64: message.b64_json })
    if (typeof message.content === 'string' && /^https?:\/\//i.test(message.content)) {
      candidates.push({ url: message.content })
    } else {
      pushImageBlocks(candidates, message.content)
    }
  }
  const output = (body as { output?: unknown } | null)?.output
  if (Array.isArray(output)) {
    for (const item of output as { content?: unknown; b64_json?: unknown }[]) {
      if (typeof item?.b64_json === 'string') candidates.push({ b64: item.b64_json })
      pushImageBlocks(candidates, item?.content)
    }
  }
  pushImageBlocks(candidates, (body as { content?: unknown } | null)?.content)
  return candidates
}

/** Endpoint path for a generation-capable non-Image-API protocol. */
function generationChatEndpoint(api: ImageApi, baseURL: string): string {
  const path = api === 'openai-responses' ? '/responses'
    : api === 'anthropic-messages' ? '/messages'
      : '/chat/completions'
  return `${baseURL.replace(/\/+$/, '')}${path}`
}

/** Request body for a generation-capable non-Image-API protocol. */
function generationChatBody(api: ImageApi, input: {
  model: string
  prompt: string
  size: string
  quality: string
  n: number
}): unknown {
  // The model-chosen controls travel as top-level fields so an image-capable
  // chat gateway receives the same size/quality/n the Image API path would.
  if (api === 'openai-responses') {
    return { model: input.model, input: input.prompt, size: input.size, quality: input.quality }
  }
  if (api === 'anthropic-messages') {
    return {
      model: input.model, max_tokens: 2_048,
      messages: [{ role: 'user', content: input.prompt }],
      size: input.size, quality: input.quality,
    }
  }
  return {
    model: input.model, messages: [{ role: 'user', content: input.prompt }],
    n: input.n, size: input.size, quality: input.quality,
  }
}

/** Build a failure message that carries the gateway's own reason when it sent one. */
async function statusError(url: string, response: Response): Promise<Error> {
  const raw = await response.text().catch(() => '')
  const detail = raw.trim().slice(0, 300)
  return new Error(detail.length > 0 ? `${url} answered ${response.status}: ${detail}` : `${url} answered ${response.status}`)
}

/** POST one generation request through the selected protocol and return durable rasters. */
async function generateWithProvider(
  ctx: Context,
  input: {
    baseURL: string
    api: ImageApi
    model: string
    prompt: string
    apiKey?: string
    size: string
    quality: string
    n: number
    images: readonly { data: Uint8Array; mediaType: ImageMediaType }[]
    signal: AbortSignal
  },
): Promise<ImageValue[]> {
  const auth = input.apiKey === undefined ? {} : { authorization: `Bearer ${input.apiKey}` }
  if (input.api !== 'openai-image-generations') {
    if (input.images.length > 0) {
      throw new Error(`${input.api} does not support image edits; use openai-image-generations`)
    }
    const url = generationChatEndpoint(input.api, input.baseURL)
    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json', ...auth },
        body: JSON.stringify(generationChatBody(input.api, {
          model: input.model,
          prompt: input.prompt,
          size: input.size,
          quality: input.quality,
          n: input.n,
        })),
        signal: input.signal,
      })
    } catch (error: unknown) {
      throw new Error(`could not reach ${url}`)
    }
    if (!response.ok) throw await statusError(url, response)
    const body = await response.json().catch(() => undefined)
    const rasters = replyRasters(body)
    if (rasters.length === 0) throw new Error(`${url} answered without generated images`)
    const bytes = await Promise.all(rasters.map(candidate => resolveRaster(candidate, input.signal)))
    return saveRasters(
      ctx,
      bytes.filter((value): value is Uint8Array => value !== null).map(bytes => ({ bytes, mediaType: 'image/png' as const })),
      input.model,
    )
  }
  // openai-image-generations: the Image API wire protocol (endpoint, JSON and
  // multipart bodies, headers, b64/URL parsing) is owned by llm-pi-ai, so the
  // bridge only adapts the returned rasters into durable attachments.
  const generated = await generateOpenAIImages({
    baseURL: input.baseURL,
    model: input.model,
    prompt: input.prompt,
    ...input.apiKey === undefined ? {} : { apiKey: input.apiKey },
    headers: {},
    config: {
      // The tool schema constrains size/quality to the protocol literals.
      size: input.size as '1024x1024' | '1536x1024' | '1024x1536' | 'auto',
      quality: input.quality as 'low' | 'medium' | 'high' | 'auto',
      n: input.n,
      responseFormat: 'b64_json',
    },
    ...input.images.length === 0 ? {} : { images: input.images },
    signal: input.signal,
    maxImageBytes: MAX_IMAGE_BYTES,
  })
  return saveRasters(
    ctx,
    generated.map(image => ({ bytes: image.data, mediaType: image.mediaType })),
    input.model,
  )
}

function visionEndpoint(baseURL: string, api: VisionApi): string {
  const path = api === 'openai-responses' ? '/responses'
    : api === 'anthropic-messages' ? '/messages'
      : '/chat/completions'
  return `${baseURL.replace(/\/+$/, '')}${path}`
}

function visionDataUrl(data: Uint8Array, mediaType: ImageMediaType): string {
  return `data:${mediaType};base64,${Buffer.from(data).toString('base64')}`
}

/** Run one visual prompt through the selected custom provider protocol. */
async function analyzeWithProvider(input: {
  baseURL: string
  api: VisionApi
  model: string
  prompt: string
  apiKey?: string
  images: readonly { data: Uint8Array; mediaType: ImageMediaType }[]
  maxTokens: number
  signal: AbortSignal
}): Promise<string> {
  if (input.api === 'openai-image-generations') {
    throw new Error('openai-image-generations is an image-generation protocol and cannot perform visual recognition')
  }
  const imageData = input.images.map(image => ({
    data: visionDataUrl(image.data, image.mediaType),
    mediaType: image.mediaType,
  }))
  const requestBody = input.api === 'openai-responses'
    ? {
      model: input.model,
      max_output_tokens: input.maxTokens,
      input: [{
        role: 'user',
        content: [
          { type: 'input_text', text: input.prompt },
          ...imageData.map(image => ({ type: 'input_image', image_url: image.data })),
        ],
      }],
    }
    : input.api === 'anthropic-messages'
      ? {
        model: input.model,
        max_tokens: input.maxTokens,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: input.prompt },
            ...input.images.map(image => ({
              type: 'image',
              source: {
                type: 'base64',
                media_type: image.mediaType,
                data: Buffer.from(image.data).toString('base64'),
              },
            })),
          ],
        }],
      }
      : {
        model: input.model,
        max_tokens: input.maxTokens,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: input.prompt },
            ...imageData.map(image => ({ type: 'image_url', image_url: { url: image.data } })),
          ],
        }],
      }
  const response = await fetch(visionEndpoint(input.baseURL, input.api), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...(input.api === 'anthropic-messages'
        ? input.apiKey === undefined ? {} : { 'x-api-key': input.apiKey, 'anthropic-version': '2023-06-01' }
        : input.apiKey === undefined ? {} : { authorization: `Bearer ${input.apiKey}` }),
    },
    body: JSON.stringify(requestBody),
    signal: input.signal,
  })
  const body = await response.json().catch(() => undefined) as {
    choices?: { message?: { content?: unknown } }[]
    output_text?: unknown
    output?: { content?: unknown }[]
    content?: unknown
    error?: { message?: unknown }
  } | undefined
  if (!response.ok) {
    const detail = typeof body?.error?.message === 'string' ? `: ${body.error.message}` : ''
    throw new Error(`custom vision request failed (${response.status})${detail}`)
  }
  const textFromContent = (content: unknown): string => {
    if (typeof content === 'string') return content
    if (!Array.isArray(content)) return ''
    return content
      .filter((part): part is { text: string } => typeof part === 'object' && part !== null && typeof (part as { text?: unknown }).text === 'string')
      .map(part => part.text)
      .join('')
  }
  const text = input.api === 'openai-responses'
    ? typeof body?.output_text === 'string'
      ? body.output_text
      : body?.output?.map(item => textFromContent(item.content)).join('') ?? ''
    : input.api === 'anthropic-messages'
      ? textFromContent(body?.content)
      : textFromContent(body?.choices?.[0]?.message?.content)
  const answer = text.trim()
  if (answer === '') throw new Error(`image understanding model "${input.model}" returned no text`)
  return answer
}

/** Register the local MCP-shaped `generate_image` tool. */
export function apply(ctx: Context, config: Config): void {
  // MCP runs alongside agent-scoped tool registries; settings are owned by
  // the application root so the Web Settings API can describe this namespace.
  const settings = ctx.root.get('settings') ?? ctx.get('settings')
  let current: () => Config = () => config
  if (settings !== undefined) {
    const settingsScope = settings.register(IMAGE_GENERATION_SETTINGS_NAMESPACE, Config, { base: config })
    current = () => settingsScope.get()
    settingsScope.watch(() => { current = () => settingsScope.get() })
  }
  const resolved = config as Required<Config>
  if (resolved.model.trim() === '') throw new Error('mcp-image-generation: model must not be empty')
  if (!Number.isFinite(resolved.timeoutMs) || resolved.timeoutMs <= 0) {
    throw new Error('mcp-image-generation: timeoutMs must be a positive finite number')
  }
  ctx.tools.register(defineTool({
    name: GENERATE_IMAGE_TOOL,
    description: 'Create a new image or directly edit/transform images attached to the latest human message. For every image-generation request, call this tool directly: attached source images are forwarded unchanged to the image model, so do not call vision first, inspect attachment ids, or search files. Choose size and quality explicitly for the requested composition: use landscape for multi-view sheets or wide scenes, portrait for tall single-subject layouts, and square otherwise. For edits, describe the requested transformation and what must stay unchanged instead of guessing or restating visual details.',
    parameters: {
      prompt: { type: 'string', required: true, description: 'For a new image, describe the desired result. For an edit, describe the change and the source details that must remain unchanged.' },
      size: {
        type: 'string', required: true,
        enum: ['1024x1024', '1536x1024', '1024x1536', 'auto'],
        description: 'Output dimensions: 1024x1024 is square (1:1), 1536x1024 is landscape (3:2) for multi-view or wide layouts, 1024x1536 is portrait (2:3), and auto lets the provider choose.',
      },
      quality: {
        type: 'string', required: true,
        enum: ['low', 'medium', 'high', 'auto'],
        description: 'Image quality tier. Use high unless the user prioritizes speed or lower cost.',
      },
      count: {
        type: 'integer',
        description: "Number of separate output images, not the number of views within one image. Usually omit this to use the route's configured count (one by default).",
      },
    },
    timeoutMs: resolved.timeoutMs,
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          provider: { type: 'string', required: true },
          model: { type: 'string', required: true },
          images: {
            type: 'array', required: true,
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                attachmentId: { type: 'string', required: true },
                mediaType: { type: 'string', enum: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/heif'], required: true },
                bytes: { type: 'integer', required: true },
                width: { type: 'integer', required: true },
                height: { type: 'integer', required: true },
                name: { type: 'string' },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: generationText(value) }],
      presentationMeta: (_args, value) => ({
        provider: value.provider,
        model: value.model,
        images: value.images.map(image => ({ ...image })),
      }),
    },
    isConcurrencySafe: () => false,
    async execute(args, exec): Promise<GenerationValue> {
      // Read the live settings like the vision tool does, so a model or
      // provider change on the configuration surface applies without a
      // restart — the tool is never locked to its mount-time defaults.
      const active = current() as Required<Config>
      const prompt = args.prompt.trim()
      if (prompt === '') throw new Error('prompt must not be empty')
      if (args.count !== undefined && (!Number.isSafeInteger(args.count) || args.count < 1)) {
        throw new Error('count must be a positive safe integer')
      }
      const sourceImages = latestHumanImages(exec.agent)
      // A configured endpoint makes this a hand-declared Image API provider
      // (Settings > Plugins > Image generation); without one the tool falls
      // back to the configured llm image route.
      if (active.imageBaseURL.trim() !== '') {
        if (active.imageProvider.trim() === '' || active.model.trim() === '') {
          throw new Error('image generation is unavailable: complete the custom provider in 插件 > 图像生成')
        }
        if (!IMAGE_API_PROTOCOLS.includes(active.imageApi as ImageApi)) {
          throw new Error(`image generation does not support the "${active.imageApi}" protocol`)
        }
        const apiKey = await resolveImageApiKey(ctx, active)
        const stored = await Promise.all(sourceImages.map(ref => ctx.attachments.readImage(ref, exec.signal)))
        const images = await generateWithProvider(ctx, {
          baseURL: active.imageBaseURL,
          api: active.imageApi as ImageApi,
          model: active.model,
          prompt,
          ...apiKey === undefined ? {} : { apiKey },
          size: args.size,
          quality: args.quality,
          n: args.count ?? 1,
          images: stored.map(image => ({ data: image.data, mediaType: image.ref.mediaType })),
          signal: exec.signal,
        })
        exec.concludeTurn()
        return { provider: active.imageProvider, model: active.model, images }
      }
      const route = await resolveImageRoute(ctx, active)
      const images: ImageValue[] = []
      const request = {
        ...route,
        purpose: 'image-generation' as const,
        imageGeneration: {
          size: args.size,
          quality: args.quality,
          ...args.count === undefined ? {} : { n: args.count },
        },
        messages: [createUserMessage({
          content: [
            { type: 'text', text: prompt },
            ...sourceImages.map(attachment => ({ type: 'image' as const, attachment })),
          ],
          source: { kind: 'plugin', plugin: name },
        })],
        signal: exec.signal,
      }
      for await (const chunk of ctx.llm.stream(request)) {
        if (chunk.type === 'block-end' && chunk.block.type === 'image') images.push(imageValue(chunk.block.attachment))
        if (chunk.type === 'finish' && chunk.reason.kind === 'error') throw new Error(chunk.reason.failure.message)
        if (chunk.type === 'finish' && chunk.reason.kind === 'aborted') throw new Error(chunk.reason.failure.message)
      }
      if (images.length === 0) throw new Error(`image model "${route.model}" returned no images`)
      exec.concludeTurn()
      return { ...route, images }
    },
    presentCall(args) {
      return { card: 'generic', title: 'Generate image', kind: 'other', rawInput: args.prompt }
    },
    presentResult(_args, result: ToolResult) {
      return result.isError ? undefined : { card: 'generic', title: 'Image generated' }
    },
  }))

  ctx.tools.register(defineTool({
    name: ANALYZE_IMAGE_TOOL,
    description: 'Return textual understanding of images attached to the latest human message using the custom provider configured in 插件 > 视觉识别. Use only for description, OCR, comparison, extraction, or visual questions. Do not use this as preparation for image generation or editing; mcp__image__generate_image receives source images directly.',
    parameters: {
      prompt: { type: 'string', required: true, description: 'What to inspect or extract from the image.' },
      images: {
        type: 'array',
        description: 'Optional explicit durable image references. Usually omit this and the latest human image is selected automatically.',
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            attachmentId: { type: 'string', required: true },
            mediaType: { type: 'string', enum: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/heif'], required: true },
            bytes: { type: 'integer', required: true },
            width: { type: 'integer', required: true },
            height: { type: 'integer', required: true },
          },
        },
      },
    },
    timeoutMs: resolved.visionTimeoutMs,
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          model: { type: 'string', required: true },
          images: { type: 'integer', required: true },
          text: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.text }],
      presentationMeta: (_args, value) => ({ model: value.model, images: value.images }),
    },
    isConcurrencySafe: () => false,
    async execute(args, exec): Promise<VisionValue> {
      const active = current() as Required<Config>
      const prompt = args.prompt.trim()
      if (prompt === '') throw new Error('prompt must not be empty')
      const explicit = Array.isArray(args.images) ? args.images as ImageAttachmentRef[] : []
      const refs = explicit.length > 0 ? explicit : latestHumanImages(exec.agent)
      if (refs.length === 0) throw new Error('image understanding requires an image in the latest human message')
      const route = resolveVisionRoute(active)
      const apiKey = await resolveVisionApiKey(ctx, active)
      const images = await Promise.all(refs.map(async (ref) => {
        const stored = await ctx.attachments.readImage(ref, exec.signal)
        return { data: stored.data, mediaType: stored.ref.mediaType }
      }))
      const text = await analyzeWithProvider({
        baseURL: route.baseURL,
        api: route.api as VisionApi,
        model: route.model,
        ...apiKey === undefined ? {} : { apiKey },
        prompt,
        images,
        maxTokens: active.visionMaxTokens,
        signal: exec.signal,
      })
      return { model: route.model, images: refs.length, text }
    },
    presentCall(args) {
      return { card: 'generic', title: 'Analyze image', kind: 'other', rawInput: args.prompt }
    },
    presentResult(_args, result: ToolResult) {
      return result.isError ? undefined : { card: 'generic', title: 'Image analyzed' }
    },
  }))
}

/** Rehydrate a persisted presentation image reference. */
export function imageRef(value: ImageValue): ImageAttachmentRef {
  return {
    attachmentId: AttachmentId(value.attachmentId),
    mediaType: value.mediaType,
    bytes: value.bytes,
    width: value.width,
    height: value.height,
    ...value.name === undefined ? {} : { name: value.name },
  }
}
